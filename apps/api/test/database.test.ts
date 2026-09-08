import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const backupRace = vi.hoisted(() => ({
  destinationPath: null as string | null,
  winnerContent: "concurrent-winner-backup",
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();

  return {
    ...actual,
    linkSync(existingPath: string, newPath: string): void {
      if (newPath === backupRace.destinationPath) {
        actual.writeFileSync(newPath, backupRace.winnerContent, { flag: "wx" });
      }

      actual.linkSync(existingPath, newPath);
    },
  };
});

import { backupDatabase, openDatabase, type Database } from "../src/lib/database.js";
import { formatErrorWithCauses } from "../src/lib/error-format.js";

let database: Database | undefined;
let temporaryDirectory: string | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
  backupRace.destinationPath = null;

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe("openDatabase", () => {
  it("enables SQLite foreign-key and recursive-trigger enforcement", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-database-"));
    database = openDatabase(join(temporaryDirectory, "database.sqlite"));

    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    expect(database.prepare("PRAGMA recursive_triggers").get()).toEqual({
      recursive_triggers: 1,
    });
  });

  it("preserves a backup destination published concurrently after preflight", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-backup-race-"));
    const sourcePath = join(temporaryDirectory, "source.sqlite");
    const destinationPath = join(temporaryDirectory, "destination.bak");
    const sourceDatabase = openDatabase(sourcePath);
    database = sourceDatabase;
    sourceDatabase.exec("CREATE TABLE records (value TEXT NOT NULL)");
    sourceDatabase.prepare("INSERT INTO records (value) VALUES (?)").run("source-data");
    backupRace.destinationPath = destinationPath;

    expect(() => backupDatabase(sourceDatabase, destinationPath)).toThrow(
      `Backup destination already exists: ${destinationPath}`,
    );

    expect(readFileSync(destinationPath, "utf8")).toBe(backupRace.winnerContent);
    expect(sourceDatabase.prepare("SELECT value FROM records").all()).toEqual([
      { value: "source-data" },
    ]);
    expect(
      readdirSync(temporaryDirectory).filter((name) => name.includes(".bak.temporary-")),
    ).toEqual([]);
  });

  it("publishes backup snapshots with owner-only permissions", async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-backup-mode-"));
    const sourcePath = join(temporaryDirectory, "source.sqlite");
    const destinationPath = join(temporaryDirectory, "destination.bak");
    database = openDatabase(sourcePath);
    database.exec("CREATE TABLE records (value TEXT NOT NULL)");

    await expect(backupDatabase(database, destinationPath)).resolves.toBeUndefined();

    expect(statSync(destinationPath).mode & 0o777).toBe(0o600);
  });

  it("does not publish snapshots rejected by the caller validator", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-backup-validator-"));
    const sourcePath = join(temporaryDirectory, "source.sqlite");
    const destinationPath = join(temporaryDirectory, "destination.bak");
    const sourceDatabase = openDatabase(sourcePath);
    database = sourceDatabase;
    sourceDatabase.exec("CREATE TABLE records (value TEXT NOT NULL)");
    sourceDatabase.prepare("INSERT INTO records (value) VALUES (?)").run("source-data");

    expect(() =>
      backupDatabase(sourceDatabase, destinationPath, (snapshot) => {
        expect(snapshot.prepare("SELECT value FROM records").get()).toEqual({
          value: "source-data",
        });
        throw new Error("Repository snapshot validation failed.");
      }),
    ).toThrow("Repository snapshot validation failed.");

    expect(existsSync(destinationPath)).toBe(false);
    expect(sourceDatabase.prepare("SELECT value FROM records").get()).toEqual({
      value: "source-data",
    });
    expect(
      readdirSync(temporaryDirectory).filter((name) => name.includes(".bak.temporary-")),
    ).toEqual([]);
  });
});

describe("formatErrorWithCauses", () => {
  it("shows a bounded cause chain without exposing stack traces", () => {
    const error = new Error("Migration failed after creating backup /safe/operator/path.", {
      cause: new Error("Migration 0005_require_takedown_reason.sql failed.", {
        cause: new Error(
          "legacy videos require nonblank text takedown reasons only on taken-down rows",
        ),
      }),
    });

    expect(formatErrorWithCauses(error)).toBe(
      [
        "Migration failed after creating backup /safe/operator/path.",
        "Caused by: Migration 0005_require_takedown_reason.sql failed.",
        "Caused by: legacy videos require nonblank text takedown reasons only on taken-down rows",
      ].join("\n"),
    );
    expect(formatErrorWithCauses(error)).not.toContain("at ");
  });
});
