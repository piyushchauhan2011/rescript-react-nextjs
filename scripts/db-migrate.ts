import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import { databasePath, repositoryRoot } from "./db-path";

const file = databasePath();
const sqlite = new Database(file);
try {
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: resolve(repositoryRoot, "drizzle") });
  console.log(`Migrated catalog in ${file}`);
} finally {
  sqlite.close();
}
