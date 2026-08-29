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
  getSearchIndexMode,
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

type RestoredMediaBindingMismatchRow = {
  id: string;
  violation: string;
};

type RestoredUploadProvenanceMismatchRow = {
  id: string;
};

type SearchIndexMismatchRow = {
  mismatched_rowid: number;
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

function assertRestoredUploadProvenanceConsistency(database: Database): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('media_blobs', 'upload_capabilities', 'upload_intents') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 3) {
    return;
  }

  const capabilityMismatch = database
    .prepare(
      [
        "SELECT c.id FROM upload_capabilities c",
        "WHERE (c.kind = 'video' AND NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = c.intent_id",
        "AND i.declared_video_bytes = c.expected_size_bytes",
        "AND i.declared_video_sha256 = c.expected_sha256",
        "AND i.declared_mime = c.expected_mime",
        ")) OR (c.kind = 'thumbnail' AND NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = c.intent_id",
        "AND i.declared_thumbnail_bytes = c.expected_size_bytes",
        "AND i.declared_thumbnail_sha256 = c.expected_sha256",
        "AND i.declared_thumbnail_mime = c.expected_mime",
        ")) ORDER BY c.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (capabilityMismatch) {
    throw new Error(
      `Restore candidate upload capability ${capabilityMismatch.id} does not match its intent declaration.`,
    );
  }

  // Blob insertion requires a created intent and an unused capability, but
  // those are transition-time states: the intent may later be finalized and
  // the capability marked used. Restore only replays the durable provenance
  // binding and the claimed-state requirement that cannot legitimately revert.
  const blobMismatch = database
    .prepare(
      [
        "SELECT b.id FROM media_blobs b",
        "WHERE NOT EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = b.intent_id AND c.kind = b.kind",
        "AND c.claimed_at IS NOT NULL",
        "AND c.expected_size_bytes = b.size_bytes",
        "AND c.expected_sha256 = b.sha256 AND c.expected_mime = b.mime",
        ") ORDER BY b.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (blobMismatch) {
    throw new Error(
      `Restore candidate media blob ${blobMismatch.id} does not match a claimed upload capability.`,
    );
  }

  const usedCapabilityOutsideAuthorizationWindow = database
    .prepare(
      [
        "SELECT c.id FROM upload_capabilities c",
        "WHERE c.used_at IS NOT NULL AND (",
        "c.used_at > c.expires_at OR NOT EXISTS (",
        "SELECT 1 FROM upload_intents i",
        "WHERE i.id = c.intent_id AND i.expires_at >= c.used_at",
        ")) ORDER BY c.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (usedCapabilityOutsideAuthorizationWindow) {
    throw new Error(
      `Restore candidate used upload capability ${usedCapabilityOutsideAuthorizationWindow.id} was used outside its authorization window.`,
    );
  }

  const usedCapabilityWithoutBlob = database
    .prepare(
      [
        "SELECT c.id FROM upload_capabilities c",
        "WHERE c.used_at IS NOT NULL AND NOT EXISTS (",
        "SELECT 1 FROM media_blobs b",
        "WHERE b.intent_id = c.intent_id AND b.kind = c.kind",
        "AND b.size_bytes = c.expected_size_bytes",
        "AND b.sha256 = c.expected_sha256 AND b.mime = c.expected_mime",
        ") ORDER BY c.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (usedCapabilityWithoutBlob) {
    throw new Error(
      `Restore candidate used upload capability ${usedCapabilityWithoutBlob.id} has no matching media blob.`,
    );
  }
}

function assertRestoredMediaBindingConsistency(database: Database): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('media_blobs', 'upload_intents', 'videos') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 3) {
    return;
  }

  const mismatch = database
    .prepare(
      [
        "SELECT v.id, CASE",
        "WHEN NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id",
        "AND i.agent_id = v.agent_id AND i.channel_id = v.channel_id",
        ") THEN 'intent ownership binding'",
        "WHEN v.video_blob_id IS NOT NULL AND NOT EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.video_blob_id",
        "AND b.intent_id = v.intent_id AND b.kind = 'video'",
        "AND b.size_bytes = v.size_bytes AND b.sha256 = v.sha256 AND b.mime = 'video/mp4'",
        ") THEN 'video blob binding'",
        "WHEN v.thumbnail_blob_id IS NOT NULL AND NOT EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.thumbnail_blob_id",
        "AND b.intent_id = v.intent_id AND b.kind = 'thumbnail'",
        ") THEN 'thumbnail blob binding'",
        "END AS violation FROM videos v",
        "WHERE NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id",
        "AND i.agent_id = v.agent_id AND i.channel_id = v.channel_id",
        ") OR (v.video_blob_id IS NOT NULL AND NOT EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.video_blob_id",
        "AND b.intent_id = v.intent_id AND b.kind = 'video'",
        "AND b.size_bytes = v.size_bytes AND b.sha256 = v.sha256 AND b.mime = 'video/mp4'",
        ")) OR (v.thumbnail_blob_id IS NOT NULL AND NOT EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.thumbnail_blob_id",
        "AND b.intent_id = v.intent_id AND b.kind = 'thumbnail'",
        ")) ORDER BY v.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredMediaBindingMismatchRow | undefined;

  if (mismatch) {
    throw new Error(`Restore candidate video ${mismatch.id} has invalid ${mismatch.violation}.`);
  }
}

function assertRestoredSearchIndexConsistency(database: Database): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('videos', 'videos_fts') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 2) {
    return;
  }

  if (getSearchIndexMode(database) === "fts5") {
    try {
      // rank=1 makes FTS5 compare its internal index with the external
      // `videos` content table instead of checking only its own structures.
      database
        .prepare("INSERT INTO videos_fts(videos_fts, rank) VALUES('integrity-check', 1)")
        .run();
      return;
    } catch (cause) {
      throw new Error("Restore candidate search index contents do not match videos.", {
        cause,
      });
    }
  }

  const mismatch = database
    .prepare(
      [
        "SELECT mismatched_rowid FROM (",
        "SELECT v.rowid AS mismatched_rowid FROM videos v",
        "LEFT JOIN videos_fts f ON f.rowid = v.rowid",
        "WHERE f.rowid IS NULL",
        "OR CAST(f.title AS BLOB) <> CAST(v.title AS BLOB)",
        "OR CAST(f.description AS BLOB) <> CAST(v.description AS BLOB)",
        "UNION ALL",
        "SELECT f.rowid AS mismatched_rowid FROM videos_fts f",
        "LEFT JOIN videos v ON v.rowid = f.rowid",
        "WHERE v.rowid IS NULL",
        ") LIMIT 1",
      ].join(" "),
    )
    .get() as SearchIndexMismatchRow | undefined;

  if (mismatch) {
    throw new Error("Restore candidate search index contents do not match videos.");
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
    assertRestoredUploadProvenanceConsistency(database);
    assertRestoredMediaBindingConsistency(database);
    assertRestoredPublicationEvidence(database);
    assertRestoredSearchIndexConsistency(database);
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
