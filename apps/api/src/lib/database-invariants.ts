import { createHash } from "node:crypto";

import type { Database } from "./database.js";

type SchemaTableRow = {
  name: string;
};

type SchemaColumnRow = {
  name: string;
  pk: number;
  type: string;
};

type IdentityStorageMismatchRow = {
  violation: number;
};

type VideoWithInvalidPublicationEvidenceRow = {
  id: string;
};

type ModerationReviewWithInvalidAuthorizationSnapshotRow = {
  id: string;
};

type VideoWithInvalidTakedownReasonRow = {
  id: string;
};

type MediaBindingMismatchRow = {
  id: string;
  violation: string;
};

type UploadProvenanceMismatchRow = {
  id: string;
};

type MediaBlobMetadataRow = {
  content_length: number;
  id: string;
  sha256: string;
  size_bytes: number;
};

type MediaBlobContentRow = {
  content: unknown;
};

type RateLimitMismatchRow = {
  key: string;
};

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertIdentityStorageConsistency(database: Database): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    )
    .all() as SchemaTableRow[];

  for (const table of applicationTables) {
    const quotedTable = quoteSqliteIdentifier(table.name);
    const textPrimaryKeyColumns = (
      database.prepare(`PRAGMA table_info(${quotedTable})`).all() as SchemaColumnRow[]
    ).filter((column) => column.pk > 0 && column.type.trim().toUpperCase() === "TEXT");

    if (textPrimaryKeyColumns.length === 0) {
      continue;
    }

    const nonTextPredicate = textPrimaryKeyColumns
      .map((column) => `typeof(${quoteSqliteIdentifier(column.name)}) <> 'text'`)
      .join(" OR ");
    const mismatch = database
      .prepare(`SELECT 1 AS violation FROM ${quotedTable} WHERE ${nonTextPredicate} LIMIT 1`)
      .get() as IdentityStorageMismatchRow | undefined;

    if (mismatch) {
      throw new Error(
        `Database table ${table.name} has a primary key value that does not use TEXT storage.`,
      );
    }
  }
}

function assertPublicationEvidence(database: Database, schemaVersion: number): void {
  const applicationTables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('moderation_reviews', 'upload_intents', 'videos') ORDER BY name",
    )
    .all() as SchemaTableRow[];

  if (applicationTables.length !== 3) {
    return;
  }

  const authorizationSnapshotPredicate =
    schemaVersion >= 4
      ? [
          "AND r.authorization_snapshot_version = 1",
          "AND r.reviewer_role_at_decision IN ('reviewer', 'admin')",
          "AND r.reviewer_status_at_decision = 'active'",
        ]
      : [];
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
        ...authorizationSnapshotPredicate,
        "))",
        "ORDER BY v.id LIMIT 1",
      ].join(" "),
    )
    .get() as VideoWithInvalidPublicationEvidenceRow | undefined;

  if (videoWithInvalidPublicationEvidence) {
    throw new Error(
      `Database video ${videoWithInvalidPublicationEvidence.id} is published or taken down without retained approval evidence or a valid publication timeline.`,
    );
  }
}

function assertModerationReviewAuthorizationSnapshots(
  database: Database,
  schemaVersion: number,
): void {
  if (schemaVersion < 4) {
    return;
  }

  const mismatch = database
    .prepare(
      [
        "SELECT id FROM moderation_reviews",
        "WHERE NOT (",
        "(authorization_snapshot_version IS NULL",
        "AND reviewer_role_at_decision IS NULL",
        "AND reviewer_status_at_decision IS NULL)",
        "OR (typeof(authorization_snapshot_version) = 'integer'",
        "AND authorization_snapshot_version = 1",
        "AND typeof(reviewer_role_at_decision) = 'text'",
        "AND reviewer_role_at_decision IN ('reviewer', 'admin')",
        "AND typeof(reviewer_status_at_decision) = 'text'",
        "AND reviewer_status_at_decision = 'active')",
        ") ORDER BY id LIMIT 1",
      ].join(" "),
    )
    .get() as ModerationReviewWithInvalidAuthorizationSnapshotRow | undefined;

  if (mismatch) {
    throw new Error(
      `Database moderation review ${mismatch.id} has an invalid decision-time authorization snapshot.`,
    );
  }
}

function assertTakedownReasons(database: Database, schemaVersion: number): void {
  if (schemaVersion < 5) {
    return;
  }

  const mismatch = database
    .prepare(
      [
        "SELECT id FROM videos WHERE (status = 'taken_down' AND (",
        "typeof(takedown_reason) <> 'text'",
        "OR trim(takedown_reason, char(9, 10, 11, 12, 13, 32)) = ''",
        ")) OR (status <> 'taken_down' AND takedown_reason IS NOT NULL)",
        "ORDER BY id LIMIT 1",
      ].join(" "),
    )
    .get() as VideoWithInvalidTakedownReasonRow | undefined;

  if (mismatch) {
    throw new Error(`Database video ${mismatch.id} has invalid takedown reason evidence.`);
  }
}

function assertMediaBlobContentConsistency(database: Database): void {
  const mediaBlobsTable = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'media_blobs'")
    .get() as SchemaTableRow | undefined;

  if (!mediaBlobsTable) {
    return;
  }

  const mediaBlobs = database
    .prepare(
      "SELECT id, size_bytes, sha256, length(content) AS content_length FROM media_blobs ORDER BY id",
    )
    .iterate() as IterableIterator<MediaBlobMetadataRow>;
  const contentStatement = database.prepare("SELECT content FROM media_blobs WHERE id = ?");

  for (const mediaBlob of mediaBlobs) {
    if (
      !Number.isSafeInteger(mediaBlob.size_bytes) ||
      !Number.isSafeInteger(mediaBlob.content_length) ||
      mediaBlob.size_bytes <= 0 ||
      mediaBlob.content_length !== mediaBlob.size_bytes
    ) {
      throw new Error(
        `Database media blob ${mediaBlob.id} content length does not match its metadata.`,
      );
    }

    // node:sqlite does not expose SQLite's incremental BLOB API. Reading one
    // row once keeps hashing linear; repeated substr(content, ...) queries
    // would rematerialize the complete SQLite BLOB for every apparent chunk.
    const contentRow = contentStatement.get(mediaBlob.id) as MediaBlobContentRow | undefined;
    const content = contentRow?.content;

    if (!(content instanceof Uint8Array) || content.byteLength !== mediaBlob.content_length) {
      throw new Error(`Database media blob ${mediaBlob.id} content does not match its metadata.`);
    }

    const actualSha256 = createHash("sha256").update(content).digest("hex");

    if (actualSha256 !== mediaBlob.sha256) {
      throw new Error(
        `Database media blob ${mediaBlob.id} content does not match its SHA-256 metadata.`,
      );
    }
  }
}

function assertUploadProvenanceConsistency(database: Database): void {
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (capabilityMismatch) {
    throw new Error(
      `Database upload capability ${capabilityMismatch.id} does not match its intent declaration.`,
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (claimedCapabilityOutsideAuthorizationWindow) {
    throw new Error(
      `Database claimed upload capability ${claimedCapabilityOutsideAuthorizationWindow.id} was claimed outside its authorization window.`,
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
        "AND b.created_at <= v.created_at",
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (blobMismatch) {
    throw new Error(
      `Database media blob ${blobMismatch.id} does not match a claimed upload capability.`,
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (usedCapabilityOutsideAuthorizationWindow) {
    throw new Error(
      `Database used upload capability ${usedCapabilityOutsideAuthorizationWindow.id} was used outside its authorization window.`,
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (usedCapabilityWithoutBlob) {
    throw new Error(
      `Database used upload capability ${usedCapabilityWithoutBlob.id} has no matching media blob.`,
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
        "WHERE v.intent_id = i.id AND v.created_at >= i.created_at",
        "AND v.created_at <= i.finalized_at",
        "AND v.duration_seconds = i.declared_duration_seconds",
        "AND v.size_bytes = i.declared_video_bytes",
        "AND v.sha256 = i.declared_video_sha256",
        "AND v.provenance_json = i.provenance_json",
        "AND ((v.status = 'rejected' AND v.video_blob_id IS NULL) OR EXISTS (",
        "SELECT 1 FROM media_blobs b WHERE b.id = v.video_blob_id",
        "AND b.intent_id = i.id AND b.kind = 'video'",
        "AND b.created_at <= v.created_at",
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
        "AND b.created_at <= v.created_at",
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
    .get() as UploadProvenanceMismatchRow | undefined;

  if (finalizedIntentWithoutDurableVideo) {
    throw new Error(
      `Database upload intent ${finalizedIntentWithoutDurableVideo.id} has invalid finalized lifecycle evidence.`,
    );
  }
}

function assertMediaBindingConsistency(database: Database): void {
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
    .get() as MediaBindingMismatchRow | undefined;

  if (mismatch) {
    throw new Error(`Database video ${mismatch.id} has invalid ${mismatch.violation}.`);
  }
}

function assertRateLimitConsistency(database: Database): void {
  const rateLimitsTable = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'rate_limits'")
    .get() as SchemaTableRow | undefined;

  if (!rateLimitsTable) {
    return;
  }

  const mismatch = database
    .prepare("SELECT key FROM rate_limits WHERE window_start < 0 OR count < 0 ORDER BY key LIMIT 1")
    .get() as RateLimitMismatchRow | undefined;

  if (mismatch) {
    throw new Error(`Database rate-limit key ${mismatch.key} has negative state.`);
  }
}

export function assertDurableRowsConsistent(database: Database, schemaVersion: number): void {
  assertIdentityStorageConsistency(database);
  assertRateLimitConsistency(database);
  assertModerationReviewAuthorizationSnapshots(database, schemaVersion);
  assertTakedownReasons(database, schemaVersion);
  assertPublicationEvidence(database, schemaVersion);
  assertMediaBindingConsistency(database);
  assertUploadProvenanceConsistency(database);
  assertMediaBlobContentConsistency(database);
}
