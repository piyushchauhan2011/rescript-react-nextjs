import { defineConfig } from "drizzle-kit";
import { databasePath } from "./scripts/db-path";

export default defineConfig({
  schema: "./apps/web/src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: databasePath() },
});
