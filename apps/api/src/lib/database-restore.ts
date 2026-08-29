import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  assertDatabaseIntegrity,
  backupDatabase,
  openDatabase,
  type Database,
} from "./database.js";
import {
  assertCanonicalMigratedSchema,
  createTimestampedBackup,
  getMigrationStatus,
  type MigrationStatus,
} from "./migrations.js";

export type RestoreDatabaseOptions = {
  activeDatabasePath: string;
  backupPath: string;
  migrationsDirectory: string;
};

export type RestoreDatabaseResult = {
  safetyBackupPath: string | null;
  migrationStatus: MigrationStatus;
};

export function removeDatabaseSidecars(path: string): void {
  rmSync(`${path}-shm`, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-journal`, { force: true });
}

function assertPristineVersionZeroDatabase(
  database: Database,
  migrationStatus: MigrationStatus,
): void {
  if (migrationStatus.currentVersion !== 0) {
    return;
  }

  const applicationId = database.prepare("PRAGMA application_id").get() as
    { application_id: number } | undefined;
  const schemaObject = database
    .prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name LIMIT 1")
    .get() as { name: string } | undefined;

  if (applicationId?.application_id !== 0 || schemaObject) {
    throw new Error(
      "A migration version 0 restore source must be a pristine SQLite database with application_id 0.",
    );
  }
}

function validateRestoreCandidate(path: string, migrationsDirectory: string): MigrationStatus {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Backup file does not exist: ${path}`);
  }

  const database = openDatabase(path);

  try {
    assertDatabaseIntegrity(database);
    const migrationStatus = getMigrationStatus(database, migrationsDirectory);
    assertPristineVersionZeroDatabase(database, migrationStatus);
    assertCanonicalMigratedSchema(database, migrationsDirectory, migrationStatus.currentVersion);
    return migrationStatus;
  } finally {
    database.close();
  }
}

export async function restoreDatabaseFromBackup(
  options: RestoreDatabaseOptions,
): Promise<RestoreDatabaseResult> {
  const activeDatabasePath = resolve(options.activeDatabasePath);
  const backupPath = resolve(options.backupPath);

  if (backupPath === activeDatabasePath) {
    throw new Error("The restore source must not be the active database.");
  }

  // Reject incompatible sources before creating a safety backup. The source
  // may be a live WAL database, so create the candidate through SQLite's
  // transactional VACUUM INTO snapshot rather than copying only its main file.
  validateRestoreCandidate(backupPath, options.migrationsDirectory);
  mkdirSync(dirname(activeDatabasePath), { recursive: true });
  const temporaryPath = `${activeDatabasePath}.restore-${randomUUID()}`;
  let migrationStatus: MigrationStatus;
  let safetyBackupPath: string | null = null;

  try {
    const source = openDatabase(backupPath);

    try {
      await backupDatabase(source, temporaryPath);
    } finally {
      source.close();
    }

    // Validate the exact snapshot that can be installed before changing any
    // active state. Revalidate it after the safety backup to fail closed if a
    // local process tampers with the candidate during that interval.
    migrationStatus = validateRestoreCandidate(temporaryPath, options.migrationsDirectory);

    if (existsSync(activeDatabasePath)) {
      const current = openDatabase(activeDatabasePath);

      try {
        safetyBackupPath = await createTimestampedBackup(
          current,
          activeDatabasePath,
          "before-restore",
        );
      } finally {
        current.close();
      }
    }

    migrationStatus = validateRestoreCandidate(temporaryPath, options.migrationsDirectory);
    removeDatabaseSidecars(activeDatabasePath);
    renameSync(temporaryPath, activeDatabasePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  return { safetyBackupPath, migrationStatus };
}
