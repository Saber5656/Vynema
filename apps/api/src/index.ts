export { buildApp } from "./app.js";
export type { AppBindings, Env } from "./env.js";
export { assertDatabaseIntegrity, backupDatabase, openDatabase } from "./lib/database.js";
export type { Database } from "./lib/database.js";
export {
  applyMigrations,
  applyMigrationsWithBackup,
  createTimestampedBackup,
  discoverMigrations,
  getMigrationStatus,
} from "./lib/migrations.js";
export { ConfigUnavailableError, getConfig } from "./lib/repo/config.js";
export type { PlatformConfig } from "./lib/repo/config.js";
export { all, newId, nowMs, one, transaction } from "./lib/repo/db.js";
export type * from "./lib/repo/types.js";
