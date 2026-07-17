import { mkdirSync } from "node:fs";
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
