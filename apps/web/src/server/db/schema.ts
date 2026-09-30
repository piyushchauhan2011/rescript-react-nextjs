import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const destinations = sqliteTable("destinations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  summary: text("summary").notNull(),
  image: text("image").notNull(),
});

export const hotels = sqliteTable("hotels", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id")
    .notNull()
    .references(() => destinations.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  rating: integer("rating").notNull(),
  priceFrom: integer("price_from").notNull(),
  image: text("image").notNull(),
});
