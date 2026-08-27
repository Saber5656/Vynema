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

function createFixture(): { database: Database; migrationsDirectory: string } {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-migrations-"));
  const migrationsDirectory = join(temporaryDirectory, "migrations");
  mkdirSync(migrationsDirectory);
  database = openDatabase(join(temporaryDirectory, "database.sqlite"));

  return { database, migrationsDirectory };
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
