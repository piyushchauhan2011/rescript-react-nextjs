import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { destinations, hotels } from "../apps/web/src/server/db/schema";
import { destinationSeeds, hotelSeeds } from "./seed-data";
import { databasePath } from "./db-path";

const file = databasePath();
const sqlite = new Database(file);
sqlite.pragma("foreign_keys = ON");

try {
  const db = drizzle(sqlite);
  db.transaction((tx) => {
    for (const destination of destinationSeeds) {
      tx.insert(destinations)
        .values(destination)
        .onConflictDoUpdate({
          target: destinations.id,
          set: {
            slug: destination.slug,
            name: destination.name,
            country: destination.country,
            summary: destination.summary,
            image: destination.image,
          },
        })
        .run();
    }
    for (const hotel of hotelSeeds) {
      tx.insert(hotels)
        .values(hotel)
        .onConflictDoUpdate({
          target: hotels.id,
          set: {
            destinationId: hotel.destinationId,
            slug: hotel.slug,
            name: hotel.name,
            summary: hotel.summary,
            rating: hotel.rating,
            priceFrom: hotel.priceFrom,
            image: hotel.image,
          },
        })
        .run();
    }
  });
  console.log(
    `Seeded ${destinationSeeds.length} destinations and ${hotelSeeds.length} hotels in ${file}`,
  );
} finally {
  sqlite.close();
}
