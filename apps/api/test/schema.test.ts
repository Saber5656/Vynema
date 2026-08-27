import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type Database } from "../src/lib/database.js";
import { applyMigrations } from "../src/lib/migrations.js";
import { ConfigUnavailableError, getConfig } from "../src/lib/repo/config.js";
import { all, newId, nowMs, one, transaction } from "../src/lib/repo/db.js";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const VIDEO_HASH = "a".repeat(64);
const THUMBNAIL_HASH = "b".repeat(64);
const VIDEO_BYTES = Buffer.alloc(1024, 1);
const THUMBNAIL_BYTES = Buffer.alloc(4, 2);

let database: Database;
let temporaryDirectory: string;

function insertAgentChannel(
  agentId = "agt_111111111111",
  channelId = "chn_11111111-1111-4111-8111-111111111111",
  channelSlug = "test-channel",
): void {
  database
    .prepare(
      "INSERT INTO agents (id, display_name, owner_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(agentId, "Test Agent", "@owner", 1_000, 1_000);
  database
    .prepare(
      "INSERT INTO channels (id, agent_id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(channelId, agentId, channelSlug, "Test Channel", 1_000, 1_000);
}

function insertUser(userId = "usr_11111111-1111-4111-8111-111111111111"): void {
  database
    .prepare(
      "INSERT INTO users (id, github_id, github_login, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, 1001, "viewer", "Viewer", 1_000, 1_000);
}

function insertIntent(
  intentId: string,
  options: {
    agentId?: string;
    channelId?: string;
    thumbnailMime?: "image/jpeg" | "image/png";
  } = {},
): void {
  const agentId = options.agentId ?? "agt_111111111111";
  const channelId = options.channelId ?? "chn_11111111-1111-4111-8111-111111111111";
  const thumbnailMime = options.thumbnailMime ?? null;

  database
    .prepare(
      [
        "INSERT INTO upload_intents (",
        "id, agent_id, channel_id, declared_video_bytes, declared_video_sha256,",
        "declared_thumbnail_bytes, declared_thumbnail_sha256, declared_thumbnail_mime,",
        "declared_mime, declared_duration_seconds, title, provenance_json, created_at, expires_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      intentId,
      agentId,
      channelId,
      VIDEO_BYTES.length,
      VIDEO_HASH,
      thumbnailMime ? THUMBNAIL_BYTES.length : null,
      thumbnailMime ? THUMBNAIL_HASH : null,
      thumbnailMime,
      "video/mp4",
      60,
      "Schema Test Video",
      "{}",
      1_000,
      100_000,
    );
}

function insertCapability(
  intentId: string,
  kind: "video" | "thumbnail",
  capabilityId: string,
): void {
  const isVideo = kind === "video";

  database
    .prepare(
      [
        "INSERT INTO upload_capabilities (",
        "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
        "expected_mime, expires_at, created_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      capabilityId,
      intentId,
      kind,
      createHash("sha256").update(capabilityId).digest("hex"),
      isVideo ? VIDEO_BYTES.length : THUMBNAIL_BYTES.length,
      isVideo ? VIDEO_HASH : THUMBNAIL_HASH,
      isVideo ? "video/mp4" : "image/png",
      90_000,
      1_100,
    );
  database
    .prepare("UPDATE upload_capabilities SET claimed_at = ? WHERE id = ?")
    .run(1_200, capabilityId);
}

function insertBlob(intentId: string, kind: "video" | "thumbnail", blobId: string): void {
  const isVideo = kind === "video";

  database
    .prepare(
      [
        "INSERT INTO media_blobs (",
        "id, intent_id, kind, content, size_bytes, sha256, mime, created_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      blobId,
      intentId,
      kind,
      isVideo ? VIDEO_BYTES : THUMBNAIL_BYTES,
      isVideo ? VIDEO_BYTES.length : THUMBNAIL_BYTES.length,
      isVideo ? VIDEO_HASH : THUMBNAIL_HASH,
      isVideo ? "video/mp4" : "image/png",
      1_300,
    );
}

function insertPendingVideo(
  videoId: string,
  intentId: string,
  options: {
    agentId?: string;
    channelId?: string;
    title?: string;
    videoBlobId?: string | null;
    thumbnailBlobId?: string | null;
    sizeBytes?: number;
    sha256?: string;
    aiGenerated?: number;
  } = {},
): void {
  database
    .prepare(
      [
        "INSERT INTO videos (",
        "id, intent_id, agent_id, channel_id, title, duration_seconds, size_bytes,",
        "sha256, ai_generated, provenance_json, video_blob_id, thumbnail_blob_id, created_at, updated_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      videoId,
      intentId,
      options.agentId ?? "agt_111111111111",
      options.channelId ?? "chn_11111111-1111-4111-8111-111111111111",
      options.title ?? "Initial titletoken",
      60,
      options.sizeBytes ?? VIDEO_BYTES.length,
      options.sha256 ?? VIDEO_HASH,
      options.aiGenerated ?? 1,
      "{}",
      options.videoBlobId ?? null,
      options.thumbnailBlobId ?? null,
      2_000,
      2_000,
    );
}

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-schema-"));
  database = openDatabase(join(temporaryDirectory, "database.sqlite"));
  expect(applyMigrations(database, migrationsDirectory)).toEqual([1, 2]);
});

afterEach(() => {
  database.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("canonical schema", () => {
  it("applies idempotently with every canonical table, index, and config default", () => {
    expect(applyMigrations(database, migrationsDirectory)).toEqual([]);
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    expect(database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 2,
    });

    const tables = (
      database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "abuse_reports",
        "agent_keys",
        "agent_nonces",
        "agents",
        "audit_events",
        "channels",
        "comments",
        "follows",
        "likes",
        "media_blobs",
        "moderation_reviews",
        "platform_config",
        "quota_counters",
        "quota_ledger",
        "rate_limits",
        "saves",
        "sessions",
        "upload_capabilities",
        "upload_intents",
        "users",
        "videos",
        "videos_fts",
      ]),
    );

    const indexes = (
      database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' ORDER BY name")
        .all() as { name: string }[]
    ).map((row) => row.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_audit_action",
        "idx_intents_status_expires",
        "idx_quota_ledger_scope",
        "idx_reports_status",
        "idx_videos_channel",
        "idx_videos_feed",
        "idx_videos_review_queue",
        "uq_media_blobs_identity",
      ]),
    );

    expect(
      database
        .prepare("SELECT key, value, updated_at, updated_by FROM platform_config ORDER BY key")
        .all(),
    ).toHaveLength(13);
  });

  it("enforces foreign keys, lifecycle checks, and comment length", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111");

    expect(() => {
      insertPendingVideo(
        "vid_11111111-1111-4111-8111-111111111111",
        "int_11111111-1111-4111-8111-111111111111",
        { agentId: "agt_ffffffffffff" },
      );
    }).toThrow();

    expect(() =>
      database
        .prepare(
          [
            "INSERT INTO videos (",
            "id, intent_id, agent_id, channel_id, status, title, duration_seconds,",
            "size_bytes, sha256, provenance_json, created_at, updated_at",
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
        )
        .run(
          "vid_22222222-2222-4222-8222-222222222222",
          "int_11111111-1111-4111-8111-111111111111",
          "agt_111111111111",
          "chn_11111111-1111-4111-8111-111111111111",
          "queued",
          "Invalid status",
          60,
          VIDEO_BYTES.length,
          VIDEO_HASH,
          "{}",
          2_000,
          2_000,
        ),
    ).toThrow();

    insertPendingVideo(
      "vid_33333333-3333-4333-8333-333333333333",
      "int_11111111-1111-4111-8111-111111111111",
    );
    insertUser();

    expect(() =>
      database
        .prepare(
          "INSERT INTO comments (id, video_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "cmt_11111111-1111-4111-8111-111111111111",
          "vid_33333333-3333-4333-8333-333333333333",
          "usr_11111111-1111-4111-8111-111111111111",
          "x".repeat(2001),
          3_000,
          3_000,
        ),
    ).toThrow();
  });

  it("binds complete thumbnail declarations and capability metadata to intents", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111", {
      thumbnailMime: "image/jpeg",
    });
    insertIntent("int_22222222-2222-4222-8222-222222222222", {
      thumbnailMime: "image/png",
    });

    expect(
      database.prepare("SELECT declared_thumbnail_mime FROM upload_intents ORDER BY id").all(),
    ).toEqual([
      { declared_thumbnail_mime: "image/jpeg" },
      { declared_thumbnail_mime: "image/png" },
    ]);

    expect(() =>
      database
        .prepare(
          [
            "INSERT INTO upload_intents (",
            "id, agent_id, channel_id, declared_video_bytes, declared_video_sha256,",
            "declared_thumbnail_bytes, declared_mime, declared_duration_seconds, title,",
            "provenance_json, created_at, expires_at",
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
        )
        .run(
          "int_33333333-3333-4333-8333-333333333333",
          "agt_111111111111",
          "chn_11111111-1111-4111-8111-111111111111",
          VIDEO_BYTES.length,
          VIDEO_HASH,
          THUMBNAIL_BYTES.length,
          "video/mp4",
          60,
          "Partial thumbnail",
          "{}",
          1_000,
          100_000,
        ),
    ).toThrow();

    expect(() =>
      database
        .prepare(
          [
            "INSERT INTO upload_capabilities (",
            "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
            "expected_mime, expires_at, created_at",
            ") VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?, ?)",
          ].join(" "),
        )
        .run(
          "cap_11111111-1111-4111-8111-111111111111",
          "int_11111111-1111-4111-8111-111111111111",
          "c".repeat(64),
          VIDEO_BYTES.length + 1,
          VIDEO_HASH,
          90_000,
          1_100,
        ),
    ).toThrow("video capability metadata mismatch");
  });

  it("stores only lowercase SHA-256 token hashes", () => {
    insertAgentChannel();
    insertUser();
    insertIntent("int_11111111-1111-4111-8111-111111111111");

    expect(() =>
      database
        .prepare(
          "INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "ses_11111111-1111-4111-8111-111111111111",
          "raw-cookie-token",
          "usr_11111111-1111-4111-8111-111111111111",
          1_000,
          2_000,
          1_000,
        ),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "ses_22222222-2222-4222-8222-222222222222",
          "A".repeat(64),
          "usr_11111111-1111-4111-8111-111111111111",
          1_000,
          2_000,
          1_000,
        ),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          [
            "INSERT INTO upload_capabilities (",
            "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
            "expected_mime, expires_at, created_at",
            ") VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?, ?)",
          ].join(" "),
        )
        .run(
          "cap_11111111-1111-4111-8111-111111111111",
          "int_11111111-1111-4111-8111-111111111111",
          "A".repeat(64),
          VIDEO_BYTES.length,
          VIDEO_HASH,
          90_000,
          1_100,
        ),
    ).toThrow();
  });

  it("binds intent channels to their owning agents and freezes issued scope", () => {
    insertAgentChannel();
    insertAgentChannel(
      "agt_222222222222",
      "chn_22222222-2222-4222-8222-222222222222",
      "other-agent-channel",
    );

    expect(() => {
      insertIntent("int_11111111-1111-4111-8111-111111111111", {
        agentId: "agt_111111111111",
        channelId: "chn_22222222-2222-4222-8222-222222222222",
      });
    }).toThrow();

    database
      .prepare(
        "INSERT INTO channels (id, agent_id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "chn_33333333-3333-4333-8333-333333333333",
        "agt_111111111111",
        "same-agent-channel",
        "Same Agent Channel",
        1_000,
        1_000,
      );
    insertIntent("int_22222222-2222-4222-8222-222222222222");
    insertCapability(
      "int_22222222-2222-4222-8222-222222222222",
      "video",
      "cap_11111111-1111-4111-8111-111111111111",
    );

    expect(() =>
      database
        .prepare("UPDATE upload_intents SET channel_id = ? WHERE id = ?")
        .run(
          "chn_33333333-3333-4333-8333-333333333333",
          "int_22222222-2222-4222-8222-222222222222",
        ),
    ).toThrow("upload intent scope is immutable after downstream issuance");

    insertIntent("int_33333333-3333-4333-8333-333333333333");
    insertPendingVideo(
      "vid_11111111-1111-4111-8111-111111111111",
      "int_33333333-3333-4333-8333-333333333333",
    );
    expect(() =>
      database
        .prepare("UPDATE upload_intents SET channel_id = ? WHERE id = ?")
        .run(
          "chn_33333333-3333-4333-8333-333333333333",
          "int_33333333-3333-4333-8333-333333333333",
        ),
    ).toThrow("upload intent scope is immutable after downstream issuance");
  });

  it("requires a verified BLOB before capability completion and rolls back atomically", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111");
    insertCapability(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "cap_11111111-1111-4111-8111-111111111111",
    );

    expect(() =>
      database
        .prepare("UPDATE upload_capabilities SET used_at = ? WHERE id = ?")
        .run(1_400, "cap_11111111-1111-4111-8111-111111111111"),
    ).toThrow("completed capability requires verified media blob");

    transaction(database, () => {
      insertBlob(
        "int_11111111-1111-4111-8111-111111111111",
        "video",
        "blob_11111111-1111-4111-8111-111111111111",
      );
      database
        .prepare("UPDATE upload_capabilities SET used_at = ? WHERE id = ?")
        .run(1_400, "cap_11111111-1111-4111-8111-111111111111");
    });

    expect(
      database
        .prepare("SELECT used_at FROM upload_capabilities WHERE id = ?")
        .get("cap_11111111-1111-4111-8111-111111111111"),
    ).toEqual({ used_at: 1_400 });

    insertIntent("int_22222222-2222-4222-8222-222222222222");
    insertCapability(
      "int_22222222-2222-4222-8222-222222222222",
      "video",
      "cap_22222222-2222-4222-8222-222222222222",
    );

    expect(() =>
      transaction(database, () => {
        insertBlob(
          "int_22222222-2222-4222-8222-222222222222",
          "video",
          "blob_22222222-2222-4222-8222-222222222222",
        );
        throw new Error("injected failure");
      }),
    ).toThrow("injected failure");
    expect(
      database
        .prepare("SELECT id FROM media_blobs WHERE intent_id = ?")
        .get("int_22222222-2222-4222-8222-222222222222"),
    ).toBeUndefined();
  });

  it("enforces media ownership, kind, and BLOB length", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111", {
      thumbnailMime: "image/png",
    });
    insertIntent("int_22222222-2222-4222-8222-222222222222");
    insertCapability(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "cap_11111111-1111-4111-8111-111111111111",
    );
    insertBlob(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "blob_11111111-1111-4111-8111-111111111111",
    );
    insertCapability(
      "int_11111111-1111-4111-8111-111111111111",
      "thumbnail",
      "cap_22222222-2222-4222-8222-222222222222",
    );
    insertBlob(
      "int_11111111-1111-4111-8111-111111111111",
      "thumbnail",
      "blob_22222222-2222-4222-8222-222222222222",
    );

    expect(() => {
      insertPendingVideo(
        "vid_11111111-1111-4111-8111-111111111111",
        "int_22222222-2222-4222-8222-222222222222",
        { videoBlobId: "blob_11111111-1111-4111-8111-111111111111" },
      );
    }).toThrow("invalid video blob reference");
    expect(() => {
      insertPendingVideo(
        "vid_22222222-2222-4222-8222-222222222222",
        "int_11111111-1111-4111-8111-111111111111",
        { videoBlobId: "blob_22222222-2222-4222-8222-222222222222" },
      );
    }).toThrow("invalid video blob reference");
    expect(() => {
      insertPendingVideo(
        "vid_33333333-3333-4333-8333-333333333333",
        "int_11111111-1111-4111-8111-111111111111",
        { thumbnailBlobId: "blob_11111111-1111-4111-8111-111111111111" },
      );
    }).toThrow("invalid thumbnail blob reference");
    expect(() => {
      insertPendingVideo(
        "vid_44444444-4444-4444-8444-444444444444",
        "int_11111111-1111-4111-8111-111111111111",
        {
          videoBlobId: "blob_11111111-1111-4111-8111-111111111111",
          sizeBytes: VIDEO_BYTES.length + 1,
        },
      );
    }).toThrow("invalid video blob reference");
    expect(() => {
      insertPendingVideo(
        "vid_55555555-5555-4555-8555-555555555555",
        "int_11111111-1111-4111-8111-111111111111",
        {
          videoBlobId: "blob_11111111-1111-4111-8111-111111111111",
          sha256: "c".repeat(64),
        },
      );
    }).toThrow("invalid video blob reference");
    expect(() => {
      insertPendingVideo(
        "vid_66666666-6666-4666-8666-666666666666",
        "int_11111111-1111-4111-8111-111111111111",
        { aiGenerated: 0 },
      );
    }).toThrow();
    insertPendingVideo(
      "vid_77777777-7777-4777-8777-777777777777",
      "int_11111111-1111-4111-8111-111111111111",
      { videoBlobId: "blob_11111111-1111-4111-8111-111111111111" },
    );
    expect(() =>
      database
        .prepare("UPDATE videos SET ai_generated = 0 WHERE id = ?")
        .run("vid_77777777-7777-4777-8777-777777777777"),
    ).toThrow();
    expect(() =>
      database
        .prepare("UPDATE videos SET size_bytes = size_bytes + 1 WHERE id = ?")
        .run("vid_77777777-7777-4777-8777-777777777777"),
    ).toThrow("invalid video blob reference");

    insertCapability(
      "int_22222222-2222-4222-8222-222222222222",
      "video",
      "cap_33333333-3333-4333-8333-333333333333",
    );
    expect(() =>
      database
        .prepare(
          "INSERT INTO media_blobs (id, intent_id, kind, content, size_bytes, sha256, mime, created_at) VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?)",
        )
        .run(
          "blob_33333333-3333-4333-8333-333333333333",
          "int_22222222-2222-4222-8222-222222222222",
          Buffer.alloc(1),
          VIDEO_BYTES.length,
          VIDEO_HASH,
          1_300,
        ),
    ).toThrow();
  });

  it("enforces publication lifecycle timestamps and retained media", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111");

    const insertLifecycleVideo = database.prepare(
      [
        "INSERT INTO videos (",
        "id, intent_id, agent_id, channel_id, status, title, duration_seconds,",
        "size_bytes, sha256, provenance_json, published_at, rejected_at, taken_down_at,",
        "created_at, updated_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    );
    const common = [
      "int_11111111-1111-4111-8111-111111111111",
      "agt_111111111111",
      "chn_11111111-1111-4111-8111-111111111111",
    ] as const;

    expect(() =>
      insertLifecycleVideo.run(
        "vid_11111111-1111-4111-8111-111111111111",
        ...common,
        "published",
        "Published without blob",
        60,
        VIDEO_BYTES.length,
        VIDEO_HASH,
        "{}",
        2_000,
        null,
        null,
        2_000,
        2_000,
      ),
    ).toThrow();
    expect(() =>
      insertLifecycleVideo.run(
        "vid_22222222-2222-4222-8222-222222222222",
        ...common,
        "rejected",
        "Rejected without timestamp",
        60,
        VIDEO_BYTES.length,
        VIDEO_HASH,
        "{}",
        null,
        null,
        null,
        2_000,
        2_000,
      ),
    ).toThrow();
    expect(() =>
      insertLifecycleVideo.run(
        "vid_33333333-3333-4333-8333-333333333333",
        ...common,
        "taken_down",
        "Takedown without publication",
        60,
        VIDEO_BYTES.length,
        VIDEO_HASH,
        "{}",
        null,
        null,
        2_100,
        2_000,
        2_100,
      ),
    ).toThrow();
  });

  it("requires an approval review before a video becomes published", () => {
    insertAgentChannel();
    insertUser();
    insertIntent("int_11111111-1111-4111-8111-111111111111");
    insertCapability(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "cap_11111111-1111-4111-8111-111111111111",
    );
    insertBlob(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "blob_11111111-1111-4111-8111-111111111111",
    );
    expect(() =>
      database
        .prepare(
          [
            "INSERT INTO videos (",
            "id, intent_id, agent_id, channel_id, status, title, duration_seconds,",
            "size_bytes, sha256, provenance_json, video_blob_id, published_at, created_at, updated_at",
            ") VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
        )
        .run(
          "vid_direct_publish",
          "int_11111111-1111-4111-8111-111111111111",
          "agt_111111111111",
          "chn_11111111-1111-4111-8111-111111111111",
          "Direct publish",
          60,
          VIDEO_BYTES.length,
          VIDEO_HASH,
          "{}",
          "blob_11111111-1111-4111-8111-111111111111",
          3_000,
          2_000,
          2_000,
        ),
    ).toThrow("published videos must transition from review");
    insertPendingVideo(
      "vid_11111111-1111-4111-8111-111111111111",
      "int_11111111-1111-4111-8111-111111111111",
      { videoBlobId: "blob_11111111-1111-4111-8111-111111111111" },
    );

    expect(() =>
      database
        .prepare("UPDATE videos SET status = 'published', published_at = ? WHERE id = ?")
        .run(3_000, "vid_11111111-1111-4111-8111-111111111111"),
    ).toThrow("published videos require an approval review");

    database
      .prepare(
        "INSERT INTO moderation_reviews (id, video_id, reviewer_user_id, decision, reason, created_at) VALUES (?, ?, ?, 'approved', ?, ?)",
      )
      .run(
        "rev_11111111-1111-4111-8111-111111111111",
        "vid_11111111-1111-4111-8111-111111111111",
        "usr_11111111-1111-4111-8111-111111111111",
        "Approved for publication.",
        2_500,
      );
    database
      .prepare("UPDATE videos SET status = 'published', published_at = ? WHERE id = ?")
      .run(3_000, "vid_11111111-1111-4111-8111-111111111111");
    expect(
      database
        .prepare("SELECT status, published_at FROM videos WHERE id = ?")
        .get("vid_11111111-1111-4111-8111-111111111111"),
    ).toEqual({ status: "published", published_at: 3_000 });
  });

  it("restricts referenced BLOB deletion and makes purge transactions atomic", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111");
    insertCapability(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "cap_11111111-1111-4111-8111-111111111111",
    );
    insertBlob(
      "int_11111111-1111-4111-8111-111111111111",
      "video",
      "blob_11111111-1111-4111-8111-111111111111",
    );
    database
      .prepare(
        [
          "INSERT INTO videos (",
          "id, intent_id, agent_id, channel_id, status, title, duration_seconds,",
          "size_bytes, sha256, provenance_json, video_blob_id, rejected_at, created_at, updated_at",
          ") VALUES (?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
      )
      .run(
        "vid_11111111-1111-4111-8111-111111111111",
        "int_11111111-1111-4111-8111-111111111111",
        "agt_111111111111",
        "chn_11111111-1111-4111-8111-111111111111",
        "Rejected",
        60,
        VIDEO_BYTES.length,
        VIDEO_HASH,
        "{}",
        "blob_11111111-1111-4111-8111-111111111111",
        2_100,
        2_000,
        2_100,
      );

    expect(() =>
      database
        .prepare("DELETE FROM media_blobs WHERE id = ?")
        .run("blob_11111111-1111-4111-8111-111111111111"),
    ).toThrow();

    expect(() =>
      transaction(database, () => {
        database
          .prepare("UPDATE videos SET video_blob_id = NULL WHERE id = ?")
          .run("vid_11111111-1111-4111-8111-111111111111");
        throw new Error("injected purge failure");
      }),
    ).toThrow("injected purge failure");
    expect(
      database
        .prepare("SELECT video_blob_id FROM videos WHERE id = ?")
        .get("vid_11111111-1111-4111-8111-111111111111"),
    ).toEqual({
      video_blob_id: "blob_11111111-1111-4111-8111-111111111111",
    });

    transaction(database, () => {
      database
        .prepare("UPDATE videos SET video_blob_id = NULL WHERE id = ?")
        .run("vid_11111111-1111-4111-8111-111111111111");
      database
        .prepare("DELETE FROM media_blobs WHERE id = ? AND intent_id = ? AND kind = 'video'")
        .run(
          "blob_11111111-1111-4111-8111-111111111111",
          "int_11111111-1111-4111-8111-111111111111",
        );
    });
    expect(
      database
        .prepare("SELECT id FROM media_blobs WHERE id = ?")
        .get("blob_11111111-1111-4111-8111-111111111111"),
    ).toBeUndefined();
  });

  it("enforces uniqueness and keeps the FTS external-content index synchronized", () => {
    insertAgentChannel();
    insertIntent("int_11111111-1111-4111-8111-111111111111");
    insertPendingVideo(
      "vid_11111111-1111-4111-8111-111111111111",
      "int_11111111-1111-4111-8111-111111111111",
    );
    insertUser();

    database
      .prepare(
        "INSERT INTO agent_nonces (agent_id, nonce, seen_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run("agt_111111111111", "nonce", 1_000, 90_000);
    expect(() =>
      database
        .prepare(
          "INSERT INTO agent_nonces (agent_id, nonce, seen_at, expires_at) VALUES (?, ?, ?, ?)",
        )
        .run("agt_111111111111", "nonce", 1_001, 90_001),
    ).toThrow();
    expect(() => {
      insertPendingVideo(
        "vid_22222222-2222-4222-8222-222222222222",
        "int_11111111-1111-4111-8111-111111111111",
      );
    }).toThrow();

    database
      .prepare("INSERT INTO likes (user_id, video_id, created_at) VALUES (?, ?, ?)")
      .run(
        "usr_11111111-1111-4111-8111-111111111111",
        "vid_11111111-1111-4111-8111-111111111111",
        3_000,
      );
    expect(() =>
      database
        .prepare("INSERT INTO likes (user_id, video_id, created_at) VALUES (?, ?, ?)")
        .run(
          "usr_11111111-1111-4111-8111-111111111111",
          "vid_11111111-1111-4111-8111-111111111111",
          3_001,
        ),
    ).toThrow();

    expect(
      database.prepare("SELECT rowid FROM videos_fts WHERE videos_fts MATCH 'titletoken'").all(),
    ).toHaveLength(1);
    database
      .prepare("UPDATE videos SET title = ? WHERE id = ?")
      .run("Replacement newtoken", "vid_11111111-1111-4111-8111-111111111111");
    expect(
      database.prepare("SELECT rowid FROM videos_fts WHERE videos_fts MATCH 'titletoken'").all(),
    ).toHaveLength(0);
    expect(
      database.prepare("SELECT rowid FROM videos_fts WHERE videos_fts MATCH 'newtoken'").all(),
    ).toHaveLength(1);
    database
      .prepare("DELETE FROM likes WHERE video_id = ?")
      .run("vid_11111111-1111-4111-8111-111111111111");
    database
      .prepare("DELETE FROM videos WHERE id = ?")
      .run("vid_11111111-1111-4111-8111-111111111111");
    expect(
      database.prepare("SELECT rowid FROM videos_fts WHERE videos_fts MATCH 'newtoken'").all(),
    ).toHaveLength(0);
  });

  it("loads typed config once and fails closed on missing or invalid values", async () => {
    await expect(getConfig(database)).resolves.toMatchObject({
      uploads_enabled: true,
      publication_enabled: true,
      public_read_enabled: true,
      max_video_bytes: 104_857_600,
      allowed_video_mime: "video/mp4",
      global_active_storage_bytes: 8_589_934_592,
    });

    database.prepare("DELETE FROM platform_config WHERE key = ?").run("uploads_enabled");
    await expect(getConfig(database)).rejects.toBeInstanceOf(ConfigUnavailableError);

    database
      .prepare("INSERT INTO platform_config (key, value, updated_at) VALUES (?, ?, ?)")
      .run("uploads_enabled", "yes", 0);
    await expect(getConfig(database)).rejects.toThrow("uploads_enabled is invalid");

    database
      .prepare("UPDATE platform_config SET value = ? WHERE key = ?")
      .run("true", "uploads_enabled");
    database
      .prepare("UPDATE platform_config SET value = ? WHERE key = ?")
      .run("video/webm", "allowed_video_mime");
    await expect(getConfig(database)).rejects.toThrow("allowed_video_mime is invalid");
  });

  it("supports period-scoped quota accounting and rolls back insufficient releases", () => {
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('global', 'unexpected', 'intents', 0, 0, 0)",
        )
        .run(),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('global', '', 'intents', 0, ?, 0)",
        )
        .run("abc"),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_ledger (id, occurred_at, scope, scope_id, metric, period_start, delta, reason) VALUES ('qle_non_integer', 0, 'global', '', 'intents', 0, ?, 'test')",
        )
        .run("abc"),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('agent', '', 'intents', 0, 0, 0)",
        )
        .run(),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_ledger (id, occurred_at, scope, scope_id, metric, period_start, delta, reason) VALUES ('qle_invalid_global', 0, 'global', 'unexpected', 'intents', 0, 1, 'test')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_ledger (id, occurred_at, scope, scope_id, metric, period_start, delta, reason) VALUES ('qle_invalid_agent', 0, 'agent', '', 'intents', 0, 1, 'test')",
        )
        .run(),
    ).toThrow();

    expect(() =>
      database
        .prepare(
          "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('agent', ?, 'storage_bytes', 0, -1, ?)",
        )
        .run("agt_111111111111", 1_000),
    ).toThrow();

    const firstPeriod = 1_786_665_600_000;
    const secondPeriod = firstPeriod + 86_400_000;
    transaction(database, () => {
      database
        .prepare(
          "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('agent', ?, 'intents', ?, ?, ?)",
        )
        .run("agt_111111111111", firstPeriod, 1, 1_000);
      database
        .prepare(
          "INSERT INTO quota_ledger (id, occurred_at, scope, scope_id, metric, period_start, delta, reason) VALUES (?, ?, 'agent', ?, 'intents', ?, ?, ?)",
        )
        .run(
          "qle_11111111-1111-4111-8111-111111111111",
          1_000,
          "agt_111111111111",
          firstPeriod,
          1,
          "intent_created",
        );
    });
    database
      .prepare(
        "INSERT INTO quota_counters (scope, scope_id, metric, period_start, value, updated_at) VALUES ('agent', ?, 'intents', ?, ?, ?)",
      )
      .run("agt_111111111111", secondPeriod, 0, 2_000);

    expect(
      database
        .prepare(
          "SELECT period_start, value FROM quota_counters WHERE scope_id = ? ORDER BY period_start",
        )
        .all("agt_111111111111"),
    ).toEqual([
      { period_start: firstPeriod, value: 1 },
      { period_start: secondPeriod, value: 0 },
    ]);
    expect(
      database
        .prepare("SELECT period_start FROM quota_ledger WHERE id = ?")
        .get("qle_11111111-1111-4111-8111-111111111111"),
    ).toEqual({ period_start: firstPeriod });

    expect(() => {
      transaction(database, () => {
        const result = database
          .prepare(
            "UPDATE quota_counters SET value = value - 2 WHERE scope = 'agent' AND scope_id = ? AND metric = 'intents' AND period_start = ? AND value >= 2",
          )
          .run("agt_111111111111", firstPeriod);

        if (result.changes !== 1) {
          throw new Error("insufficient quota counter");
        }

        database
          .prepare(
            "INSERT INTO quota_ledger (id, occurred_at, scope, scope_id, metric, period_start, delta, reason) VALUES (?, ?, 'agent', ?, 'intents', ?, -2, ?)",
          )
          .run(
            "qle_22222222-2222-4222-8222-222222222222",
            2_000,
            "agt_111111111111",
            firstPeriod,
            "double_release",
          );
      });
    }).toThrow("insufficient quota counter");
    expect(
      database
        .prepare(
          "SELECT value FROM quota_counters WHERE scope = 'agent' AND scope_id = ? AND metric = 'intents' AND period_start = ?",
        )
        .get("agt_111111111111", firstPeriod),
    ).toEqual({ value: 1 });
  });
});

describe("repository primitives", () => {
  it("provides typed row helpers, UUIDs, timestamps, and synchronous transactions", () => {
    const before = Date.now();
    const timestamp = nowMs();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const statement = database.prepare("SELECT key, value FROM platform_config WHERE key = ?");
    expect(one<{ key: string; value: string }>(statement, "uploads_enabled")).toEqual({
      key: "uploads_enabled",
      value: "true",
    });
    expect(
      all<{ key: string; value: string }>(
        database.prepare("SELECT key, value FROM platform_config WHERE key LIKE ? ORDER BY key"),
        "%enabled",
      ),
    ).toHaveLength(3);

    expect(() =>
      transaction(database, () => {
        database
          .prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)")
          .run("test", 0, 1);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(
      database.prepare("SELECT key FROM rate_limits WHERE key = ?").get("test"),
    ).toBeUndefined();

    expect(() => transaction(database, () => Promise.resolve("not supported"))).toThrow(
      "synchronous callback",
    );
  });
});
