import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { assertDatabaseIntegrity, openDatabase } from "./database.js";
import { createTimestampedBackup, getMigrationStatus, type MigrationStatus } from "./migrations.js";

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

function validateRestoreCandidate(path: string, migrationsDirectory: string): MigrationStatus {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Backup file does not exist: ${path}`);
  }

  const database = openDatabase(path);

  try {
    assertDatabaseIntegrity(database);
    return getMigrationStatus(database, migrationsDirectory);
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

  // Reject incompatible sources before creating a safety backup, then validate
  // the copied candidate again to close the source-validation/copy race.
  validateRestoreCandidate(backupPath, options.migrationsDirectory);
  let safetyBackupPath: string | null = null;

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

  mkdirSync(dirname(activeDatabasePath), { recursive: true });
  const temporaryPath = `${activeDatabasePath}.restore-${randomUUID()}`;
  let migrationStatus: MigrationStatus;

  try {
    copyFileSync(backupPath, temporaryPath);
    migrationStatus = validateRestoreCandidate(temporaryPath, options.migrationsDirectory);
    removeDatabaseSidecars(activeDatabasePath);
    renameSync(temporaryPath, activeDatabasePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  return { safetyBackupPath, migrationStatus };
}
