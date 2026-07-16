import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Database } from "./database.js";

const MIGRATION_NAME = /^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$/;
const MAX_USER_VERSION = 2_147_483_647;

type Migration = {
  name: string;
  path: string;
  version: number;
};

type UserVersionPragma = {
  user_version: number;
};

function readUserVersion(database: Database): number {
  const pragma = database.prepare("PRAGMA user_version").get() as UserVersionPragma | undefined;

  if (!pragma || !Number.isSafeInteger(pragma.user_version)) {
    throw new Error("SQLite returned an invalid user_version pragma.");
  }

  return pragma.user_version;
}

function discoverMigrations(directory: string): Migration[] {
  const migrations: Migration[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const match = MIGRATION_NAME.exec(entry.name);

    if (!match) {
      if (entry.name.endsWith(".sql")) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }

      continue;
    }

    const version = Number(match[1]);

    if (!Number.isSafeInteger(version) || version < 1 || version > MAX_USER_VERSION) {
      throw new Error(`Invalid migration version in ${entry.name}`);
    }

    migrations.push({
      name: entry.name,
      path: join(directory, entry.name),
      version,
    });
  }

  migrations.sort((left, right) => left.version - right.version);

  for (let index = 1; index < migrations.length; index += 1) {
    const previous = migrations[index - 1];
    const current = migrations[index];

    if (!previous || !current) {
      throw new Error("Migration ordering failed unexpectedly.");
    }

    if (previous.version === current.version) {
      throw new Error(
        `Duplicate migration version ${current.version}: ${previous.name}, ${current.name}`,
      );
    }
  }

  return migrations;
}

export function applyMigrations(database: Database, migrationsDirectory: string): number[] {
  const currentVersion = readUserVersion(database);
  const migrations = discoverMigrations(migrationsDirectory);
  const appliedVersions: number[] = [];

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    const sql = readFileSync(migration.path, "utf8");
    database.exec("BEGIN IMMEDIATE");

    try {
      database.exec(sql);
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.exec("COMMIT");
      appliedVersions.push(migration.version);
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`Migration ${migration.name} failed.`, { cause: error });
    }
  }

  return appliedVersions;
}
