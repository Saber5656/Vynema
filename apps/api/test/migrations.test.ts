import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
  getMigrationStatus,
} from "../src/lib/migrations.js";

let database: Database | undefined;
let temporaryDirectory: string | undefined;
const repositoryMigrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const RESTORE_VIDEO_BYTES = Buffer.alloc(1024, 7);
const RESTORE_VIDEO_SHA256 = "a".repeat(64);

function createFixture(): { database: Database; migrationsDirectory: string } {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-migrations-"));
  const migrationsDirectory = join(temporaryDirectory, "migrations");
  mkdirSync(migrationsDirectory);
  database = openDatabase(join(temporaryDirectory, "database.sqlite"));

  return { database, migrationsDirectory };
}

function insertPublishedVideoWithApproval(target: Database): {
  reviewId: string;
  videoId: string;
} {
  const agentId = "agt_abcdef123456";
  const channelId = "chn_restore_publication";
  const intentId = "int_restore_publication";
  const capabilityId = "cap_restore_publication";
  const blobId = "blob_restore_publication";
  const userId = "usr_restore_reviewer";
  const videoId = "vid_restore_publication";
  const reviewId = "rev_restore_publication";

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
      "INSERT INTO users (id, github_id, github_login, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'reviewer', 'active', ?, ?)",
    )
    .run(userId, 9_001, "restore-reviewer", "Restore Reviewer", 1_000, 1_000);
  target
    .prepare(
      [
        "INSERT INTO upload_intents (",
        "id, agent_id, channel_id, declared_video_bytes, declared_video_sha256,",
        "declared_mime, declared_duration_seconds, title, provenance_json, created_at, expires_at",
        ") VALUES (?, ?, ?, ?, ?, 'video/mp4', ?, ?, ?, ?, ?)",
      ].join(" "),
    )
    .run(
      intentId,
      agentId,
      channelId,
      RESTORE_VIDEO_BYTES.length,
      RESTORE_VIDEO_SHA256,
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
    .prepare(
      [
        "INSERT INTO videos (",
        "id, intent_id, agent_id, channel_id, title, duration_seconds, size_bytes,",
        "sha256, provenance_json, video_blob_id, created_at, updated_at",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      2_000,
      2_000,
    );
  target
    .prepare(
      "INSERT INTO moderation_reviews (id, video_id, reviewer_user_id, decision, reason, created_at) VALUES (?, ?, ?, 'approved', ?, ?)",
    )
    .run(reviewId, videoId, userId, "Approved before publication.", 2_500);
  target
    .prepare(
      "UPDATE videos SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
    )
    .run(3_000, 3_000, videoId);

  return { reviewId, videoId };
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

  it("rejects a restored published video after its approval evidence is removed", async () => {
    const fixture = createFixture();
    const fixtureDirectory = temporaryDirectory;

    if (!fixtureDirectory) {
      throw new Error("Temporary migration directory was not created.");
    }

    const databasePath = join(fixtureDirectory, "database.sqlite");
    const candidatePath = join(fixtureDirectory, "published-without-approval.sqlite");
    expect(applyMigrations(fixture.database, repositoryMigrationsDirectory)).toEqual([1, 2]);
    fixture.database.close();
    database = undefined;
    const activeBytesBefore = readFileSync(databasePath);

    const candidate = openDatabase(candidatePath);
    try {
      expect(applyMigrations(candidate, repositoryMigrationsDirectory)).toEqual([1, 2]);
      const { reviewId, videoId } = insertPublishedVideoWithApproval(candidate);
      candidate.prepare("DELETE FROM moderation_reviews WHERE id = ?").run(reviewId);
      expect(candidate.prepare("SELECT status FROM videos WHERE id = ?").get(videoId)).toEqual({
        status: "published",
      });
      expect(candidate.prepare("SELECT COUNT(*) AS count FROM moderation_reviews").get()).toEqual({
        count: 0,
      });
      expect(getMigrationStatus(candidate, repositoryMigrationsDirectory)).toMatchObject({
        currentVersion: 2,
        latestVersion: 2,
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
        currentVersion: 2,
        latestVersion: 2,
        pendingMigrations: [],
      });
    } finally {
      active.close();
    }
  });

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
