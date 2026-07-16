import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Database } from "../src/lib/database.js";
import { applyMigrations } from "../src/lib/migrations.js";

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
      "INSERT INTO migration_probe (step) VALUES (2);",
    );
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_create_probe.sql"),
      "CREATE TABLE migration_probe (step INTEGER NOT NULL); INSERT INTO migration_probe (step) VALUES (1);",
    );

    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([1, 2]);
    expect(applyMigrations(fixture.database, fixture.migrationsDirectory)).toEqual([]);
    expect(
      fixture.database.prepare("SELECT step FROM migration_probe ORDER BY rowid").all(),
    ).toEqual([{ step: 1 }, { step: 2 }]);
    expect(fixture.database.prepare("PRAGMA user_version").get()).toEqual({
      user_version: 2,
    });
  });

  it("rolls back a failed migration without advancing user_version", () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.migrationsDirectory, "0001_invalid.sql"),
      "CREATE TABLE rollback_probe (id INTEGER); THIS IS NOT SQL;",
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
});
