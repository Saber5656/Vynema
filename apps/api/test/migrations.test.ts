import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Database } from "../src/lib/database.js";
import { restoreDatabaseFromBackup } from "../src/lib/database-restore.js";
import {
  applyMigrations,
  applyMigrationsWithBackup,
  detectMigrationCapabilities,
  getMigrationStatus,
  getSearchIndexMode,
} from "../src/lib/migrations.js";

let database: Database | undefined;
let temporaryDirectory: string | undefined;
const repositoryMigrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const RESTORE_VIDEO_BYTES = Buffer.alloc(1024, 7);
const RESTORE_VIDEO_SHA256 = "a99c07ce93703c7390589c5b007bd9a97a8b6de29e9a920d474d4f028ce2d42c";
const RESTORE_THUMBNAIL_BYTES = Buffer.alloc(4, 8);
const RESTORE_THUMBNAIL_SHA256 = "918bd027f59087bef8e055f9b587b25486d58c606d8658d4ce7b1199274f6744";

function runtimeHasFts5(): boolean {
  const probe = openDatabase(":memory:");

  try {
    return detectMigrationCapabilities(probe).fts5;
  } finally {
    probe.close();
  }
}

const RUNTIME_HAS_FTS5 = runtimeHasFts5();

type SearchVideoRow = {
  rowid: number;
  title: string;
  description: string;
};

function createFixture(): { database: Database; migrationsDirectory: string } {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-migrations-"));
  const migrationsDirectory = join(temporaryDirectory, "migrations");
  mkdirSync(migrationsDirectory);
  database = openDatabase(join(temporaryDirectory, "database.sqlite"));

  return { database, migrationsDirectory };
}

function getCanonicalTriggerSql(target: Database, name: string): string {
  const trigger = target
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?")
    .get(name) as { sql: string } | undefined;

  if (!trigger?.sql) {
    throw new Error(`Canonical trigger ${name} was not installed.`);
  }

  return trigger.sql;
}

function insertFinalizedVideo(
  target: Database,
  options: { withThumbnail?: boolean } = {},
): {
  agentId: string;
  blobId: string;
  capabilityId: string;
  channelId: string;
  intentId: string;
  thumbnailBlobId: string | null;
  thumbnailCapabilityId: string | null;
  videoId: string;
} {
  const agentId = "agt_abcdef123456";
  const channelId = "chn_restore_publication";
  const intentId = "int_restore_publication";
  const capabilityId = "cap_restore_publication";
  const blobId = "blob_restore_publication";
  const thumbnailCapabilityId = options.withThumbnail ? "cap_restore_thumbnail" : null;
  const thumbnailBlobId = options.withThumbnail ? "blob_restore_thumbnail" : null;
  const videoId = "vid_restore_publication";

  target
    .prepare(
      "INSERT INTO agents (id, display_name, owner_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(agentId, "Restore Agent", "@restore-owner", 1_000, 1_000);
  target
    .prepare(
      "INSERT INTO channels (id, agent_id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(channelId, agentId, "restore-channel", "Restore Channel", 1_000, 1_000);
  target
    .prepare(
      [
        "INSERT INTO upload_intents (",
        "id, agent_id, channel_id, declared_video_bytes, declared_video_sha256,",
        "declared_thumbnail_bytes, declared_thumbnail_sha256, declared_thumbnail_mime,",
        "declared_mime, declared_duration_seconds, title, provenance_json, created_at, expires_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'video/mp4', ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      intentId,
      agentId,
      channelId,
      RESTORE_VIDEO_BYTES.length,
      RESTORE_VIDEO_SHA256,
      options.withThumbnail ? RESTORE_THUMBNAIL_BYTES.length : null,
      options.withThumbnail ? RESTORE_THUMBNAIL_SHA256 : null,
      options.withThumbnail ? "image/png" : null,
      60,
      "Restore publication evidence",
      "{}",
      1_000,
      100_000,
    );
  target
    .prepare(
      [
        "INSERT INTO upload_capabilities (",
        "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
        "expected_mime, expires_at, created_at",
        ") VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?, ?)",
      ].join(" "),
    )
    .run(
      capabilityId,
      intentId,
      "b".repeat(64),
      RESTORE_VIDEO_BYTES.length,
      RESTORE_VIDEO_SHA256,
      90_000,
      1_100,
    );
  target
    .prepare("UPDATE upload_capabilities SET claimed_at = ? WHERE id = ?")
    .run(1_200, capabilityId);
  target
    .prepare(
      "INSERT INTO media_blobs (id, intent_id, kind, content, size_bytes, sha256, mime, created_at) VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?)",
    )
    .run(
      blobId,
      intentId,
      RESTORE_VIDEO_BYTES,
      RESTORE_VIDEO_BYTES.length,
      RESTORE_VIDEO_SHA256,
      1_300,
    );
  target
    .prepare("UPDATE upload_capabilities SET used_at = ? WHERE id = ?")
    .run(1_400, capabilityId);
  if (thumbnailCapabilityId && thumbnailBlobId) {
    target
      .prepare(
        [
          "INSERT INTO upload_capabilities (",
          "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
          "expected_mime, expires_at, created_at",
          ") VALUES (?, ?, 'thumbnail', ?, ?, ?, 'image/png', ?, ?)",
        ].join(" "),
      )
      .run(
        thumbnailCapabilityId,
        intentId,
        "d".repeat(64),
        RESTORE_THUMBNAIL_BYTES.length,
        RESTORE_THUMBNAIL_SHA256,
        90_000,
        1_100,
      );
    target
      .prepare("UPDATE upload_capabilities SET claimed_at = ? WHERE id = ?")
      .run(1_200, thumbnailCapabilityId);
    target
      .prepare(
        "INSERT INTO media_blobs (id, intent_id, kind, content, size_bytes, sha256, mime, created_at) VALUES (?, ?, 'thumbnail', ?, ?, ?, 'image/png', ?)",
      )
      .run(
        thumbnailBlobId,
        intentId,
        RESTORE_THUMBNAIL_BYTES,
        RESTORE_THUMBNAIL_BYTES.length,
        RESTORE_THUMBNAIL_SHA256,
        1_300,
      );
    target
      .prepare("UPDATE upload_capabilities SET used_at = ? WHERE id = ?")
      .run(1_400, thumbnailCapabilityId);
  }
  target
    .prepare(
      [
        "INSERT INTO videos (",
        "id, intent_id, agent_id, channel_id, title, duration_seconds, size_bytes,",
        "sha256, provenance_json, video_blob_id, thumbnail_blob_id, created_at, updated_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      videoId,
      intentId,
      agentId,
      channelId,
      "Restore publication evidence",
      60,
      RESTORE_VIDEO_BYTES.length,
      RESTORE_VIDEO_SHA256,
      "{}",
      blobId,
      thumbnailBlobId,
      2_000,
      2_000,
    );
  target
    .prepare("UPDATE upload_intents SET status = 'finalized', finalized_at = ? WHERE id = ?")
    .run(2_100, intentId);

  return {
    agentId,
    blobId,
    capabilityId,
    channelId,
    intentId,
    thumbnailBlobId,
    thumbnailCapabilityId,
    videoId,
  };
}

function insertPublishedVideoWithApproval(
  target: Database,
  options: { withThumbnail?: boolean } = {},
): {
  agentId: string;
  blobId: string;
  capabilityId: string;
  channelId: string;
  intentId: string;
  reviewId: string;
  thumbnailBlobId: string | null;
  thumbnailCapabilityId: string | null;
  videoId: string;
} {
  const fixture = insertFinalizedVideo(target, options);
  const userId = "usr_restore_reviewer";
  const reviewId = "rev_restore_publication";

  target
    .prepare(
      "INSERT INTO users (id, github_id, github_login, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'reviewer', 'active', ?, ?)",
    )
    .run(userId, 9_001, "restore-reviewer", "Restore Reviewer", 1_000, 1_000);
  target
    .prepare(
      "INSERT INTO moderation_reviews (id, video_id, reviewer_user_id, decision, reason, created_at) VALUES (?, ?, ?, 'approved', ?, ?)",
    )
    .run(reviewId, fixture.videoId, userId, "Approved before publication.", 2_500);
  target
    .prepare(
      "UPDATE videos SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
    )
    .run(3_000, 3_000, fixture.videoId);

  return { ...fixture, reviewId };
}

async function expectStaleSearchRestoreRejection(options: {
  activeBytesBefore: Buffer;
  activeDatabasePath: string;
  candidatePath: string;
  fixtureDirectory: string;
}): Promise<void> {
  const candidateBytesBefore = readFileSync(options.candidatePath);

  await expect(
    restoreDatabaseFromBackup({
      activeDatabasePath: options.activeDatabasePath,
      backupPath: options.candidatePath,
      migrationsDirectory: repositoryMigrationsDirectory,
    }),
  ).rejects.toThrow("Database search index contents do not match videos.");

  expect(readFileSync(options.activeDatabasePath)).toEqual(options.activeBytesBefore);
  expect(readFileSync(options.candidatePath)).toEqual(candidateBytesBefore);
  expect(existsSync(join(options.fixtureDirectory, "backups"))).toBe(false);
  expect(
    readdirSync(options.fixtureDirectory).filter((name) => name.includes(".restore-")),
  ).toEqual([]);

  const active = openDatabase(options.activeDatabasePath);
  try {
    expect(getMigrationStatus(active, repositoryMigrationsDirectory)).toMatchObject({
      currentVersion: 3,
      latestVersion: 3,
      pendingMigrations: [],
    });
  } finally {
    active.close();
  }
}

afterEach(() => {
  database?.close();
  database = undefined;

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe("applyMigrations", () => {
  it("treats an empty migrations directory as a no-op", () => {
    const fixture = createFixture();

    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([]);
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 0,
    });
  });

  it("applies numbered SQL once in numeric order", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0002_insert_probe.sql"),
      "INSERT INTO migration_probe (step) VALUES (2); -- recovery: restore backup",
    );
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_create_probe.sql"),
      "CREATE TABLE migration_probe (step INTEGER NOT NULL); INSERT INTO migration_probe (step) VALUES (1); -- recovery: restore backup",
    );

    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1, 2]);
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([]);
    expect(
      fixture.database.prepare("SELECT step FROM migration_probe ORDER BY rowid").all(),
    ).toEqual([{ step: 1 }, { step: 2 }]);
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 2,
    });
    expect(
      fixture.database
        .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([
      { version: 1, name: "0001_create_probe.sql" },
      { version: 2, name: "0002_insert_probe.sql" },
    ]);
  });

  it("fails closed when an applied migration name or content drifts", () => {
    const fixture = createFixture();
    const originalPath = join(fixture.migrationsDirectory, "0001_probe.sql");
    const renamedPath = join(fixture.migrationsDirectory, "0001_renamed_probe.sql");
    const originalSql = "CREATE TABLE drift_probe (id INTEGER); -- recovery: restore backup";
    writeFileSync(originalPath, originalSql);

    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);

    writeFileSync(
      originalPath,
      "CREATE TABLE drift_probe (id INTEGER, changed TEXT); -- recovery: restore backup",
    );
    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "checksum mismatch",
    );

    writeFileSync(originalPath, originalSql);
    rmSync(originalPath);
    writeFileSync(renamedPath, originalSql);
    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "name mismatch",
    );
  });

  it("rejects a nonzero user_version without repository-runner metadata", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE probe (id INTEGER); -- recovery: restore backup",
    );
    fixture.database.exec("PRAGMA user_version = 1");

    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "has no schema_migrations metadata",
    );
  });

  it("rejects active schema drift before reporting that no migrations are pending", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const backupDirectory = join(fixtureDirectory, "backups");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      [
        "CREATE TABLE probe (id INTEGER PRIMARY KEY);",
        "CREATE TRIGGER probe_guard BEFORE DELETE ON probe BEGIN SELECT RAISE(ABORT, 'immutable'); END;",
        "-- recovery: restore backup",
      ].join("\n"),
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);

    fixture.database.exec("DROP TRIGGER probe_guard");

    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "Database schema does not match repository migrations.",
    );
    await expect(
      applyMigrationsWithBackup(
        fixture.database,
        databasePath,
        fixture.migrationsDirectory,
        backupDirectory,
      ),
    ).rejects.toThrow("Database schema does not match repository migrations.");
    expect(existsSync(backupDirectory)).toBe(false);
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
    expect(fixture.database.prepare("SELECT version, name FROM schema_migrations").all()).toEqual([
      { version: 1, name: "0001_probe.sql" },
    ]);
  });

  it("rejects active foreign-key violations before reporting a migrated database healthy", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_foreign_keys.sql"),
      [
        "CREATE TABLE parents (id INTEGER PRIMARY KEY);",
        "CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parents(id));",
        "-- recovery: restore backup",
      ].join("\n"),
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);

    fixture.database.exec("PRAGMA foreign_keys = OFF");
    fixture.database.prepare("INSERT INTO children (id, parent_id) VALUES (1, 999)").run();
    fixture.database.exec("PRAGMA foreign_keys = ON");

    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "SQLite foreign-key consistency check failed.",
    );
  });

  it("rejects non-pristine version-zero databases before backup or first migration", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE migration_probe (id INTEGER PRIMARY KEY); -- recovery: restore backup",
    );
    fixture.database.close();
    database = undefined;

    const candidates = [
      {
        path: join(fixtureDirectory, "unrelated-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("CREATE TABLE unrelated (id INTEGER)");
        },
      },
      {
        path: join(fixtureDirectory, "foreign-application-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("PRAGMA application_id = 1448234573");
        },
      },
      {
        path: join(fixtureDirectory, "sqlite-like-name-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("CREATE TABLE sqliteXunrelated (id INTEGER)");
        },
      },
    ];

    for (const candidateFixture of candidates) {
      const candidate = openDatabase(candidateFixture.path);
      candidateFixture.configure(candidate);
      candidate.close();
      const bytesBefore = readFileSync(candidateFixture.path);
      const migrationTarget = openDatabase(candidateFixture.path);
      const backupDirectory = `${candidateFixture.path}.backups`;

      try {
        await expect(
          applyMigrationsWithBackup(
            migrationTarget,
            candidateFixture.path,
            fixture.migrationsDirectory,
            backupDirectory,
          ),
        ).rejects.toThrow(
          "A migration version 0 database must be a pristine SQLite database with application_id 0.",
        );
        expect(migrationTarget.prepare("PRAGMA user_version").get()).toEqual({ user_version: 0 });
        expect(
          migrationTarget
            .prepare(
              "SELECT name FROM sqlite_schema WHERE name IN ('migration_probe', 'schema_migrations') ORDER BY name",
            )
            .all(),
        ).toEqual([]);
      } finally {
        migrationTarget.close();
      }

      expect(readFileSync(candidateFixture.path)).toEqual(bytesBefore);
      expect(existsSync(backupDirectory)).toBe(false);
    }
  });

  it("rolls back a failed migration without advancing user_version", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_invalid.sql"),
      "CREATE TABLE rollback_probe (id INTEGER); THIS IS NOT SQL; -- recovery: restore backup",
    );

    expect(() => applyMigrations(fixture.database, fixture.migrationsDirectory)).toThrow(
      "Migration 0001_invalid.sql failed.",
    );
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 0,
    });
    expect(
      fixture.database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'rollback_probe'")
        .get(),
    ).toBeUndefined();
  });

  it("rejects legacy v2 invariant violations before installing v3 guards", () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    expect(
      applyMigrations(
        fixture.database,
        repositoryMigrationsDirectory,
        detectMigrationCapabilities(fixture.database),
        2,
      ),
    ).toEqual([1, 2]);
    const { intentId, videoId } = insertPublishedVideoWithApproval(fixture.database);
    const ledgerBefore = fixture.database
      .prepare("SELECT version, name, sha256, applied_at FROM schema_migrations ORDER BY version")
      .all();

    const expectPreflightFailure = (expectedCause: string): void => {
      let migrationError: unknown;
      try {
        applyMigrations(fixture.database, repositoryMigrationsDirectory);
      } catch (error) {
        migrationError = error;
      }

      expect(migrationError).toBeInstanceOf(Error);
      expect((migrationError as Error).message).toBe(
        "Migration 0003_guard_reviewed_invariants.sql failed.",
      );
      expect((migrationError as Error & { cause?: { message?: string } }).cause?.message).toContain(
        expectedCause,
      );
      expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 2 });
      expect(
        fixture.database
          .prepare(
            "SELECT version, name, sha256, applied_at FROM schema_migrations ORDER BY version",
          )
          .all(),
      ).toEqual(ledgerBefore);
      expect(
        fixture.database
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE '%_v3' ORDER BY name",
          )
          .all(),
      ).toEqual([]);
      expect(
        fixture.database
          .prepare(
            "SELECT name FROM sqlite_temp_schema WHERE name LIKE 'vynema_v3_legacy_preflight%' ORDER BY name",
          )
          .all(),
      ).toEqual([]);
    };

    const legacyBlobUserId = Buffer.from("legacy-blob-user-id");
    fixture.database
      .prepare(
        "INSERT INTO users (id, github_id, github_login, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(legacyBlobUserId, 9_002, "legacy-blob-user", "Legacy Blob User", 1_000, 1_000);
    expect(
      fixture.database
        .prepare("SELECT typeof(id) AS storage FROM users WHERE github_id = ?")
        .get(9_002),
    ).toEqual({ storage: "blob" });
    expectPreflightFailure("legacy v2 identity keys must use text storage");
    expect(
      fixture.database
        .prepare("SELECT typeof(id) AS storage FROM users WHERE github_id = ?")
        .get(9_002),
    ).toEqual({ storage: "blob" });
    fixture.database.prepare("DELETE FROM users WHERE github_id = ?").run(9_002);

    fixture.database
      .prepare("UPDATE upload_intents SET status = 'created', finalized_at = NULL WHERE id = ?")
      .run(intentId);
    fixture.database.prepare("UPDATE videos SET published_at = ? WHERE id = ?").run(900, videoId);
    expectPreflightFailure("legacy v2 publication rows violate v3 invariants");
    expect(
      fixture.database
        .prepare(
          "SELECT i.status AS intent_status, i.finalized_at, v.status AS video_status, v.published_at FROM upload_intents i JOIN videos v ON v.intent_id = i.id WHERE i.id = ?",
        )
        .get(intentId),
    ).toEqual({
      intent_status: "created",
      finalized_at: null,
      video_status: "published",
      published_at: 900,
    });

    fixture.database
      .prepare("UPDATE upload_intents SET status = 'finalized', finalized_at = ? WHERE id = ?")
      .run(2_100, intentId);
    fixture.database.prepare("UPDATE videos SET published_at = ? WHERE id = ?").run(3_000, videoId);
    fixture.database
      .prepare("UPDATE upload_intents SET provenance_json = ? WHERE id = ?")
      .run("not-json", intentId);
    expectPreflightFailure("legacy v2 upload rows violate v3 invariants");
    expect(
      fixture.database
        .prepare(
          "SELECT i.provenance_json AS intent_provenance, v.provenance_json AS video_provenance FROM upload_intents i JOIN videos v ON v.intent_id = i.id WHERE i.id = ?",
        )
        .get(intentId),
    ).toEqual({ intent_provenance: "not-json", video_provenance: "{}" });

    fixture.database
      .prepare("UPDATE upload_intents SET provenance_json = ? WHERE id = ?")
      .run("{}", intentId);
    fixture.database
      .prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)")
      .run("legacy:negative", -1, -1);
    expectPreflightFailure("legacy v2 rate-limit rows violate v3 invariants");
    expect(
      fixture.database
        .prepare("SELECT window_start, count FROM rate_limits WHERE key = ?")
        .get("legacy:negative"),
    ).toEqual({ window_start: -1, count: -1 });

    fixture.database.prepare("DELETE FROM rate_limits WHERE key = ?").run("legacy:negative");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([3]);
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
    expect(
      fixture.database.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    expect(
      fixture.database
        .prepare(
          "SELECT name FROM sqlite_temp_schema WHERE name LIKE 'vynema_v3_legacy_preflight%' ORDER BY name",
        )
        .all(),
    ).toEqual([]);
    const identityTables = [
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
    ];
    expect(
      fixture.database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE '%_identity_storage_%_v3' ORDER BY name",
        )
        .all(),
    ).toEqual(
      identityTables
        .flatMap((table) => [
          { name: `${table}_identity_storage_insert_v3` },
          { name: `${table}_identity_storage_update_v3` },
        ])
        .sort((left, right) => left.name.localeCompare(right.name)),
    );

    const cleanupDatabase = openDatabase(join(fixtureDirectory, "v2-capability-purged.sqlite"));
    try {
      expect(
        applyMigrations(
          cleanupDatabase,
          repositoryMigrationsDirectory,
          detectMigrationCapabilities(cleanupDatabase),
          2,
        ),
      ).toEqual([1, 2]);
      const cleanupFixture = insertFinalizedVideo(cleanupDatabase);
      cleanupDatabase
        .prepare("DELETE FROM upload_capabilities WHERE id = ?")
        .run(cleanupFixture.capabilityId);

      expect(applyMigrations(cleanupDatabase, repositoryMigrationsDirectory)).toEqual([3]);
      expect(cleanupDatabase.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
      expect(
        cleanupDatabase
          .prepare(
            "SELECT v.id AS video_id, b.id AS blob_id FROM videos v JOIN media_blobs b ON b.id = v.video_blob_id WHERE v.id = ?",
          )
          .get(cleanupFixture.videoId),
      ).toEqual({ video_id: cleanupFixture.videoId, blob_id: cleanupFixture.blobId });
      expect(
        cleanupDatabase.prepare("SELECT COUNT(*) AS count FROM upload_capabilities").get(),
      ).toEqual({ count: 0 });
    } finally {
      cleanupDatabase.close();
    }
  });

  it("rejects malformed FTS5 capability markers without partial schema changes", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_invalid_marker.sql"),
      "CREATE TABLE marker_probe (id INTEGER); -- vynema:fts5:start\nCREATE TABLE unfinished (id INTEGER); -- recovery: restore backup",
    );

    expect(() =>
      applyMigrations(fixture.database, fixture.migrationsDirectory, { fts5: false }),
    ).toThrow("Migration 0001_invalid_marker.sql failed.");
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 0,
    });
    expect(
      fixture.database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'marker_probe'")
        .get(),
    ).toBeUndefined();
  });

  it("rejects gaps and database versions not represented by repository migrations", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE probe (id INTEGER); -- recovery: restore backup",
    );
    writeFileSync(
      join(fixture.migrationsDirectory, "0003_gap.sql"),
      "CREATE TABLE gap (id INTEGER); -- recovery: restore backup",
    );

    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "Missing migration version",
    );

    rmSync(join(fixture.migrationsDirectory, "0003_gap.sql"));
    fixture.database.exec("PRAGMA user_version = 2");

    expect(() => getMigrationStatus(fixture.database, fixture.migrationsDirectory)).toThrow(
      "newer than available migration",
    );
  });

  it("creates and verifies a timestamped backup before the first pending migration", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const backupDirectory = join(fixtureDirectory, "backups");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE backup_probe (id INTEGER); -- recovery: restore backup",
    );

    const result = await applyMigrationsWithBackup(
      fixture.database,
      databasePath,
      fixture.migrationsDirectory,
      backupDirectory,
      new Date("2026-08-27T00:00:00.000Z"),
    );

    expect(result.appliedVersions).toEqual([1]);
    expect(result.backupPath).toBe(
      join(backupDirectory, "database.sqlite.before-v0001.2026-08-27T00-00-00-000Z.bak"),
    );
    const backupPath = result.backupPath;

    if (!backupPath) {
      throw new Error("Pre-migration backup was not created.");
    }

    expect(existsSync(backupPath)).toBe(true);

    const backupCopy = openDatabase(backupPath);

    try {
      expect(backupCopy.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 0,
      });
      expect(
        backupCopy
          .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'backup_probe'")
          .get(),
      ).toBeUndefined();
    } finally {
      backupCopy.close();
    }

    await expect(
      applyMigrationsWithBackup(
        fixture.database,
        databasePath,
        fixture.migrationsDirectory,
        backupDirectory,
        new Date("2026-08-27T00:01:00.000Z"),
      ),
    ).resolves.toEqual({ appliedVersions: [], backupPath: null });
    expect(readdirSync(backupDirectory)).toHaveLength(1);
  });

  it("rejects an incompatible restore candidate without replacing the active database", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const incompatiblePath = join(fixtureDirectory, "incompatible.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE restore_probe (value TEXT NOT NULL); -- recovery: restore backup",
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("active-data");
    fixture.database.close();
    database = undefined;

    const activeBytesBefore = readFileSync(databasePath);
    const incompatible = openDatabase(incompatiblePath);

    try {
      incompatible.exec("CREATE TABLE unrelated (id INTEGER); PRAGMA user_version = 1");
    } finally {
      incompatible.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: incompatiblePath,
        migrationsDirectory: fixture.migrationsDirectory,
      }),
    ).rejects.toThrow("has no schema_migrations metadata");

    expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
    expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual([]);

    const active = openDatabase(databasePath);

    try {
      expect(active.prepare("SELECT value FROM restore_probe").get()).toEqual({
        value: "active-data",
      });
      expect(getMigrationStatus(active, fixture.migrationsDirectory)).toMatchObject({
        currentVersion: 1,
        latestVersion: 1,
        pendingMigrations: [],
      });
    } finally {
      active.close();
    }
  });

  it("rejects non-pristine version-zero restore candidates without replacing the active database", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE restore_probe (value TEXT NOT NULL); -- recovery: restore backup",
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("active-data");
    fixture.database.close();
    database = undefined;

    const activeBytesBefore = readFileSync(databasePath);
    const candidates = [
      {
        path: join(fixtureDirectory, "unrelated-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("CREATE TABLE unrelated (id INTEGER)");
        },
      },
      {
        path: join(fixtureDirectory, "foreign-application-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("PRAGMA application_id = 1448234573");
        },
      },
      {
        path: join(fixtureDirectory, "sqlite-like-name-v0.sqlite"),
        configure(candidate: Database): void {
          candidate.exec("CREATE TABLE sqliteXunrelated (id INTEGER)");
        },
      },
    ];

    for (const candidateFixture of candidates) {
      const candidate = openDatabase(candidateFixture.path);
      try {
        candidateFixture.configure(candidate);
      } finally {
        candidate.close();
      }

      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: candidateFixture.path,
          migrationsDirectory: fixture.migrationsDirectory,
        }),
      ).rejects.toThrow("migration version 0 database must be a pristine SQLite database");
      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  });

  it("accepts a pristine version-zero restore candidate", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const pristinePath = join(fixtureDirectory, "pristine-v0.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE restore_probe (value TEXT NOT NULL); -- recovery: restore backup",
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.close();
    database = undefined;

    const pristine = openDatabase(pristinePath);
    pristine.close();
    chmodSync(databasePath, 0o600);
    chmodSync(pristinePath, 0o644);

    const result = await restoreDatabaseFromBackup({
      activeDatabasePath: databasePath,
      backupPath: pristinePath,
      migrationsDirectory: fixture.migrationsDirectory,
    });

    expect(result.migrationStatus).toMatchObject({
      currentVersion: 0,
      latestVersion: 1,
    });
    expect(result.safetyBackupPath).not.toBeNull();
    expect(existsSync(result.safetyBackupPath ?? "")).toBe(true);
    expect(statSync(result.safetyBackupPath ?? "").mode & 0o777).toBe(0o600);
    expect(statSync(databasePath).mode & 0o777).toBe(0o600);
    expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual([]);

    const restored = openDatabase(databasePath);
    try {
      expect(restored.prepare("PRAGMA application_id").get()).toEqual({ application_id: 0 });
      expect(
        restored
          .prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name")
          .all(),
      ).toEqual([]);
    } finally {
      restored.close();
    }
  });

  it("rejects symlink and hard-link aliases of the active database before restore", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const symlinkPath = join(fixtureDirectory, "active-symlink.sqlite");
    const hardLinkPath = join(fixtureDirectory, "active-hard-link.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);
    symlinkSync(databasePath, symlinkPath);
    linkSync(databasePath, hardLinkPath);

    for (const aliasPath of [symlinkPath, hardLinkPath]) {
      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: aliasPath,
          migrationsDirectory: repositoryMigrationsDirectory,
        }),
      ).rejects.toThrow("The restore source must not be the active database.");
      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
    }
  });

  it("rejects restored non-text identity keys while preserving active and candidate bytes", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const canonicalSourcePath = join(fixtureDirectory, "canonical-identity-storage.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const canonicalSource = openDatabase(canonicalSourcePath);
    try {
      expect(applyMigrations(canonicalSource, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    } finally {
      canonicalSource.close();
    }

    const tamperingCases: {
      assertBlobStorage: (candidate: Database) => void;
      candidateName: string;
      tableName: string;
      tamper: (candidate: Database) => void;
      triggerName: string;
    }[] = [
      {
        candidateName: "blob-user-identity.sqlite",
        tableName: "users",
        triggerName: "users_identity_storage_insert_v3",
        tamper: (candidate) => {
          candidate
            .prepare(
              "INSERT INTO users (id, github_id, github_login, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(
              Buffer.from("restore-user-identity"),
              9_101,
              "restore-blob-user",
              "Restore Blob User",
              9_000,
              9_000,
            );
        },
        assertBlobStorage: (candidate) => {
          expect(
            candidate
              .prepare("SELECT typeof(id) AS storage FROM users WHERE github_id = ?")
              .get(9_101),
          ).toEqual({ storage: "blob" });
        },
      },
      {
        candidateName: "blob-composite-identity.sqlite",
        tableName: "agent_nonces",
        triggerName: "agent_nonces_identity_storage_insert_v3",
        tamper: (candidate) => {
          candidate
            .prepare(
              "INSERT INTO agent_nonces (agent_id, nonce, seen_at, expires_at) VALUES (?, ?, ?, ?)",
            )
            .run("agt_restore_identity", Buffer.from("restore-nonce-identity"), 9_100, 9_200);
        },
        assertBlobStorage: (candidate) => {
          expect(
            candidate
              .prepare(
                "SELECT typeof(agent_id) AS agent_storage, typeof(nonce) AS nonce_storage FROM agent_nonces WHERE seen_at = ?",
              )
              .get(9_100),
          ).toEqual({ agent_storage: "text", nonce_storage: "blob" });
        },
      },
    ];

    for (const tamperingCase of tamperingCases) {
      const candidatePath = join(fixtureDirectory, tamperingCase.candidateName);
      copyFileSync(canonicalSourcePath, candidatePath);
      const candidate = openDatabase(candidatePath);
      try {
        const triggerSql = getCanonicalTriggerSql(candidate, tamperingCase.triggerName);
        candidate.exec(`DROP TRIGGER ${tamperingCase.triggerName}`);
        tamperingCase.tamper(candidate);
        candidate.exec(triggerSql);
        tamperingCase.assertBlobStorage(candidate);
        expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
          currentVersion: 3,
          latestVersion: 3,
          pendingMigrations: [],
        });
      } finally {
        candidate.close();
      }

      const candidateBytesBefore = readFileSync(candidatePath);
      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: candidatePath,
          migrationsDirectory: repositoryMigrationsDirectory,
        }),
      ).rejects.toThrow(
        `Restore candidate table ${tamperingCase.tableName} has a primary key value that does not use TEXT storage.`,
      );

      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(readFileSync(candidatePath)).toEqual(candidateBytesBefore);
      expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  });

  it("rejects a restored published video after its approval evidence is removed", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const candidatePath = join(fixtureDirectory, "published-without-approval.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const candidate = openDatabase(candidatePath);
    try {
      expect(applyMigrations(candidate, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      const { reviewId, videoId } = insertPublishedVideoWithApproval(candidate);
      const approvalDeleteTriggerSql = getCanonicalTriggerSql(
        candidate,
        "moderation_review_publication_delete_v3",
      );
      candidate.exec("DROP TRIGGER moderation_review_publication_delete_v3");
      candidate.prepare("DELETE FROM moderation_reviews WHERE id = ?").run(reviewId);
      candidate.exec(approvalDeleteTriggerSql);
      expect(candidate.prepare("SELECT status FROM videos WHERE id = ?").get(videoId)).toEqual({
        status: "published",
      });
      expect(candidate.prepare("SELECT COUNT(*) AS count FROM moderation_reviews").get()).toEqual({
        count: 0,
      });
      expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
        currentVersion: 3,
        latestVersion: 3,
        pendingMigrations: [],
      });
    } finally {
      candidate.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: candidatePath,
        migrationsDirectory: repositoryMigrationsDirectory,
      }),
    ).rejects.toThrow("published or taken down without retained approval evidence");

    expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
    expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
    expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual([]);

    const active = openDatabase(databasePath);
    try {
      expect(getMigrationStatus(active, repositoryMigrationsDirectory)).toMatchObject({
        currentVersion: 3,
        latestVersion: 3,
        pendingMigrations: [],
      });
    } finally {
      active.close();
    }
  });

  it("rejects post-publication approval and invalid timelines but accepts retained historical reviewer evidence", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const lateApprovalPath = join(fixtureDirectory, "post-publication-approval.sqlite");
    const invalidTimelinePath = join(fixtureDirectory, "invalid-takedown-timeline.sqlite");
    const historicalApprovalPath = join(fixtureDirectory, "historical-approval.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const lateApproval = openDatabase(lateApprovalPath);
    try {
      expect(applyMigrations(lateApproval, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      const { reviewId } = insertPublishedVideoWithApproval(lateApproval);
      const approvalUpdateTriggerSql = getCanonicalTriggerSql(
        lateApproval,
        "moderation_review_publication_update_v3",
      );
      lateApproval.exec("DROP TRIGGER moderation_review_publication_update_v3");
      lateApproval
        .prepare("UPDATE moderation_reviews SET created_at = ? WHERE id = ?")
        .run(3_500, reviewId);
      lateApproval.exec(approvalUpdateTriggerSql);
    } finally {
      lateApproval.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: lateApprovalPath,
        migrationsDirectory: repositoryMigrationsDirectory,
      }),
    ).rejects.toThrow("published or taken down without retained approval evidence");
    expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
    expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);

    const invalidTimeline = openDatabase(invalidTimelinePath);
    try {
      expect(applyMigrations(invalidTimeline, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      const { videoId } = insertPublishedVideoWithApproval(invalidTimeline);
      const takedownTriggerSql = getCanonicalTriggerSql(
        invalidTimeline,
        "videos_takedown_transition_v3",
      );
      invalidTimeline.exec("DROP TRIGGER videos_takedown_transition_v3");
      invalidTimeline
        .prepare("UPDATE videos SET status = 'taken_down', taken_down_at = ? WHERE id = ?")
        .run(2_900, videoId);
      invalidTimeline.exec(takedownTriggerSql);
      expect(getMigrationStatus(invalidTimeline, repositoryMigrationsDirectory)).toMatchObject({
        currentVersion: 3,
        latestVersion: 3,
        pendingMigrations: [],
      });
    } finally {
      invalidTimeline.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: invalidTimelinePath,
        migrationsDirectory: repositoryMigrationsDirectory,
      }),
    ).rejects.toThrow("valid publication timeline");
    expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
    expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);

    const historicalApproval = openDatabase(historicalApprovalPath);
    try {
      expect(applyMigrations(historicalApproval, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      const { videoId } = insertPublishedVideoWithApproval(historicalApproval);
      historicalApproval
        .prepare("UPDATE users SET role = 'viewer', status = 'banned' WHERE github_login = ?")
        .run("restore-reviewer");
      expect(
        historicalApproval.prepare("SELECT status FROM videos WHERE id = ?").get(videoId),
      ).toEqual({ status: "published" });
    } finally {
      historicalApproval.close();
    }

    const result = await restoreDatabaseFromBackup({
      activeDatabasePath: databasePath,
      backupPath: historicalApprovalPath,
      migrationsDirectory: repositoryMigrationsDirectory,
    });
    expect(result.migrationStatus).toMatchObject({
      currentVersion: 3,
      latestVersion: 3,
      pendingMigrations: [],
    });
    expect(result.safetyBackupPath).not.toBeNull();
    const restored = openDatabase(databasePath);
    try {
      expect(
        restored
          .prepare(
            "SELECT v.status, u.role, u.status AS reviewer_status FROM videos v JOIN moderation_reviews r ON r.video_id = v.id JOIN users u ON u.id = r.reviewer_user_id",
          )
          .get(),
      ).toEqual({ status: "published", role: "viewer", reviewer_status: "banned" });
    } finally {
      restored.close();
    }
  });

  it("accepts canonical cleanup and rejects causal regressions after evidence purge", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    fixture.database.close();
    database = undefined;
    const rejectedCandidatePath = join(fixtureDirectory, "rejected-media-purged.sqlite");
    const rejectedRestorePath = join(fixtureDirectory, "rejected-media-restored.sqlite");
    const rejectedTimelineCandidatePath = join(
      fixtureDirectory,
      "rejected-video-before-intent.sqlite",
    );
    const rejectedTimelineRestorePath = join(
      fixtureDirectory,
      "rejected-video-before-intent-restored.sqlite",
    );
    const capabilityCandidatePath = join(fixtureDirectory, "capability-purged.sqlite");
    const capabilityRestorePath = join(fixtureDirectory, "capability-restored.sqlite");
    const capabilityTimelineCandidatePath = join(
      fixtureDirectory,
      "capability-purged-video-before-blob.sqlite",
    );
    const capabilityTimelineRestorePath = join(
      fixtureDirectory,
      "capability-purged-video-before-blob-restored.sqlite",
    );

    const rejectedCandidate = openDatabase(rejectedCandidatePath);
    let finalizedEvidenceTriggerSql = "";
    let rejectedIntentId = "";
    let rejectedVideoId = "";
    try {
      expect(applyMigrations(rejectedCandidate, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      const rejectedFixture = insertFinalizedVideo(rejectedCandidate);
      rejectedIntentId = rejectedFixture.intentId;
      rejectedVideoId = rejectedFixture.videoId;
      finalizedEvidenceTriggerSql = getCanonicalTriggerSql(
        rejectedCandidate,
        "videos_finalized_evidence_immutable_v3",
      );
      rejectedCandidate
        .prepare(
          "UPDATE videos SET status = 'rejected', rejected_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(3_000, 3_000, rejectedFixture.videoId);
      rejectedCandidate
        .prepare("UPDATE videos SET video_blob_id = NULL WHERE id = ?")
        .run(rejectedFixture.videoId);
      rejectedCandidate.prepare("DELETE FROM media_blobs WHERE id = ?").run(rejectedFixture.blobId);
    } finally {
      rejectedCandidate.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: rejectedRestorePath,
        backupPath: rejectedCandidatePath,
        migrationsDirectory: repositoryMigrationsDirectory,
      }),
    ).resolves.toMatchObject({
      safetyBackupPath: null,
      migrationStatus: { currentVersion: 3, latestVersion: 3, pendingMigrations: [] },
    });
    const rejectedRestore = openDatabase(rejectedRestorePath);
    try {
      expect(
        rejectedRestore
          .prepare("SELECT status, video_blob_id FROM videos WHERE id = ?")
          .get(rejectedVideoId),
      ).toEqual({ status: "rejected", video_blob_id: null });
    } finally {
      rejectedRestore.close();
    }

    const capabilityCandidate = openDatabase(capabilityCandidatePath);
    let retainedBlobId = "";
    let capabilityVideoId = "";
    try {
      expect(applyMigrations(capabilityCandidate, repositoryMigrationsDirectory)).toEqual([
        1, 2, 3,
      ]);
      const capabilityFixture = insertFinalizedVideo(capabilityCandidate);
      retainedBlobId = capabilityFixture.blobId;
      capabilityVideoId = capabilityFixture.videoId;
      capabilityCandidate
        .prepare("DELETE FROM upload_capabilities WHERE id = ?")
        .run(capabilityFixture.capabilityId);
    } finally {
      capabilityCandidate.close();
    }

    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: capabilityRestorePath,
        backupPath: capabilityCandidatePath,
        migrationsDirectory: repositoryMigrationsDirectory,
      }),
    ).resolves.toMatchObject({
      safetyBackupPath: null,
      migrationStatus: { currentVersion: 3, latestVersion: 3, pendingMigrations: [] },
    });
    const capabilityRestore = openDatabase(capabilityRestorePath);
    try {
      expect(
        capabilityRestore.prepare("SELECT id FROM media_blobs WHERE id = ?").get(retainedBlobId),
      ).toEqual({ id: retainedBlobId });
      expect(
        capabilityRestore.prepare("SELECT COUNT(*) AS count FROM upload_capabilities").get(),
      ).toEqual({ count: 0 });
    } finally {
      capabilityRestore.close();
    }

    const causalTimelineCases: {
      activePath: string;
      candidatePath: string;
      expectedViolation: string;
      sourcePath: string;
      tamper: (candidate: Database) => void;
    }[] = [
      {
        activePath: rejectedTimelineRestorePath,
        candidatePath: rejectedTimelineCandidatePath,
        expectedViolation: "has invalid finalized lifecycle evidence",
        sourcePath: rejectedCandidatePath,
        tamper: (candidate) => {
          candidate
            .prepare("DELETE FROM upload_capabilities WHERE intent_id = ?")
            .run(rejectedIntentId);
          candidate
            .prepare("UPDATE videos SET created_at = ? WHERE id = ?")
            .run(900, rejectedVideoId);
        },
      },
      {
        activePath: capabilityTimelineRestorePath,
        candidatePath: capabilityTimelineCandidatePath,
        expectedViolation: "does not match a claimed upload capability",
        sourcePath: capabilityCandidatePath,
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE videos SET created_at = ? WHERE id = ?")
            .run(1_200, capabilityVideoId);
        },
      },
    ];

    for (const causalTimelineCase of causalTimelineCases) {
      copyFileSync(causalTimelineCase.sourcePath, causalTimelineCase.candidatePath);
      const candidate = openDatabase(causalTimelineCase.candidatePath);
      try {
        candidate.exec("DROP TRIGGER videos_finalized_evidence_immutable_v3");
        causalTimelineCase.tamper(candidate);
        candidate.exec(finalizedEvidenceTriggerSql);
        expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
          currentVersion: 3,
          latestVersion: 3,
          pendingMigrations: [],
        });
      } finally {
        candidate.close();
      }

      const candidateBytesBefore = readFileSync(causalTimelineCase.candidatePath);
      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: causalTimelineCase.activePath,
          backupPath: causalTimelineCase.candidatePath,
          migrationsDirectory: repositoryMigrationsDirectory,
        }),
      ).rejects.toThrow(causalTimelineCase.expectedViolation);

      expect(existsSync(causalTimelineCase.activePath)).toBe(false);
      expect(readFileSync(causalTimelineCase.candidatePath)).toEqual(candidateBytesBefore);
      expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  });

  it("rejects restored video bindings corrupted while canonical guards were absent", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const canonicalSourcePath = join(fixtureDirectory, "canonical-video-bindings.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const canonicalSource = openDatabase(canonicalSourcePath);
    let mediaReferenceTriggerSql = "";
    let finalizedEvidenceTriggerSql = "";
    let videoId = "";
    try {
      expect(applyMigrations(canonicalSource, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      ({ videoId } = insertPublishedVideoWithApproval(canonicalSource));
      mediaReferenceTriggerSql = getCanonicalTriggerSql(
        canonicalSource,
        "videos_media_refs_update",
      );
      finalizedEvidenceTriggerSql = getCanonicalTriggerSql(
        canonicalSource,
        "videos_finalized_evidence_immutable_v3",
      );
    } finally {
      canonicalSource.close();
    }

    const tamperingCases: {
      candidateName: string;
      expectedViolation: string;
      tamper: (candidate: Database) => void;
    }[] = [
      {
        candidateName: "stale-video-intent-owner.sqlite",
        expectedViolation: "invalid intent ownership binding",
        tamper: (candidate) => {
          const mismatchedAgentId = "agt_restore_mismatch";
          candidate
            .prepare(
              "INSERT INTO agents (id, display_name, owner_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(mismatchedAgentId, "Mismatched Restore Agent", "@restore-mismatch", 4_000, 4_000);
          candidate
            .prepare("UPDATE videos SET agent_id = ? WHERE id = ?")
            .run(mismatchedAgentId, videoId);
        },
      },
      {
        candidateName: "stale-video-blob-metadata.sqlite",
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE videos SET size_bytes = size_bytes + 1 WHERE id = ?")
            .run(videoId);
        },
      },
    ];

    for (const tamperingCase of tamperingCases) {
      const candidatePath = join(fixtureDirectory, tamperingCase.candidateName);
      copyFileSync(canonicalSourcePath, candidatePath);
      const candidate = openDatabase(candidatePath);
      try {
        candidate.exec("DROP TRIGGER videos_media_refs_update");
        candidate.exec("DROP TRIGGER videos_finalized_evidence_immutable_v3");
        tamperingCase.tamper(candidate);
        candidate.exec(mediaReferenceTriggerSql);
        candidate.exec(finalizedEvidenceTriggerSql);
        expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
          currentVersion: 3,
          latestVersion: 3,
          pendingMigrations: [],
        });
      } finally {
        candidate.close();
      }

      const candidateBytesBefore = readFileSync(candidatePath);
      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: candidatePath,
          migrationsDirectory: repositoryMigrationsDirectory,
        }),
      ).rejects.toThrow(tamperingCase.expectedViolation);

      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(readFileSync(candidatePath)).toEqual(candidateBytesBefore);
      expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  });

  it("rejects restored upload provenance corrupted while canonical guards were absent", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const canonicalSourcePath = join(fixtureDirectory, "canonical-upload-provenance.sqlite");
    const validRestorePath = join(fixtureDirectory, "valid-upload-provenance.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const triggerNames = [
      "media_blob_immutable",
      "moderation_review_publication_delete_v3",
      "rate_limits_nonnegative_insert_v3",
      "upload_intent_declaration_immutable",
      "upload_intent_finalized_immutable_v3",
      "upload_capability_complete_requires_blob",
      "upload_capability_completion_order_v3",
      "upload_capability_scope_immutable",
      "upload_capability_state_monotonic",
      "videos_finalized_intent_delete_v3",
      "videos_finalized_evidence_immutable_v3",
      "videos_finalized_media_update_v3",
      "videos_provenance_update_v3",
    ] as const;
    const canonicalTriggerSql = new Map<string, string>();
    const canonicalSource = openDatabase(canonicalSourcePath);
    let intentId = "";
    const unusedIntentId = "int_restore_unused_capability";
    try {
      expect(applyMigrations(canonicalSource, repositoryMigrationsDirectory)).toEqual([1, 2, 3]);
      ({ intentId } = insertPublishedVideoWithApproval(canonicalSource, { withThumbnail: true }));
      canonicalSource
        .prepare(
          [
            "INSERT INTO upload_intents (",
            "id, agent_id, channel_id, declared_video_bytes, declared_video_sha256,",
            "declared_mime, declared_duration_seconds, title, provenance_json, created_at, expires_at",
            ") VALUES (?, ?, ?, ?, ?, 'video/mp4', ?, ?, '{}', ?, ?)",
          ].join(" "),
        )
        .run(
          unusedIntentId,
          "agt_abcdef123456",
          "chn_restore_publication",
          RESTORE_VIDEO_BYTES.length,
          "d".repeat(64),
          30,
          "Unused restore capability",
          1_000,
          100_000,
        );
      canonicalSource
        .prepare(
          [
            "INSERT INTO upload_capabilities (",
            "id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256,",
            "expected_mime, expires_at, created_at",
            ") VALUES (?, ?, 'video', ?, ?, ?, 'video/mp4', ?, ?)",
          ].join(" "),
        )
        .run(
          "cap_restore_unused",
          unusedIntentId,
          "e".repeat(64),
          RESTORE_VIDEO_BYTES.length,
          "d".repeat(64),
          90_000,
          1_100,
        );
      canonicalSource
        .prepare("UPDATE upload_capabilities SET claimed_at = ? WHERE intent_id = ?")
        .run(1_200, unusedIntentId);

      for (const triggerName of triggerNames) {
        canonicalTriggerSql.set(triggerName, getCanonicalTriggerSql(canonicalSource, triggerName));
      }
    } finally {
      canonicalSource.close();
    }

    const canonicalSourceBytes = readFileSync(canonicalSourcePath);
    const validRestoreResult = await restoreDatabaseFromBackup({
      activeDatabasePath: validRestorePath,
      backupPath: canonicalSourcePath,
      migrationsDirectory: repositoryMigrationsDirectory,
    });
    expect(validRestoreResult.safetyBackupPath).toBeNull();
    expect(validRestoreResult.migrationStatus).toMatchObject({
      currentVersion: 3,
      latestVersion: 3,
      pendingMigrations: [],
    });
    expect(readFileSync(canonicalSourcePath)).toEqual(canonicalSourceBytes);
    const validRestore = openDatabase(validRestorePath);
    try {
      expect(
        validRestore
          .prepare(
            "SELECT i.status, c.used_at FROM upload_intents i JOIN upload_capabilities c ON c.intent_id = i.id WHERE i.id = ? AND c.kind = 'video'",
          )
          .get(intentId),
      ).toEqual({ status: "finalized", used_at: 1_400 });
    } finally {
      validRestore.close();
    }

    const tamperingCases: {
      candidateName: string;
      droppedTriggers: (typeof triggerNames)[number][];
      expectedViolation: string;
      tamper: (candidate: Database) => void;
    }[] = [
      {
        candidateName: "stale-capability-declaration.sqlite",
        droppedTriggers: [
          "upload_intent_declaration_immutable",
          "upload_intent_finalized_immutable_v3",
        ],
        expectedViolation: "does not match its intent declaration",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_intents SET declared_video_sha256 = ? WHERE id = ?")
            .run("c".repeat(64), intentId);
        },
      },
      {
        candidateName: "stale-blob-capability-metadata.sqlite",
        droppedTriggers: [
          "upload_intent_declaration_immutable",
          "upload_intent_finalized_immutable_v3",
          "upload_capability_scope_immutable",
        ],
        expectedViolation: "does not match a claimed upload capability",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_intents SET declared_video_sha256 = ? WHERE id = ?")
            .run("c".repeat(64), intentId);
          candidate
            .prepare(
              "UPDATE upload_capabilities SET expected_sha256 = ? WHERE intent_id = ? AND kind = 'video'",
            )
            .run("c".repeat(64), intentId);
        },
      },
      {
        candidateName: "same-length-media-content-tamper.sqlite",
        droppedTriggers: ["media_blob_immutable"],
        expectedViolation: "content does not match its SHA-256 metadata",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE media_blobs SET content = ? WHERE intent_id = ? AND kind = 'video'")
            .run(Buffer.alloc(RESTORE_VIDEO_BYTES.length, 9), intentId);
        },
      },
      {
        candidateName: "unclaimed-blob-capability.sqlite",
        droppedTriggers: ["upload_capability_state_monotonic"],
        expectedViolation: "does not match a claimed upload capability",
        tamper: (candidate) => {
          candidate
            .prepare(
              "UPDATE upload_capabilities SET claimed_at = NULL, used_at = NULL WHERE intent_id = ? AND kind = 'video'",
            )
            .run(intentId);
        },
      },
      {
        candidateName: "claim-before-capability-created.sqlite",
        droppedTriggers: ["upload_capability_state_monotonic"],
        expectedViolation: "was claimed outside its authorization window",
        tamper: (candidate) => {
          candidate
            .prepare(
              "UPDATE upload_capabilities SET claimed_at = ? WHERE intent_id = ? AND kind = 'video'",
            )
            .run(1_050, intentId);
        },
      },
      {
        candidateName: "blob-before-capability-claim.sqlite",
        droppedTriggers: ["media_blob_immutable"],
        expectedViolation: "does not match a claimed upload capability",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE media_blobs SET created_at = ? WHERE intent_id = ? AND kind = 'video'")
            .run(1_100, intentId);
        },
      },
      {
        candidateName: "capability-used-before-blob.sqlite",
        droppedTriggers: [
          "upload_capability_completion_order_v3",
          "upload_capability_state_monotonic",
        ],
        expectedViolation: "has no matching media blob",
        tamper: (candidate) => {
          candidate
            .prepare(
              "UPDATE upload_capabilities SET used_at = ? WHERE intent_id = ? AND kind = 'video'",
            )
            .run(1_250, intentId);
        },
      },
      {
        candidateName: "used-after-capability-expiry.sqlite",
        droppedTriggers: [
          "upload_capability_complete_requires_blob",
          "upload_capability_state_monotonic",
        ],
        expectedViolation: "was used outside its authorization window",
        tamper: (candidate) => {
          candidate
            .prepare(
              "UPDATE upload_capabilities SET used_at = ? WHERE intent_id = ? AND kind = 'video'",
            )
            .run(95_000, intentId);
        },
      },
      {
        candidateName: "used-after-intent-expiry.sqlite",
        droppedTriggers: ["upload_intent_finalized_immutable_v3"],
        expectedViolation: "was used outside its authorization window",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_intents SET expires_at = ? WHERE id = ?")
            .run(1_300, intentId);
        },
      },
      {
        candidateName: "used-capability-without-blob.sqlite",
        droppedTriggers: [
          "upload_capability_complete_requires_blob",
          "upload_capability_completion_order_v3",
        ],
        expectedViolation: "used upload capability cap_restore_unused has no matching media blob",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_capabilities SET used_at = ? WHERE intent_id = ?")
            .run(1_400, unusedIntentId);
        },
      },
      {
        candidateName: "finalized-before-video-created.sqlite",
        droppedTriggers: ["upload_intent_finalized_immutable_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_intents SET finalized_at = ? WHERE id = ?")
            .run(1_900, intentId);
        },
      },
      {
        candidateName: "video-created-before-capability-use.sqlite",
        droppedTriggers: ["videos_finalized_evidence_immutable_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE videos SET created_at = ? WHERE intent_id = ?")
            .run(1_300, intentId);
        },
      },
      {
        candidateName: "finalized-duration-mismatch.sqlite",
        droppedTriggers: ["upload_intent_finalized_immutable_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE upload_intents SET declared_duration_seconds = ? WHERE id = ?")
            .run(61, intentId);
        },
      },
      {
        candidateName: "finalized-declared-thumbnail-missing.sqlite",
        droppedTriggers: ["videos_finalized_media_update_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE videos SET thumbnail_blob_id = NULL WHERE intent_id = ?")
            .run(intentId);
        },
      },
      {
        candidateName: "non-finalized-intent-with-video.sqlite",
        droppedTriggers: ["upload_intent_finalized_immutable_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare(
              "UPDATE upload_intents SET status = 'created', finalized_at = NULL WHERE id = ?",
            )
            .run(intentId);
        },
      },
      {
        candidateName: "finalized-intent-without-video.sqlite",
        droppedTriggers: [
          "moderation_review_publication_delete_v3",
          "videos_finalized_intent_delete_v3",
        ],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare(
              "DELETE FROM moderation_reviews WHERE video_id IN (SELECT id FROM videos WHERE intent_id = ?)",
            )
            .run(intentId);
          candidate.prepare("DELETE FROM videos WHERE intent_id = ?").run(intentId);
        },
      },
      {
        candidateName: "video-provenance-mismatch.sqlite",
        droppedTriggers: ["videos_finalized_evidence_immutable_v3", "videos_provenance_update_v3"],
        expectedViolation: "has invalid finalized lifecycle evidence",
        tamper: (candidate) => {
          candidate
            .prepare("UPDATE videos SET provenance_json = ? WHERE intent_id = ?")
            .run('{"model":"tampered"}', intentId);
        },
      },
      {
        candidateName: "negative-rate-limit-state.sqlite",
        droppedTriggers: ["rate_limits_nonnegative_insert_v3"],
        expectedViolation: "has negative state",
        tamper: (candidate) => {
          candidate
            .prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)")
            .run("comment:tampered", -1, -1);
        },
      },
    ];

    for (const tamperingCase of tamperingCases) {
      const candidatePath = join(fixtureDirectory, tamperingCase.candidateName);
      copyFileSync(canonicalSourcePath, candidatePath);
      const candidate = openDatabase(candidatePath);
      try {
        for (const triggerName of tamperingCase.droppedTriggers) {
          candidate.exec(`DROP TRIGGER ${triggerName}`);
        }
        tamperingCase.tamper(candidate);
        for (const triggerName of tamperingCase.droppedTriggers) {
          const triggerSql = canonicalTriggerSql.get(triggerName);
          if (!triggerSql) {
            throw new Error(`Missing captured SQL for canonical trigger ${triggerName}.`);
          }
          candidate.exec(triggerSql);
        }
        expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
          currentVersion: 3,
          latestVersion: 3,
          pendingMigrations: [],
        });
      } finally {
        candidate.close();
      }

      const candidateBytesBefore = readFileSync(candidatePath);
      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: candidatePath,
          migrationsDirectory: repositoryMigrationsDirectory,
        }),
      ).rejects.toThrow(tamperingCase.expectedViolation);

      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(readFileSync(candidatePath)).toEqual(candidateBytesBefore);
      expect(existsSync(join(fixtureDirectory, "backups"))).toBe(false);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  }, 45_000);

  it("rejects a stale portable search index during status, startup, and restore", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const candidatePath = join(fixtureDirectory, "stale-portable-search.sqlite");
    expect(
      applyMigrations(fixture.database, repositoryMigrationsDirectory, { fts5: false }),
    ).toEqual([1, 2, 3]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const candidate = openDatabase(candidatePath);
    try {
      expect(applyMigrations(candidate, repositoryMigrationsDirectory, { fts5: false })).toEqual([
        1, 2, 3,
      ]);
      expect(getSearchIndexMode(candidate)).toBe("portable");
      const { videoId } = insertPublishedVideoWithApproval(candidate);
      const video = candidate
        .prepare("SELECT rowid, title, description FROM videos WHERE id = ?")
        .get(videoId) as SearchVideoRow;
      candidate
        .prepare("UPDATE videos_fts SET title = ? WHERE rowid = ?")
        .run("Stale portable title", video.rowid);
      expect(
        candidate.prepare("SELECT title FROM videos_fts WHERE rowid = ?").get(video.rowid),
      ).toEqual({ title: "Stale portable title" });
      expect(() => getMigrationStatus(candidate, repositoryMigrationsDirectory)).toThrow(
        "Database search index contents do not match videos.",
      );
      const rejectedBackupDirectory = join(fixtureDirectory, "stale-status-backups");
      await expect(
        applyMigrationsWithBackup(
          candidate,
          candidatePath,
          repositoryMigrationsDirectory,
          rejectedBackupDirectory,
        ),
      ).rejects.toThrow("Database search index contents do not match videos.");
      expect(existsSync(rejectedBackupDirectory)).toBe(false);
    } finally {
      candidate.close();
    }

    await expectStaleSearchRestoreRejection({
      activeBytesBefore,
      activeDatabasePath: databasePath,
      candidatePath,
      fixtureDirectory,
    });
  });

  it.runIf(RUNTIME_HAS_FTS5)(
    "rejects a stale FTS5 external-content index during migration status validation and restore",
    async () => {
      const fixture = createFixture();
      const fixtureDirectory = temporaryDirectory;

      if (!fixtureDirectory) {
        throw new Error("Temporary migration directory was not created.");
      }

      const databasePath = join(fixtureDirectory, "database.sqlite");
      const candidatePath = join(fixtureDirectory, "stale-fts5-search.sqlite");
      expect(
        applyMigrations(fixture.database, repositoryMigrationsDirectory, { fts5: true }),
      ).toEqual([1, 2, 3]);
      fixture.database.close();
      database = undefined;
      const activeBytesBefore = readFileSync(databasePath);

      const candidate = openDatabase(candidatePath);
      try {
        expect(applyMigrations(candidate, repositoryMigrationsDirectory, { fts5: true })).toEqual([
          1, 2, 3,
        ]);
        expect(getSearchIndexMode(candidate)).toBe("fts5");
        const { videoId } = insertPublishedVideoWithApproval(candidate);
        const video = candidate
          .prepare("SELECT rowid, title, description FROM videos WHERE id = ?")
          .get(videoId) as SearchVideoRow;
        candidate
          .prepare(
            "INSERT INTO videos_fts(videos_fts, rowid, title, description) VALUES('delete', ?, ?, ?)",
          )
          .run(video.rowid, video.title, video.description);
        expect(
          candidate.prepare("SELECT rowid FROM videos_fts WHERE videos_fts MATCH ?").all("Restore"),
        ).toEqual([]);
        expect(() => getMigrationStatus(candidate, repositoryMigrationsDirectory)).toThrow(
          "Database search index contents do not match videos.",
        );
      } finally {
        candidate.close();
      }

      await expectStaleSearchRestoreRejection({
        activeBytesBefore,
        activeDatabasePath: databasePath,
        candidatePath,
        fixtureDirectory,
      });
    },
  );

  it("restores committed rows from a live WAL source snapshot", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const walSourcePath = join(fixtureDirectory, "wal-source.sqlite");
    const staleMainCopyPath = join(fixtureDirectory, "wal-main-only.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE restore_probe (value TEXT NOT NULL); -- recovery: restore backup",
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("active-data");
    fixture.database.close();
    database = undefined;

    const walSource = openDatabase(walSourcePath);

    try {
      expect(applyMigrations(walSource, fixture.migrationsDirectory)).toEqual([1]);
      expect(walSource.prepare("PRAGMA journal_mode = WAL").get()).toEqual({
        journal_mode: "wal",
      });
      walSource.exec("PRAGMA wal_autocheckpoint = 0");
      walSource.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("wal-data");
      expect(existsSync(`${walSourcePath}-wal`)).toBe(true);
      expect(walSource.prepare("SELECT value FROM restore_probe").all()).toEqual([
        { value: "wal-data" },
      ]);

      copyFileSync(walSourcePath, staleMainCopyPath);
      const staleMainCopy = openDatabase(staleMainCopyPath);
      try {
        expect(staleMainCopy.prepare("SELECT value FROM restore_probe").all()).toEqual([]);
      } finally {
        staleMainCopy.close();
      }

      const result = await restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: walSourcePath,
        migrationsDirectory: fixture.migrationsDirectory,
      });
      expect(result.migrationStatus).toMatchObject({
        currentVersion: 1,
        latestVersion: 1,
        pendingMigrations: [],
      });
      expect(result.safetyBackupPath).not.toBeNull();
      expect(existsSync(result.safetyBackupPath ?? "")).toBe(true);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
    } finally {
      walSource.close();
    }

    const restored = openDatabase(databasePath);
    try {
      expect(restored.prepare("SELECT value FROM restore_probe").all()).toEqual([
        { value: "wal-data" },
      ]);
    } finally {
      restored.close();
    }
  });

  it("rejects a restore candidate with orphaned foreign-key rows", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const orphanedPath = join(fixtureDirectory, "orphaned.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_relations.sql"),
      [
        "CREATE TABLE parent_rows (id INTEGER PRIMARY KEY);",
        "CREATE TABLE child_rows (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent_rows(id));",
        "-- recovery: restore backup",
      ].join("\n"),
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.prepare("INSERT INTO parent_rows (id) VALUES (1)").run();
    fixture.database.close();
    database = undefined;

    copyFileSync(databasePath, orphanedPath);
    const orphaned = openDatabase(orphanedPath);
    try {
      orphaned.exec("PRAGMA foreign_keys = OFF");
      orphaned.prepare("INSERT INTO child_rows (id, parent_id) VALUES (1, 999)").run();
      orphaned.exec("PRAGMA foreign_keys = ON");
    } finally {
      orphaned.close();
    }

    const activeBytesBefore = readFileSync(databasePath);
    await expect(
      restoreDatabaseFromBackup({
        activeDatabasePath: databasePath,
        backupPath: orphanedPath,
        migrationsDirectory: fixture.migrationsDirectory,
      }),
    ).rejects.toThrow("foreign-key consistency check failed");
    expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
    expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual([]);
  });

  it("rejects migrated restore candidates with schema objects removed", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const canonicalSourcePath = join(fixtureDirectory, "canonical-source.sqlite");
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_restore_schema.sql"),
      [
        "CREATE TABLE restore_probe (value TEXT NOT NULL);",
        "CREATE TABLE audit_events (id TEXT NOT NULL PRIMARY KEY);",
        "CREATE TRIGGER restore_probe_guard BEFORE DELETE ON restore_probe BEGIN SELECT RAISE(ABORT, 'immutable'); END;",
        "-- recovery: restore backup",
      ].join("\n"),
    );
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1]);
    fixture.database.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("active-data");
    fixture.database.close();
    database = undefined;

    const canonicalSource = openDatabase(canonicalSourcePath);
    try {
      expect(applyMigrations(canonicalSource, fixture.migrationsDirectory)).toEqual([1]);
      canonicalSource.prepare("INSERT INTO restore_probe (value) VALUES (?)").run("backup-data");
    } finally {
      canonicalSource.close();
    }

    const activeBytesBefore = readFileSync(databasePath);
    const tamperedCandidates = [
      {
        path: join(fixtureDirectory, "missing-table.sqlite"),
        sql: "DROP TABLE audit_events",
      },
      {
        path: join(fixtureDirectory, "missing-trigger.sqlite"),
        sql: "DROP TRIGGER restore_probe_guard",
      },
    ];

    for (const tamperedCandidate of tamperedCandidates) {
      copyFileSync(canonicalSourcePath, tamperedCandidate.path);
      const candidate = openDatabase(tamperedCandidate.path);
      try {
        candidate.exec(tamperedCandidate.sql);
        expect(() => getMigrationStatus(candidate, fixture.migrationsDirectory)).toThrow(
          "Database schema does not match repository migrations.",
        );
      } finally {
        candidate.close();
      }

      await expect(
        restoreDatabaseFromBackup({
          activeDatabasePath: databasePath,
          backupPath: tamperedCandidate.path,
          migrationsDirectory: fixture.migrationsDirectory,
        }),
      ).rejects.toThrow("schema does not match repository migrations");
      expect(readFileSync(databasePath)).toEqual(activeBytesBefore);
      expect(readdirSync(fixtureDirectory).filter((name) => name.includes(".restore-"))).toEqual(
        [],
      );
      expect(
        readdirSync(fixtureDirectory).filter((name) => name.includes("before-restore")),
      ).toEqual([]);
    }
  });

  it("fails closed when foreign keys or recovery guidance are absent", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE probe (id INTEGER);",
    );

    expect(() => applyMigrations(fixture.database, fixture.migrationsDirectory)).toThrow(
      "has no recovery guidance",
    );
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 0,
    });

    writeFileSync(
      join(fixture.migrationsDirectory, "0001_probe.sql"),
      "CREATE TABLE probe (id INTEGER); -- recovery: restore backup",
    );
    fixture.database.exec("PRAGMA foreign_keys = OFF");

    expect(() => applyMigrations(fixture.database, fixture.migrationsDirectory)).toThrow(
      "foreign-key enforcement is disabled",
    );
  });
});
