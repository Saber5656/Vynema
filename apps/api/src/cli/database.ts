import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { openDatabase } from "../lib/database.js";
import { removeDatabaseSidecars, restoreDatabaseFromBackup } from "../lib/database-restore.js";
import {
  applyMigrationsWithBackup,
  createTimestampedBackup,
  getMigrationStatus,
} from "../lib/migrations.js";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const migrationsDirectory = fileURLToPath(new URL("../../../migrations/", import.meta.url));
const databasePath = resolve(repositoryRoot, process.env.VYNEMA_DB_PATH ?? ".local/vynema.sqlite");

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function status(): void {
  const database = openDatabase(databasePath);

  try {
    const migrationStatus = getMigrationStatus(database, migrationsDirectory);
    print({
      databasePath,
      currentVersion: migrationStatus.currentVersion,
      latestVersion: migrationStatus.latestVersion,
      pendingMigrations: migrationStatus.pendingMigrations.map((migration) => migration.name),
    });
  } finally {
    database.close();
  }
}

async function migrate(): Promise<void> {
  const database = openDatabase(databasePath);

  try {
    const result = await applyMigrationsWithBackup(database, databasePath, migrationsDirectory);
    print({ databasePath, ...result });
  } finally {
    database.close();
  }
}

async function backup(): Promise<void> {
  const database = openDatabase(databasePath);

  try {
    const backupPath = await createTimestampedBackup(database, databasePath);
    print({ databasePath, backupPath });
  } finally {
    database.close();
  }
}

function inspect(): void {
  const database = openDatabase(databasePath);

  try {
    const migrationStatus = getMigrationStatus(database, migrationsDirectory);
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const config = tables.some((table) => table.name === "platform_config")
      ? (database
          .prepare("SELECT key, value, updated_at, updated_by FROM platform_config ORDER BY key")
          .all() as {
          key: string;
          value: string;
          updated_at: number;
          updated_by: string;
        }[])
      : [];

    print({
      databasePath,
      currentVersion: migrationStatus.currentVersion,
      tables: tables.map((table) => table.name),
      platformConfig: config,
    });
  } finally {
    database.close();
  }
}

async function restore(backupArgument: string | undefined): Promise<void> {
  if (!backupArgument) {
    throw new Error("Usage: db:restore -- <backup-path>");
  }

  const backupPath = resolve(repositoryRoot, backupArgument);

  const { safetyBackupPath, migrationStatus } = await restoreDatabaseFromBackup({
    activeDatabasePath: databasePath,
    backupPath,
    migrationsDirectory,
  });
  print({
    databasePath,
    restoredFrom: backupPath,
    safetyBackupPath,
    currentVersion: migrationStatus.currentVersion,
    pendingMigrations: migrationStatus.pendingMigrations.map((migration) => migration.name),
  });
}

async function reset(confirmed: boolean): Promise<void> {
  if (!confirmed) {
    throw new Error("Reset is destructive. Re-run with: db:reset -- --yes");
  }

  let safetyBackupPath: string | null = null;

  if (existsSync(databasePath)) {
    const current = openDatabase(databasePath);

    try {
      safetyBackupPath = await createTimestampedBackup(current, databasePath, "before-reset");
    } finally {
      current.close();
    }
  }

  rmSync(databasePath, { force: true });
  removeDatabaseSidecars(databasePath);

  const database = openDatabase(databasePath);

  try {
    const result = await applyMigrationsWithBackup(database, databasePath, migrationsDirectory);
    print({ databasePath, safetyBackupPath, ...result });
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);

  switch (command) {
    case "status":
      status();
      return;
    case "migrate":
      await migrate();
      return;
    case "backup":
      await backup();
      return;
    case "inspect":
      inspect();
      return;
    case "restore":
      await restore(argument);
      return;
    case "reset":
      await reset(argument === "--yes");
      return;
    default:
      throw new Error("Usage: database <status|migrate|backup|inspect|restore|reset>");
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown database command failure.";
  process.stderr.write(`Database command failed: ${message}\n`);
  process.exitCode = 1;
}
