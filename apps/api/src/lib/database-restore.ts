import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
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

type VideoWithInvalidPublicationEvidenceRow = {
  id: string;
};

type RestoredMediaBindingMismatchRow = {
  id: string;
  violation: string;
};

type RestoredUploadProvenanceMismatchRow = {
  id: string;
};

type RestoredRateLimitMismatchRow = {
  key: string;
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
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('moderation_reviews', 'upload_intents', 'videos') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 3) {
    return;
  }

  const videoWithInvalidPublicationEvidence = database
    .prepare(
      [
        "SELECT v.id FROM videos v",
        "WHERE v.status IN ('published', 'taken_down')",
        "AND (v.published_at < v.created_at",
        "OR (v.status = 'taken_down' AND v.taken_down_at < v.published_at)",
        "OR NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id",
        "AND i.status = 'finalized' AND i.finalized_at <= v.published_at",
        ")",
        "OR NOT EXISTS (",
        "SELECT 1 FROM moderation_reviews r",
        "WHERE r.video_id = v.id AND r.decision = 'approved'",
        "AND r.created_at <= v.published_at",
        "))",
        "ORDER BY v.id LIMIT 1",
      ].join(" "),
    )
    .get() as VideoWithInvalidPublicationEvidenceRow | undefined;

  if (videoWithInvalidPublicationEvidence) {
    throw new Error(
      `Restore candidate video ${videoWithInvalidPublicationEvidence.id} is published or taken down without retained approval evidence or a valid publication timeline.`,
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

  const claimedCapabilityOutsideAuthorizationWindow = database
    .prepare(
      [
        "SELECT c.id FROM upload_capabilities c",
        "JOIN upload_intents i ON i.id = c.intent_id",
        "WHERE c.claimed_at IS NOT NULL AND (",
        "c.claimed_at < c.created_at OR c.claimed_at > c.expires_at",
        "OR c.claimed_at < i.created_at OR c.claimed_at > i.expires_at",
        ") ORDER BY c.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (claimedCapabilityOutsideAuthorizationWindow) {
    throw new Error(
      `Restore candidate claimed upload capability ${claimedCapabilityOutsideAuthorizationWindow.id} was claimed outside its authorization window.`,
    );
  }

  // Blob insertion requires a claimed capability. Expired capability rows may
  // later be purged, so a retained finalized-video reference is also durable
  // provenance evidence for a blob whose capability no longer exists.
  const blobMismatch = database
    .prepare(
      [
        "SELECT b.id FROM media_blobs b",
        "WHERE NOT EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "JOIN upload_intents i ON i.id = c.intent_id",
        "WHERE c.intent_id = b.intent_id AND c.kind = b.kind",
        "AND c.claimed_at IS NOT NULL",
        "AND b.created_at >= c.claimed_at AND b.created_at <= c.expires_at",
        "AND b.created_at <= i.expires_at",
        "AND c.expected_size_bytes = b.size_bytes",
        "AND c.expected_sha256 = b.sha256 AND c.expected_mime = b.mime",
        ") AND NOT EXISTS (",
        "SELECT 1 FROM videos v",
        "JOIN upload_intents i ON i.id = v.intent_id",
        "WHERE i.status = 'finalized' AND b.intent_id = i.id",
        "AND NOT EXISTS (SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = b.intent_id AND c.kind = b.kind)",
        "AND b.created_at >= i.created_at AND b.created_at <= i.finalized_at",
        "AND v.provenance_json = i.provenance_json AND (",
        "(b.kind = 'video' AND v.video_blob_id = b.id",
        "AND b.size_bytes = i.declared_video_bytes",
        "AND b.sha256 = i.declared_video_sha256 AND b.mime = i.declared_mime)",
        "OR (b.kind = 'thumbnail' AND v.thumbnail_blob_id = b.id",
        "AND b.size_bytes = i.declared_thumbnail_bytes",
        "AND b.sha256 = i.declared_thumbnail_sha256",
        "AND b.mime = i.declared_thumbnail_mime)",
        ")",
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
        "c.claimed_at IS NULL OR c.used_at < c.claimed_at",
        "OR c.used_at > c.expires_at OR NOT EXISTS (",
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
        "AND b.created_at >= c.claimed_at AND b.created_at <= c.used_at",
        "AND b.size_bytes = c.expected_size_bytes",
        "AND b.sha256 = c.expected_sha256 AND b.mime = c.expected_mime",
        ") AND NOT EXISTS (",
        "SELECT 1 FROM upload_intents i",
        "LEFT JOIN videos v ON v.intent_id = i.id",
        "WHERE i.id = c.intent_id AND (",
        "i.status IN ('failed', 'expired') OR (",
        "i.status = 'finalized' AND v.status = 'rejected' AND (",
        "(c.kind = 'video' AND v.video_blob_id IS NULL)",
        "OR (c.kind = 'thumbnail' AND v.thumbnail_blob_id IS NULL)",
        ")))",
        ") ORDER BY c.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (usedCapabilityWithoutBlob) {
    throw new Error(
      `Restore candidate used upload capability ${usedCapabilityWithoutBlob.id} has no matching media blob.`,
    );
  }

  const finalizedIntentWithoutDurableVideo = database
    .prepare(
      [
        "SELECT i.id FROM upload_intents i",
        "WHERE json_valid(i.provenance_json) <> 1",
        "OR (i.status = 'finalized' AND (",
        "i.finalized_at IS NULL OR i.finalized_at < i.created_at",
        "OR i.finalized_at > i.expires_at OR NOT EXISTS (",
        "SELECT 1 FROM videos v",
        "WHERE v.intent_id = i.id AND v.created_at <= i.finalized_at",
        "AND v.duration_seconds = i.declared_duration_seconds",
        "AND v.size_bytes = i.declared_video_bytes",
        "AND v.sha256 = i.declared_video_sha256",
        "AND v.provenance_json = i.provenance_json",
        "AND ((v.status = 'rejected' AND v.video_blob_id IS NULL) OR EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.video_blob_id",
        "AND b.intent_id = i.id AND b.kind = 'video'",
        "AND b.size_bytes = i.declared_video_bytes",
        "AND b.sha256 = i.declared_video_sha256 AND b.mime = i.declared_mime",
        "))",
        "AND (NOT EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = i.id AND c.kind = 'video'",
        ") OR EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = i.id AND c.kind = 'video'",
        "AND c.used_at IS NOT NULL AND c.used_at <= v.created_at",
        "))",
        "AND (i.declared_thumbnail_bytes IS NULL",
        "OR (v.status = 'rejected' AND v.thumbnail_blob_id IS NULL)",
        "OR EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.thumbnail_blob_id",
        "AND b.intent_id = i.id AND b.kind = 'thumbnail'",
        "AND b.size_bytes = i.declared_thumbnail_bytes",
        "AND b.sha256 = i.declared_thumbnail_sha256",
        "AND b.mime = i.declared_thumbnail_mime",
        "))",
        "AND (i.declared_thumbnail_bytes IS NULL OR NOT EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = i.id AND c.kind = 'thumbnail'",
        ") OR EXISTS (",
        "SELECT 1 FROM upload_capabilities c",
        "WHERE c.intent_id = i.id AND c.kind = 'thumbnail'",
        "AND c.used_at IS NOT NULL AND c.used_at <= v.created_at",
        "))",
        ")))",
        "OR (i.status <> 'finalized' AND i.finalized_at IS NOT NULL)",
        "OR (i.status <> 'finalized' AND EXISTS (",
        "SELECT 1 FROM videos v WHERE v.intent_id = i.id",
        ")) ORDER BY i.id LIMIT 1",
      ].join(" "),
    )
    .get() as RestoredUploadProvenanceMismatchRow | undefined;

  if (finalizedIntentWithoutDurableVideo) {
    throw new Error(
      `Restore candidate upload intent ${finalizedIntentWithoutDurableVideo.id} has invalid finalized lifecycle evidence.`,
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
        "WHEN json_valid(v.provenance_json) <> 1 OR NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id",
        "AND i.provenance_json = v.provenance_json",
        ") THEN 'intent provenance binding'",
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
        ") OR json_valid(v.provenance_json) <> 1 OR NOT EXISTS (",
        "SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id",
        "AND i.provenance_json = v.provenance_json",
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

function assertRestoredRateLimitConsistency(database: Database): void {
  const rateLimitsTable = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'rate_limits'")
    .get() as SchemaTableRow | undefined;

  if (!rateLimitsTable) {
    return;
  }

  const mismatch = database
    .prepare("SELECT key FROM rate_limits WHERE window_start < 0 OR count < 0 ORDER BY key LIMIT 1")
    .get() as RestoredRateLimitMismatchRow | undefined;

  if (mismatch) {
    throw new Error(`Restore candidate rate-limit key ${mismatch.key} has negative state.`);
  }
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
    assertRestoredRateLimitConsistency(database);
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
