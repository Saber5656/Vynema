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

type SchemaTableRow = {
  name: string;
};

type VideoWithoutApprovalRow = {
  id: string;
};

export function removeDatabaseSidecars(path: string): void {
  rmSync(`${path}-shm`, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-journal`, { force: true });
}

function assertRestoredPublicationEvidence(database: Database): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('videos', 'moderation_reviews') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 2) {
    return;
  }

  const videoWithoutApproval = database
    .prepare(
      [
        "SELECT v.id FROM videos v",
        "WHERE v.status IN ('published', 'taken_down')",
        "AND NOT EXISTS (",
        "SELECT 1 FROM moderation_reviews r",
        "WHERE r.video_id = v.id AND r.decision = 'approved'",
        ")",
        "ORDER BY v.id LIMIT 1",
      ].join(" "),
    )
    .get() as VideoWithoutApprovalRow | undefined;

  if (videoWithoutApproval) {
    throw new Error(
      `Restore candidate video ${videoWithoutApproval.id} is published or taken down without retained approval evidence.`,
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
    assertCanonicalMigratedSchema(database, migrationsDirectory, migrationStatus.currentVersion);
    assertRestoredPublicationEvidence(database);
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
