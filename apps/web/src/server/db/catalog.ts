import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { destination, hotel, homeCatalog } from "@repo/core/Catalog";
import { databasePath } from "../../../../../scripts/db-path";
import { destinations, hotels } from "./schema";

const setupHint = "Catalog database is missing or empty. Run pnpm db:setup to migrate and seed it.";
const curatedHotelIds = ["hotel-1-1", "hotel-2-1", "hotel-3-1"];

export class CatalogError extends Error {
  constructor(
    readonly kind: "setup-required" | "query-failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CatalogError";
  }
}

function catalogError(cause: unknown, setupMessage: string): CatalogError {
  if (cause instanceof CatalogError) {
    return cause;
  }
  const sqliteError = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
  if (
    sqliteError instanceof Error &&
    /no such table|unable to open database file/i.test(sqliteError.message)
  ) {
    return new CatalogError("setup-required", setupMessage, { cause });
  }
  return new CatalogError(
    "query-failed",
    cause instanceof Error ? cause.message : "Catalog query failed",
    { cause },
  );
}

function withCatalog<T>(query: (db: BetterSQLite3Database) => T): T {
  const file = databasePath();
  const setupMessage = `${setupHint} (DB_FILE_NAME=${file})`;
  let sqlite: Database.Database | undefined;
  let result!: T;
  let failure: CatalogError | undefined;
  try {
    if (!existsSync(file)) {
      throw new CatalogError("setup-required", setupMessage);
    }
    sqlite = new Database(file, { readonly: true, fileMustExist: true });
    result = query(drizzle(sqlite));
  } catch (cause) {
    failure = catalogError(cause, setupMessage);
  } finally {
    try {
      sqlite?.close();
    } catch (cause) {
      failure ??= catalogError(cause, setupMessage);
    }
  }
  if (failure) {
    throw failure;
  }
  return result;
}

const destinationProjection = {
  id: destinations.id,
  slug: destinations.slug,
  name: destinations.name,
  country: destinations.country,
  summary: destinations.summary,
  image: destinations.image,
};
const hotelProjection = {
  id: hotels.id,
  destinationId: hotels.destinationId,
  slug: hotels.slug,
  name: hotels.name,
  summary: hotels.summary,
  rating: hotels.rating,
  priceFrom: hotels.priceFrom,
  image: hotels.image,
};

export function listHomeCatalog(): homeCatalog {
  return withCatalog((db) => {
    const homeDestinations: destination[] = db
      .select(destinationProjection)
      .from(destinations)
      .orderBy(asc(destinations.name))
      .limit(6)
      .all();
    if (homeDestinations.length < 6) {
      throw new CatalogError("setup-required", setupHint);
    }
    const featuredHotels: hotel[] = db
      .select(hotelProjection)
      .from(hotels)
      .where(inArray(hotels.id, curatedHotelIds))
      .orderBy(sql`case ${hotels.id} when 'hotel-1-1' then 0 when 'hotel-2-1' then 1 else 2 end`)
      .all();
    if (featuredHotels.length !== curatedHotelIds.length) {
      throw new CatalogError("setup-required", setupHint);
    }
    return { destinations: homeDestinations, hotels: featuredHotels };
  });
}

export function listDestinations(slug?: string): destination[] {
  if (slug && !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return [];
  }
  const filter = slug || undefined;
  return withCatalog((db) => {
    const result: destination[] = db
      .select(destinationProjection)
      .from(destinations)
      .where(filter === undefined ? undefined : eq(destinations.slug, filter))
      .orderBy(asc(destinations.name))
      .all();
    if (result.length === 0) {
      if (
        filter === undefined ||
        db.select({ id: destinations.id }).from(destinations).limit(1).all().length === 0
      ) {
        throw new CatalogError("setup-required", setupHint);
      }
    }
    return result;
  });
}
