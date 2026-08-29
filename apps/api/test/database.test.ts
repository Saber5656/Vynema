import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  it("enables SQLite foreign-key enforcement", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "vynema-database-"));
    database = openDatabase(join(temporaryDirectory, "database.sqlite"));

    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
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
});
