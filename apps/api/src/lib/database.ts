import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
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

type ForeignKeyViolation = {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
};

export function assertDatabaseIntegrity(database: Database): void {
  const result = database.prepare("PRAGMA integrity_check(1)").get() as
    IntegrityCheckPragma | undefined;

  if (result?.integrity_check !== "ok") {
    throw new Error("SQLite integrity check failed.");
  }

  const foreignKeyViolation = database.prepare("PRAGMA foreign_key_check").get() as
    ForeignKeyViolation | undefined;

  if (foreignKeyViolation) {
    throw new Error("SQLite foreign-key consistency check failed.");
  }
}

export function backupDatabase(database: Database, destinationPath: string): Promise<void> {
  const destinationDirectory = dirname(destinationPath);
  mkdirSync(destinationDirectory, { recursive: true });

  if (existsSync(destinationPath)) {
    throw new Error(`Backup destination already exists: ${destinationPath}`);
  }

  const temporaryDirectory = mkdtempSync(
    join(destinationDirectory, `.${basename(destinationPath)}.bak.temporary-`),
  );
  const temporaryPath = join(temporaryDirectory, "snapshot.sqlite");

  try {
    // VACUUM INTO is available in the SQLite bundled with every supported
    // Node 22 runtime. Unlike node:sqlite backup(), it does not require
    // Node 22.16+, and it still creates a transactionally consistent copy.
    // Build and validate in an exclusively owned directory, then publish with
    // a hard link so an existing destination is never overwritten.
    database.prepare("VACUUM INTO ?").run(temporaryPath);

    const backupCopy = openDatabase(temporaryPath);

    try {
      assertDatabaseIntegrity(backupCopy);
    } finally {
      backupCopy.close();
    }

    try {
      linkSync(temporaryPath, destinationPath);
    } catch (error) {
      if (existsSync(destinationPath)) {
        throw new Error(`Backup destination already exists: ${destinationPath}`, {
          cause: error,
        });
      }

      throw error;
    }
  } finally {
    rmSync(temporaryPath, { force: true });
    rmdirSync(temporaryDirectory);
  }

  return Promise.resolve();
}
