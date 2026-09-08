import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { backupDatabase, openDatabase } from "./database.js";
import { createTimestampedBackup, getMigrationStatus, type MigrationStatus } from "./migrations.js";

const REVIEW_AUTHORIZATION_SNAPSHOT_VERSION = 4;
const TAKEDOWN_REASON_VERSION = 5;

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

function restorePathsReferenceSameFile(activeDatabasePath: string, backupPath: string): boolean {
  if (!existsSync(activeDatabasePath) || !existsSync(backupPath)) {
    return false;
  }

  const activeRealPath = realpathSync(activeDatabasePath);
  const backupRealPath = realpathSync(backupPath);
  if (activeRealPath === backupRealPath) {
    return true;
  }

  const activeStats = statSync(activeRealPath);
  const backupStats = statSync(backupRealPath);
  return activeStats.dev === backupStats.dev && activeStats.ino === backupStats.ino;
}

function validateRestoreCandidate(path: string, migrationsDirectory: string): MigrationStatus {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Backup file does not exist: ${path}`);
  }

  const database = openDatabase(path);

  try {
    const status = getMigrationStatus(database, migrationsDirectory);

    if (
      status.currentVersion > 0 &&
      status.currentVersion < REVIEW_AUTHORIZATION_SNAPSHOT_VERSION &&
      status.latestVersion >= REVIEW_AUTHORIZATION_SNAPSHOT_VERSION &&
      database
        .prepare("SELECT 1 FROM videos WHERE status IN ('published', 'taken_down') LIMIT 1")
        .get()
    ) {
      throw new Error(
        "Restore candidate has legacy published or taken-down videos without provable reviewer authorization snapshots.",
      );
    }

    if (
      status.currentVersion > 0 &&
      status.currentVersion < TAKEDOWN_REASON_VERSION &&
      status.latestVersion >= TAKEDOWN_REASON_VERSION &&
      database
        .prepare(
          [
            "SELECT 1 FROM videos WHERE (status = 'taken_down' AND (",
            "typeof(takedown_reason) <> 'text'",
            "OR trim(takedown_reason, char(9, 10, 11, 12, 13, 32)) = ''",
            ")) OR (status <> 'taken_down' AND takedown_reason IS NOT NULL)",
            "LIMIT 1",
          ].join(" "),
        )
        .get()
    ) {
      throw new Error("Restore candidate has invalid legacy takedown reason evidence.");
    }

    return status;
  } finally {
    database.close();
  }
}

export async function restoreDatabaseFromBackup(
  options: RestoreDatabaseOptions,
): Promise<RestoreDatabaseResult> {
  const activeDatabasePath = resolve(options.activeDatabasePath);
  const backupPath = resolve(options.backupPath);

  if (
    backupPath === activeDatabasePath ||
    restorePathsReferenceSameFile(activeDatabasePath, backupPath)
  ) {
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
        safetyBackupPath = await createTimestampedBackup(current, activeDatabasePath, {
          label: "before-restore",
          // Preserve the current database even when schema/data drift is
          // the reason a verified restore is needed. The low-level helper
          // still enforces SQLite and foreign-key integrity.
          validation: { kind: "integrity-only" },
        });
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
