# Local development

Vynema currently runs as a local, same-origin Node application. The Hono
server exposes `/api/*` and serves the built React application. Production
cloud resources, deployment, and product data schema are intentionally outside
this bootstrap.

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
enforcement, and applies numbered SQL files from `apps/api/migrations/`.

The directory is deliberately empty in issue #34. An empty directory is a
valid no-op; issue #4 owns the product schema and committed migrations.

Configuration is optional for the skeleton. To override the database path or
prepare empty placeholders for later local-only auth work:

```sh
cp apps/api/.env.example apps/api/.env
```

Paths in `VYNEMA_DB_PATH` are resolved from the repository root. `.env` is
ignored and must never contain a credential that is committed. The example
file contains no working secret or provider identifier.

To reset only the disposable local skeleton database, stop the server and
remove the ignored database files:

```sh
rm -f .local/vynema.sqlite .local/vynema.sqlite-shm .local/vynema.sqlite-wal
```

Do not use this as an operational migration or backup procedure. Issue #4 owns
schema migrations, backup/recovery commands, and their safety requirements.

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

- Issue #4 owns product schema, migration SQL, row types, seed data, and
  backup/recovery behavior.
- Issue #9 owns media BLOB storage, `StorageAdapter`, media routes, and upload
  capability work.
- This local skeleton does not create cloud resources, deployment automation,
  credentials, or a human upload path.
