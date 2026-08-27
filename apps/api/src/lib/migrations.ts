import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { backupDatabase, type Database } from "./database.js";

const MIGRATION_NAME = /^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$/;
const MAX_USER_VERSION = 2_147_483_647;
const MIGRATION_LEDGER = "schema_migrations";

export type Migration = {
  name: string;
  path: string;
  version: number;
};

export type MigrationStatus = {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: Migration[];
};

export type MigrationResult = {
  appliedVersions: number[];
  backupPath: string | null;
};

type UserVersionPragma = {
  user_version: number;
};

type MigrationLedgerRow = {
  version: number;
  name: string;
  sha256: string;
  applied_at: number;
};

function readUserVersion(database: Database): number {
  const pragma = database.prepare("PRAGMA user_version").get() as UserVersionPragma | undefined;

  if (!pragma || !Number.isSafeInteger(pragma.user_version)) {
    throw new Error("SQLite returned an invalid user_version pragma.");
  }

  return pragma.user_version;
}

export function discoverMigrations(directory: string): Migration[] {
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

  if (migrations.length > 0 && migrations[0]?.version !== 1) {
    throw new Error("The first migration version must be 0001.");
  }

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

    if (current.version !== previous.version + 1) {
      throw new Error(`Missing migration version between ${previous.name} and ${current.name}`);
    }
  }

  return migrations;
}

export function getMigrationStatus(
  database: Database,
  migrationsDirectory: string,
): MigrationStatus {
  const currentVersion = readUserVersion(database);
  const migrations = discoverMigrations(migrationsDirectory);
  const latestVersion = migrations.at(-1)?.version ?? 0;

  if (currentVersion > latestVersion) {
    throw new Error(
      `Database user_version ${currentVersion} is newer than available migration ${latestVersion}.`,
    );
  }

  if (currentVersion > 0 && !migrations.some((migration) => migration.version === currentVersion)) {
    throw new Error(`Applied migration ${currentVersion} is missing from the repository.`);
  }

  verifyAppliedMigrationMetadata(database, migrations, currentVersion);

  return {
    currentVersion,
    latestVersion,
    pendingMigrations: migrations.filter((migration) => migration.version > currentVersion),
  };
}

function readMigrationSql(migration: Migration): string {
  const sql = readFileSync(migration.path, "utf8");

  if (!/-- recovery:/i.test(sql)) {
    throw new Error(`Migration ${migration.name} has no recovery guidance.`);
  }

  return sql;
}

function migrationSha256(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function migrationLedgerExists(database: Database): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(MIGRATION_LEDGER),
  );
}

function createMigrationLedger(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version >= 1),
      name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
      sha256 TEXT NOT NULL CHECK (
        length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
    ) STRICT
  `);
}

function verifyAppliedMigrationMetadata(
  database: Database,
  migrations: Migration[],
  currentVersion: number,
): void {
  if (!migrationLedgerExists(database)) {
    if (currentVersion === 0) {
      return;
    }

    throw new Error(
      `Database user_version ${currentVersion} has no ${MIGRATION_LEDGER} metadata; restore a verified backup or migrate with the repository runner.`,
    );
  }

  const rows = database
    .prepare("SELECT version, name, sha256, applied_at FROM schema_migrations ORDER BY version")
    .all() as MigrationLedgerRow[];

  if (rows.length !== currentVersion) {
    throw new Error(
      `Migration metadata count ${rows.length} does not match user_version ${currentVersion}.`,
    );
  }

  for (let version = 1; version <= currentVersion; version += 1) {
    const migration = migrations.find((candidate) => candidate.version === version);
    const row = rows[version - 1];

    if (!migration || row?.version !== version) {
      throw new Error(`Migration metadata for version ${version} is missing or out of order.`);
    }

    const sql = readMigrationSql(migration);
    const expectedSha256 = migrationSha256(sql);

    if (row.name !== migration.name) {
      throw new Error(
        `Applied migration ${version} name mismatch: database=${row.name}, repository=${migration.name}.`,
      );
    }

    if (row.sha256 !== expectedSha256) {
      throw new Error(`Applied migration ${migration.name} checksum mismatch.`);
    }
  }
}

export function applyMigrations(database: Database, migrationsDirectory: string): number[] {
  const foreignKeys = database.prepare("PRAGMA foreign_keys").get() as
    { foreign_keys: number } | undefined;

  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error("SQLite foreign-key enforcement is disabled.");
  }

  const { pendingMigrations } = getMigrationStatus(database, migrationsDirectory);
  const appliedVersions: number[] = [];

  for (const migration of pendingMigrations) {
    const sql = readMigrationSql(migration);
    const sha256 = migrationSha256(sql);
    database.exec("BEGIN IMMEDIATE");

    try {
      const currentVersion = readUserVersion(database);

      if (currentVersion !== migration.version - 1) {
        throw new Error(
          `Database user_version changed while applying migrations: expected ${migration.version - 1}, got ${currentVersion}.`,
        );
      }

      createMigrationLedger(database);
      verifyAppliedMigrationMetadata(
        database,
        discoverMigrations(migrationsDirectory),
        currentVersion,
      );
      database.exec(sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (version, name, sha256, applied_at) VALUES (?, ?, ?, ?)",
        )
        .run(migration.version, migration.name, sha256, Date.now());
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

function backupFilename(databasePath: string, label: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${basename(databasePath)}.${label}.${timestamp}.bak`;
}

function uniqueBackupPath(
  backupDirectory: string,
  databasePath: string,
  label: string,
  now: Date,
): string {
  const filename = backupFilename(databasePath, label, now);
  let candidate = join(backupDirectory, filename);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = join(backupDirectory, `${filename}.${suffix}`);
    suffix += 1;
  }

  return candidate;
}

export async function createTimestampedBackup(
  database: Database,
  databasePath: string,
  label = "manual",
  backupDirectory = join(dirname(databasePath), "backups"),
  now = new Date(),
): Promise<string> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) {
    throw new Error("Backup label must contain only lowercase letters, digits, and hyphens.");
  }

  mkdirSync(backupDirectory, { recursive: true });
  const backupPath = uniqueBackupPath(backupDirectory, databasePath, label, now);
  await backupDatabase(database, backupPath);
  return backupPath;
}

export async function applyMigrationsWithBackup(
  database: Database,
  databasePath: string,
  migrationsDirectory: string,
  backupDirectory = join(dirname(databasePath), "backups"),
  now = new Date(),
): Promise<MigrationResult> {
  const status = getMigrationStatus(database, migrationsDirectory);
  const firstPending = status.pendingMigrations[0];

  if (!firstPending) {
    return { appliedVersions: [], backupPath: null };
  }

  const backupPath = await createTimestampedBackup(
    database,
    databasePath,
    `before-v${String(firstPending.version).padStart(4, "0")}`,
    backupDirectory,
    now,
  );

  try {
    return {
      appliedVersions: applyMigrations(database, migrationsDirectory),
      backupPath,
    };
  } catch (error) {
    throw new Error(`Migration failed after creating backup ${backupPath}.`, {
      cause: error,
    });
  }
}
