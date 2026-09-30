import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function databasePath(file = process.env.DB_FILE_NAME): string {
  const configured = file || "local.db";
  return isAbsolute(configured) ? configured : resolve(repositoryRoot, configured);
}
