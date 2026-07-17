import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Database } from "../src/lib/database.js";

let database: Database | undefined;
let temporaryDirectory: string | undefined;

afterEach(() => {
  database?.close();
  database = undefined;

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
});
