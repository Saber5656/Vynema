import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

export type Database = NodeDatabaseSync;

const nodeSqliteModule = "node:sqlite";
const { DatabaseSync } = createRequire(import.meta.url)(
  nodeSqliteModule,
) as typeof import("node:sqlite");

type ForeignKeysPragma = {
  foreign_keys: number;
};

export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });

  const database = new DatabaseSync(path);

  try {
    database.exec("PRAGMA foreign_keys = ON");
    const pragma = database.prepare("PRAGMA foreign_keys").get() as ForeignKeysPragma | undefined;

    if (pragma?.foreign_keys !== 1) {
      throw new Error("SQLite foreign-key enforcement could not be enabled.");
    }

    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

type IntegrityCheckPragma = {
  integrity_check: string;
};

export function assertDatabaseIntegrity(database: Database): void {
  const result = database.prepare("PRAGMA integrity_check(1)").get() as
    IntegrityCheckPragma | undefined;

  if (result?.integrity_check !== "ok") {
    throw new Error("SQLite integrity check failed.");
  }
}

export function backupDatabase(database: Database, destinationPath: string): Promise<void> {
  mkdirSync(dirname(destinationPath), { recursive: true });

  if (existsSync(destinationPath)) {
    throw new Error(`Backup destination already exists: ${destinationPath}`);
  }

  try {
    // VACUUM INTO is available in the SQLite bundled with every supported
    // Node 22 runtime. Unlike node:sqlite backup(), it does not require
    // Node 22.16+, and it still creates a transactionally consistent copy.
    database.prepare("VACUUM INTO ?").run(destinationPath);

    const backupCopy = openDatabase(destinationPath);

    try {
      assertDatabaseIntegrity(backupCopy);
    } finally {
      backupCopy.close();
    }
  } catch (error) {
    rmSync(destinationPath, { force: true });
    throw error;
  }

  return Promise.resolve();
}
