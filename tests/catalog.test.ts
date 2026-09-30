import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CatalogError, listDestinations, listHomeCatalog } from "../apps/web/src/server/db/catalog";
import { databasePath, repositoryRoot } from "../scripts/db-path";

let directory: string;
let previous: string | undefined;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "registry-catalog-"));
  previous = process.env.DB_FILE_NAME;
  process.env.DB_FILE_NAME = join(directory, "catalog.sqlite");
});
afterEach(() => {
  if (previous === undefined) {
    delete process.env.DB_FILE_NAME;
  } else {
    process.env.DB_FILE_NAME = previous;
  }
  rmSync(directory, { recursive: true, force: true });
});
function run(script: string): void {
  execFileSync("pnpm", ["exec", "tsx", script], {
    cwd: repositoryRoot,
    env: { ...process.env },
    stdio: "pipe",
  });
}
function setup(): void {
  run("scripts/db-migrate.ts");
  run("scripts/seed.ts");
}
function failure(query: () => unknown, kind: CatalogError["kind"]): void {
  let error: unknown;
  try {
    query();
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(CatalogError);
  expect((error as CatalogError).kind).toBe(kind);
  if (kind === "setup-required") {
    expect((error as CatalogError).message).toContain("pnpm db:setup");
  }
}

it("reads sorted home and full catalogs with curated hotels and exact slug matching", () => {
  setup();
  expect(listHomeCatalog().destinations.map(({ name }) => name)).toEqual([
    "Amalfi Coast",
    "Bali",
    "Bengaluru",
    "Cape Town",
    "Kyoto",
    "The Cyclades",
  ]);
  expect(listHomeCatalog().hotels.map(({ id, name }) => [id, name])).toEqual([
    ["hotel-1-1", "Casa Aurelia"],
    ["hotel-2-1", "Hikari House"],
    ["hotel-3-1", "Uma Verde"],
  ]);
  expect(listDestinations().map(({ name }) => name)).toEqual([
    "Amalfi Coast",
    "Bali",
    "Bengaluru",
    "Cape Town",
    "Kyoto",
    "The Cyclades",
    "Yucatán",
  ]);
  expect(listDestinations("kyoto").map(({ id }) => id)).toEqual(["dest-kyoto"]);
  expect(listDestinations("kyot")).toEqual([]);
  expect(listDestinations("")).toEqual(listDestinations());
});

it("does not create missing databases and rejects malformed slugs before opening a database", () => {
  failure(listHomeCatalog, "setup-required");
  expect(existsSync(databasePath())).toBe(false);
  for (const slug of ["../kyoto", "Kyoto", "a".repeat(81), "kyoto?x=1"]) {
    expect(listDestinations(slug)).toEqual([]);
  }
  expect(existsSync(databasePath())).toBe(false);
});

it("distinguishes unmigrated and unseeded catalogs from corrupt database failures", () => {
  new Database(databasePath()).close();
  failure(() => listDestinations(), "setup-required");
  run("scripts/db-migrate.ts");
  failure(() => listDestinations("kyoto"), "setup-required");
  failure(listHomeCatalog, "setup-required");
  process.env.DB_FILE_NAME = join(directory, "corrupt.sqlite");
  writeFileSync(databasePath(), "not a database");
  failure(listHomeCatalog, "query-failed");
});

it("reports incomplete curated catalogs as requiring setup", () => {
  setup();
  const sqlite = new Database(databasePath());
  try {
    sqlite.prepare("delete from hotels where id = ?").run("hotel-2-1");
  } finally {
    sqlite.close();
  }
  failure(listHomeCatalog, "setup-required");
});

it("reseeds by primary key without deleting unrelated rows", () => {
  setup();
  const sqlite = new Database(databasePath());
  try {
    sqlite.prepare("update destinations set summary = ? where id = ?").run("changed", "dest-kyoto");
    sqlite
      .prepare("insert into destinations (id,slug,name,country,summary,image) values (?,?,?,?,?,?)")
      .run("unrelated", "unrelated", "Unrelated", "US", "Keep me", "/images/hero-1280.webp");
  } finally {
    sqlite.close();
  }
  run("scripts/seed.ts");
  expect(listDestinations("unrelated").map(({ summary }) => summary)).toEqual(["Keep me"]);
  expect(listDestinations("kyoto")[0].summary).toBe(
    "Temple gardens, intimate machiya stays, and a slower rhythm shaped by craft and season.",
  );
});

it("resolves relative database paths against the repository rather than package cwd", () => {
  expect(databasePath("example.db")).toBe(join(repositoryRoot, "example.db"));
  expect(databasePath(join(directory, "absolute.db"))).toBe(join(directory, "absolute.db"));
});
