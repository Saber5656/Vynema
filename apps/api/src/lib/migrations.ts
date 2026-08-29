import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { backupDatabase, openDatabase, type Database } from "./database.js";

const MIGRATION_NAME = /^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$/;
const MAX_USER_VERSION = 2_147_483_647;
const MIGRATION_LEDGER = "schema_migrations";
const FTS5_BLOCK_START = "-- vynema:fts5:start";
const FTS5_BLOCK_END = "-- vynema:fts5:end";

const PORTABLE_SEARCH_INDEX_SQL = `
-- The Node 22.13 Linux SQLite build does not include FTS5. Keep the same
-- synchronized search-document contract so #15 can use a bounded LIKE fallback.
CREATE TABLE videos_fts (
  rowid INTEGER PRIMARY KEY,
  title TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL COLLATE NOCASE
) STRICT;
CREATE INDEX idx_videos_fts_title ON videos_fts(title);
CREATE INDEX idx_videos_fts_description ON videos_fts(description);
CREATE TRIGGER videos_fts_ai AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER videos_fts_ad AFTER DELETE ON videos BEGIN
  DELETE FROM videos_fts WHERE rowid = old.rowid;
END;
CREATE TRIGGER videos_fts_au AFTER UPDATE OF title, description ON videos BEGIN
  UPDATE videos_fts SET title = new.title, description = new.description WHERE rowid = old.rowid;
END;
`;

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

export type MigrationCapabilities = Readonly<{
  fts5: boolean;
}>;

export type SearchIndexMode = "fts5" | "portable";

type UserVersionPragma = {
  user_version: number;
};

type MigrationLedgerRow = {
  version: number;
  name: string;
  sha256: string;
  applied_at: number;
};

type CompileOptionRow = {
  enabled: number;
};

type SearchIndexSchemaRow = {
  sql: string | null;
};

type SchemaObjectRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};

type TableListRow = {
  name: string;
  type: string;
};

type ApplicationIdPragma = {
  application_id: number;
};

export function detectMigrationCapabilities(database: Database): MigrationCapabilities {
  const row = database
    .prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled")
    .get() as CompileOptionRow | undefined;

  if (!row || (row.enabled !== 0 && row.enabled !== 1)) {
    throw new Error("SQLite returned an invalid FTS5 capability result.");
  }

  return { fts5: row.enabled === 1 };
}

export function getSearchIndexMode(database: Database): SearchIndexMode {
  const row = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'videos_fts'")
    .get() as SearchIndexSchemaRow | undefined;

  if (!row?.sql) {
    throw new Error("The videos_fts search index is missing.");
  }

  return /\bUSING\s+fts5\b/i.test(row.sql) ? "fts5" : "portable";
}

function renderMigrationSql(sql: string, capabilities: MigrationCapabilities): string {
  const start = sql.indexOf(FTS5_BLOCK_START);
  const end = sql.indexOf(FTS5_BLOCK_END);

  if (start === -1 && end === -1) {
    return sql;
  }

  if (
    start === -1 ||
    end === -1 ||
    end <= start ||
    sql.includes(FTS5_BLOCK_START, start + FTS5_BLOCK_START.length) ||
    sql.includes(FTS5_BLOCK_END, end + FTS5_BLOCK_END.length)
  ) {
    throw new Error("Migration has malformed FTS5 capability markers.");
  }

  const selectedSearchSql = capabilities.fts5
    ? sql.slice(start + FTS5_BLOCK_START.length, end)
    : PORTABLE_SEARCH_INDEX_SQL;

  return `${sql.slice(0, start)}-- selected search index: ${capabilities.fts5 ? "fts5" : "portable"}\n${selectedSearchSql}${sql.slice(end + FTS5_BLOCK_END.length)}`;
}

function assertRuntimeCompatibleSchema(database: Database): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'videos_fts'")
    .get() as SearchIndexSchemaRow | undefined;

  if (
    row?.sql &&
    /\bUSING\s+fts5\b/i.test(row.sql) &&
    !detectMigrationCapabilities(database).fts5
  ) {
    throw new Error(
      "This database requires SQLite FTS5, but the current runtime does not provide it.",
    );
  }
}

function readUserVersion(database: Database): number {
  const pragma = database.prepare("PRAGMA user_version").get() as UserVersionPragma | undefined;

  if (!pragma || !Number.isSafeInteger(pragma.user_version)) {
    throw new Error("SQLite returned an invalid user_version pragma.");
  }

  return pragma.user_version;
}

function assertPristineVersionZeroDatabase(database: Database, currentVersion: number): void {
  if (currentVersion !== 0) {
    return;
  }

  const applicationId = database.prepare("PRAGMA application_id").get() as
    ApplicationIdPragma | undefined;
  const schemaObject = database
    .prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name LIMIT 1")
    .get() as { name: string } | undefined;

  if (applicationId?.application_id !== 0 || schemaObject) {
    throw new Error(
      "A migration version 0 database must be a pristine SQLite database with application_id 0.",
    );
  }
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
  assertRuntimeCompatibleSchema(database);
  const currentVersion = readUserVersion(database);
  assertPristineVersionZeroDatabase(database, currentVersion);
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

  if (currentVersion > 0) {
    assertCanonicalMigratedSchema(database, migrationsDirectory, currentVersion);
  }

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

export function applyMigrations(
  database: Database,
  migrationsDirectory: string,
  capabilities = detectMigrationCapabilities(database),
  maximumVersion?: number,
): number[] {
  const foreignKeys = database.prepare("PRAGMA foreign_keys").get() as
    { foreign_keys: number } | undefined;

  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error("SQLite foreign-key enforcement is disabled.");
  }

  const status = getMigrationStatus(database, migrationsDirectory);
  const targetVersion = maximumVersion ?? status.latestVersion;

  if (
    !Number.isSafeInteger(targetVersion) ||
    targetVersion < status.currentVersion ||
    targetVersion > status.latestVersion
  ) {
    throw new Error(`Invalid target migration version: ${targetVersion}`);
  }

  const pendingMigrations = status.pendingMigrations.filter(
    (migration) => migration.version <= targetVersion,
  );
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
      database.exec(renderMigrationSql(sql, capabilities));
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

function readCanonicalSchemaObjects(database: Database): SchemaObjectRow[] {
  const shadowTables = new Set(
    (database.prepare("PRAGMA table_list").all() as TableListRow[])
      .filter((row) => row.type === "shadow")
      .map((row) => row.name),
  );

  return (
    database
      .prepare(
        [
          "SELECT type, name, tbl_name, sql FROM sqlite_schema",
          "WHERE name NOT GLOB 'sqlite_*'",
          "ORDER BY type, name, tbl_name",
        ].join(" "),
      )
      .all() as SchemaObjectRow[]
  ).filter((row) => !shadowTables.has(row.name) && !shadowTables.has(row.tbl_name));
}

function inferInstalledMigrationCapabilities(database: Database): MigrationCapabilities {
  const searchIndex = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'videos_fts'")
    .get() as SearchIndexSchemaRow | undefined;

  if (!searchIndex?.sql) {
    return detectMigrationCapabilities(database);
  }

  return { fts5: /\bUSING\s+fts5\b/i.test(searchIndex.sql) };
}

export function assertCanonicalMigratedSchema(
  database: Database,
  migrationsDirectory: string,
  currentVersion: number,
): void {
  if (currentVersion === 0) {
    return;
  }

  const expected = openDatabase(":memory:");

  try {
    applyMigrations(
      expected,
      migrationsDirectory,
      inferInstalledMigrationCapabilities(database),
      currentVersion,
    );

    const actualSchema = readCanonicalSchemaObjects(database);
    const expectedSchema = readCanonicalSchemaObjects(expected);

    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) {
      throw new Error("Database schema does not match repository migrations.");
    }
  } finally {
    expected.close();
  }
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
