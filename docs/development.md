# Local development

Vynema currently runs as a local, same-origin Node application. The Hono
server exposes `/api/*`, serves the built React application, and stores product
metadata plus development media in local SQLite. Production cloud resources,
provider migration, and deployment remain blocked on issue #42.

## Prerequisites

- Node.js `>=22.13 <23` (`node:sqlite` is used without an experimental flag)
- pnpm `10.34.5` through Corepack

With `nvm` and the Corepack bundled with Node 22:

```sh
nvm install
nvm use
corepack enable
corepack prepare pnpm@10.34.5 --activate
node --version
pnpm --version
```

The final two commands must report Node 22.13 or newer within the 22.x line and
pnpm 10.34.5. Do not substitute pnpm 11; the lockfile and lifecycle-script
supply-chain boundary are tested with pnpm 10.

## Install and run

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:8787/>. The same process serves the API, so no CORS
configuration is required.

Verify both surfaces from another terminal:

```sh
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent http://127.0.0.1:8787/
```

The health response is:

```json
{ "status": "ok", "environment": "development" }
```

Stop the server with `Ctrl-C` so it can close the SQLite connection cleanly.

## Local configuration

The default database is `.local/vynema.sqlite` at the repository root. The
server creates the parent directory, enables and verifies SQLite foreign-key
enforcement, and applies pending numbered SQL files from
`apps/api/migrations/`. Before the first pending migration is applied, the
server creates and integrity-checks a timestamped SQLite backup under
`.local/backups/`. If backup creation fails, migration fails closed.

The bundled SQLite capability is detected during the first migration. Runtimes
with FTS5 install the local full-text index; the supported Node 22.13 Linux
build, which omits FTS5, installs a synchronized indexed search-document table
instead. Both modes preserve the same video/search lifecycle, and the raw
migration checksum is identical. A database that requires FTS5 is rejected
before use on a runtime that does not provide it.

Configuration is optional for the skeleton. To override the database path or
prepare empty placeholders for later local-only auth work:

```sh
cp apps/api/.env.example apps/api/.env
```

Paths in `VYNEMA_DB_PATH` are resolved from the repository root. `.env` is
ignored and must never contain a credential that is committed. The example
file contains no working secret or provider identifier.

## Database operations

Run database commands from the repository root with the server stopped. Every
command builds the shared package and API first so a clean checkout uses the
same checked TypeScript implementation as the server.

Show the current and latest migration versions and list pending files:

```sh
pnpm --filter @vynema/api db:status
```

Apply pending migrations. A verified timestamped backup is created before any
SQL runs; the command prints both the backup path and applied versions:

```sh
pnpm --filter @vynema/api db:migrate
```

Inspect schema object names and the non-secret platform defaults:

```sh
pnpm --filter @vynema/api db:inspect
```

The output includes `searchIndexMode` (`fts5` or `portable`) so downstream
search debugging never has to infer the installed mode from a failed query.

Create an additional verified backup without applying migrations:

```sh
pnpm --filter @vynema/api db:backup
```

Restore a backup. Before touching the active database, the command verifies
SQLite integrity plus the repository migration version, filenames, and
checksums. It creates the installable candidate with SQLite snapshot semantics
so committed rows in a live WAL source are included, validates that exact
snapshot, creates a `before-restore` safety backup of the current database,
revalidates the candidate, and only then performs the replacement:

```sh
pnpm --filter @vynema/api db:restore -- .local/backups/<backup-file>.bak
```

A version-zero restore source is accepted only when it is a pristine
pre-migration SQLite database: `PRAGMA application_id` must be `0` and
`sqlite_schema` must contain no non-internal object. This prevents an
unrelated SQLite database from being accepted merely because its
`user_version` is still zero. The same check runs both before the safety
backup and against the copied candidate.

Reset the disposable local database only. The explicit `--yes` guard is
required; an existing database is backed up before removal, and the fresh
database is migrated with its own pre-migration backup:

```sh
pnpm --filter @vynema/api db:reset -- --yes
```

Migrations are forward-only and contiguous from `0001`. The runner records each
applied filename and SHA-256 in its internal `schema_migrations` ledger and
fails closed if that ledger, `PRAGMA user_version`, an applied file, or the
installed table/index/trigger schema drifts from the repository migrations.
Before the first migration, a version-zero database must have
`PRAGMA application_id = 0` and no non-SQLite schema objects; otherwise status
and migration fail before creating a backup or executing migration SQL.
Restore validation builds the expected schema for the candidate's version and
search mode; SQLite-reported virtual-table shadow objects are excluded, while
all repository-owned schema objects must match exactly.
Repository multi-statement helpers are synchronous. If a callback returns a
Promise-like object or callable function, or if inspecting its `then` property
throws, the helper rolls back and closes that SQLite connection before
microtasks can resume; callers must treat the connection as invalid and reopen
it rather than continuing outside the intended transaction.
Never edit, rename, delete, or roll back an applied migration. To recover from a
failed local migration, either restore the printed pre-migration backup,
correct an unapplied SQL file, or add the next numbered fix-forward migration.
Every migration must contain a `-- recovery:` note. Generated backup collision
files and restore-temporary files are ignored by Git. Backups are built and
validated in an exclusively owned temporary directory, then atomically linked
into place without overwrite; a concurrent loser never removes the winner's
backup. Production backup, restore, migration, and retention procedures remain
blocked on #42.

The local test agent/channel/key fixture is intentionally absent. Issue #46
adds it only after #35 finalizes the public signing vector; production
migrations must never apply that fixture.

## Checks

Run the complete local gate from the repository root:

```sh
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
python3 scripts/security/scan-secrets.py --repo .
git diff --check
```

Build output, dependencies, coverage, `.env`, `.local/`, and SQLite sidecar
files are ignored. CI is owned by issue #21; these commands are intentionally
CI-invokable but issue #34 does not add a workflow.

## Current boundaries

- Local product schema, migration SQL, row types, platform defaults, and
  backup/recovery behavior are provider-independent development boundaries.
- Issue #9A/#9 owns media BLOB storage, `StorageAdapter`, scoped writes, and
  upload capability work. Issue #9B/#54 owns anonymous public media routes and
  transition-policy evidence.
- This local skeleton does not create cloud resources, deployment automation,
  credentials, or a human upload path.
