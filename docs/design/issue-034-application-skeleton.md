# Issue #34: Bootstrap application skeleton and local dev environment

GitHub issue: https://github.com/Saber5656/Vynema/issues/34

This file is the canonical implementation design for issue #34. The GitHub
issue body carries a short summary and links back to this file.

---

## Summary

Bootstrap the Vynema application skeleton so that implementation issues #4
onward have a concrete codebase to land in. This issue creates the pnpm
workspace, local Hono server, built-in SQLite bootstrap, React shell, shared API
contracts, baseline checks, and contributor documentation without choosing a
production cloud.

The scope was clarified on 2026-07-16 after an independent design review found
that the previous version overlapped the schema work in #4 and the media BLOB
adapter work in #9. This design now defines only the minimum foundation those
issues need.

## Scope

- Create the pnpm workspace layout (`apps/api`, `apps/web`,
  `packages/shared`, `tools/`).
- Set up strict TypeScript, ESLint, Prettier, Vitest, and build scripts.
- Create a local Node 22 Hono server that serves `/api/*` and the built React
  SPA from one same-origin process.
- Create `GET /api/health` and a React health screen.
- Open a local database with Node's built-in `node:sqlite` `DatabaseSync`,
  enable and verify `PRAGMA foreign_keys=ON`, and run the minimum ordered SQL
  migration seam described below.
- Document local development in `docs/development.md`.

## Out of scope

- Product schema, committed migration SQL, row/repository types, seed data,
  backup/recovery commands, and schema tests. Issue #4 owns them.
- `Env.storage`, a `StorageAdapter` interface or implementation, SQLite BLOB
  storage, `media_blobs`, media routes, upload capabilities, and real adapter
  tests. Issue #9 owns them.
- Auth, upload, publication, moderation, quota, or other product features.
- CI workflows (issue #21). The scripts created here remain CI-invokable.
- Any production cloud resource, provider credential, deployment, release, or
  pricing decision (issue #42).

If implementation reveals a substantial independent requirement that has no
existing owner, create a separate issue that documents its dependency on #34,
out-of-scope boundary, and acceptance criteria before expanding this PR.

## Acceptance criteria

- [ ] `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`,
      `pnpm lint`, and `pnpm typecheck` succeed from the repository root on a
      clean checkout using Node 22.13+ and pnpm 10.
- [ ] `pnpm dev` starts the local server; `GET /api/health` returns
      `{"status":"ok","environment":"development"}`, and `/` serves the
      built SPA shell.
- [ ] SQLite starts with `foreign_keys=ON`; an empty migrations directory is a
      valid no-op; later numbered SQL files can be applied once in numeric
      order.
- [ ] No secrets are committed. `apps/api/.env.example` contains safe example
      values only, while `.env`, `.local/`, SQLite files, dependencies, build
      output, and coverage are ignored.
- [ ] Repository layout matches this design and `docs/development.md` gives a
      new contributor copy-paste commands for the supported workflow.

## Dependencies

- #2 (architecture ADRs; this issue implements ADR-001, ADR-002, and ADR-007
  mechanically).

---

## Implementation plan and design (clarified 2026-07-16)

> This section is normative. Implement exactly as written. If something is
> impossible as specified, stop and report the conflict instead of improvising.
> Read first: `docs/architecture/vynema-architecture.md`,
> `docs/security/security-contract.md`, and the ADRs under
> `docs/architecture/adr/`.

### 1. Fixed decisions

| Topic                  | Decision                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager        | pnpm 10.x in workspace mode. Root `packageManager` pins the exact tested 10.x release. Keep pnpm 10's dependency lifecycle-script deny boundary; do not add `pnpm.onlyBuiltDependencies` in this issue. |
| Node                   | `>=22.13 <23`, `.nvmrc` = `22`. Node 22.13+ is required because `node:sqlite` runs without an experimental flag from that release.                                                                      |
| Language               | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` everywhere.                                                                                                                            |
| API                    | `hono@^4` with `@hono/node-server@^2`. Hono handlers use Web-standard request/response APIs.                                                                                                            |
| Frontend               | `vite@^5`, `@vitejs/plugin-react@^4`, React/ReactDOM `^18`, `react-router-dom@^6`, and `@tanstack/react-query@^5`.                                                                                      |
| Tests                  | `vitest@^2`; API tests use Node and temporary built-in SQLite databases; web tests use `happy-dom`. No storage adapter is created or tested here.                                                       |
| Static analysis        | ESLint `^9` flat config with `typescript-eslint@^8`, Prettier `^3`, `@types/node@^22`, `@types/react@^18`, and `@types/react-dom@^18`.                                                                  |
| SQLite                 | Node built-in `node:sqlite` `DatabaseSync`; no third-party SQLite driver.                                                                                                                               |
| Single origin          | One local process serves `/api/*` and the built SPA. No CORS is needed for the first-party web app. Media routes are added by #9, not this issue.                                                       |
| Local environment file | `apps/api/.env.example`. This matches the local Node runtime and the repository's `!.env.example` ignore exception. Do not create the Cloudflare/Wrangler-specific `.dev.vars.example`.                 |

All dependencies allowed by this issue are named in the table. Use caret ranges
within the specified majors; the lockfile pins the resolved versions. Do not add
another runtime, build, lint, test, SQLite, or DOM package without a design
clarification.

### 2. Directory layout

```text
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
/.nvmrc
/.editorconfig
/.prettierrc.json
/.prettierignore            # preserves unrelated historical documents
/eslint.config.mjs
/tsconfig.base.json
/apps/api/
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
  migrations/
    .gitkeep                 # actual SQL is owned by #4
  src/
    index.ts                 # public application exports
    server.ts                # local Node entry and SPA hosting
    app.ts                   # Hono application factory
    env.ts                   # local Env type, without storage
    routes/
      health.ts
    lib/
      database.ts            # DatabaseSync alias and connection bootstrap
      migrations.ts          # minimum ordered migration seam
  test/
    health.test.ts
    database.test.ts
    migrations.test.ts
/apps/web/
  package.json
  index.html
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
    routes/
      HomePage.tsx
    lib/
      api.ts
  test/
    App.test.tsx
/packages/shared/
  package.json
  tsconfig.json
  src/
    index.ts
    api-types.ts
/tools/.gitkeep
/docs/development.md
```

Do not add a migration SQL file, product table, storage adapter, or media route
to make the skeleton appear more complete.

### 3. Root configuration

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```

The root `package.json` is private, pins the tested pnpm 10 release in
`packageManager`, enforces the Node/pnpm major contract in `engines`, and owns
the shared development dependencies. Its scripts are:

```json
{
  "scripts": {
    "build": "pnpm --filter @vynema/shared build && pnpm --filter @vynema/web build && pnpm --filter @vynema/api build",
    "dev": "pnpm --filter @vynema/shared build && pnpm --filter @vynema/web build && pnpm --filter @vynema/api dev",
    "test": "pnpm -r test",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

`.prettierignore` excludes historical project documentation that predates this
tooling baseline, then opts `docs/development.md` and the issue #34 canonical
design back in. This prevents a format command for the skeleton from creating
unrelated repository-wide documentation changes.

`tsconfig.base.json` uses `target: "ES2022"`, `module: "ESNext"`,
`moduleResolution: "Bundler"`, `strict: true`,
`noUncheckedIndexedAccess: true`, `forceConsistentCasingInFileNames: true`,
and `skipLibCheck: true`. Workspace consumers resolve `@vynema/shared` through
its built package exports; the root build therefore compiles shared contracts
before the web and API packages.

### 4. Local runtime and database

- `apps/api/src/server.ts` listens on `http://127.0.0.1:8787`, builds the Hono
  app, serves `apps/web/dist`, and falls back to `index.html` only for
  non-API routes.
- `VYNEMA_DB_PATH` defaults to the repository-root
  `.local/vynema.sqlite`. Startup creates its parent directory, opens SQLite,
  enables and verifies `PRAGMA foreign_keys=ON`, runs pending migrations, and
  closes the database during orderly shutdown.
- `apps/api/.env.example` contains a safe example database path and empty
  placeholders for future optional GitHub OAuth/session values. It contains no
  real secret, provider identifier, or cloud binding.
- The API development script builds TypeScript and uses Node's
  `--env-file-if-exists=.env` support. No dotenv dependency is needed.

#### 4.1 Database boundary

`apps/api/src/lib/database.ts` exports:

```ts
import type { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;
export function openDatabase(path: string): Database;
```

`openDatabase` creates the database's parent directory, opens `DatabaseSync`,
executes `PRAGMA foreign_keys=ON`, reads the pragma back, and fails closed if it
is not enabled. The constructor is loaded from the exact built-in `node:sqlite`
module through Node's `createRequire(import.meta.url)`; this keeps Vitest 2 /
Vite 5 from treating the newer built-in name as a file while providing no
third-party driver or fallback. `Env` uses this `Database` type and does not
contain storage:

```ts
export type Env = {
  db: Database;
  environment: "development";
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};
```

The optional values reserve the single source of truth for later features; #34
does not read or validate them beyond local environment construction.

#### 4.2 Minimum migration seam

`apps/api/src/lib/migrations.ts`:

- accepts a `Database` and migrations directory;
- treats an existing empty directory as a successful no-op;
- recognizes only files named `NNNN_name.sql` with a positive integer version;
- sorts by numeric version and rejects duplicate versions;
- reads `PRAGMA user_version`, skips versions already applied, and applies each
  pending file in its own transaction;
- sets `PRAGMA user_version` only in the same successful transaction;
- rolls back and rethrows on failure; and
- returns the versions applied during that call for diagnostics and tests.

The runner is mechanics only. Issue #4 owns committed migration SQL, product
schema policy, seed data, operational migration commands, backup/recovery, and
schema-specific tests.

### 5. Application and shared contracts

- `buildApp(env)` creates the Hono application, stores `env` in typed Hono
  context variables, mounts the health route at `/api/health`, and returns the
  shared JSON error envelope for unmatched `/api/*` routes.
- `GET /api/health` returns
  `200 {"status":"ok","environment":"development"}`.
- `server.ts` owns Node-only static file handling so the application factory
  remains portable.
- `packages/shared/src/api-types.ts` exports:

```ts
export type ApiErrorBody = {
  error: { code: string; message: string; requestId: string };
};
export type HealthResponse = {
  status: "ok";
  environment: string;
};
```

- `apps/web/src/lib/api.ts` provides a same-origin JSON fetch wrapper and a
  typed `ApiError`.
- The React application uses BrowserRouter and TanStack Query. `HomePage`
  requests `/api/health` and renders loading, success, and failure states.
- Runtime schema validation such as Zod remains owned by #19.

### 6. Tests

- API health test: create a temporary database, call
  `buildApp(env).request("http://local.test/api/health")`, and assert the exact
  status and payload.
- Database test: assert the opened temporary connection reports
  `foreign_keys=1`.
- Migration tests: assert an empty directory is a no-op, then create temporary
  test-only numbered SQL files and prove they run once in numeric order. Do not
  commit a product migration.
- Web test: use `happy-dom`, mock `fetch`, render the application, and assert
  the shell and health state without adding a separate React testing library.
- Every test closes databases, unmounts React roots, restores global mocks, and
  removes temporary directories.

### 7. Implementation order

1. Root workspace and tooling. Checkpoint: lockfile generation and frozen
   install succeed.
2. Shared API contracts. Checkpoint: shared package build succeeds.
3. React shell. Checkpoint: Vite produces `apps/web/dist/index.html`.
4. Hono app, built-in SQLite bootstrap, migration seam, and local server.
5. Tests and all root checks.
6. `docs/development.md`, ignore evidence, live same-origin smoke test, secret
   scan, and independent role reviews.

### 8. Guardrails

- Do not add deploy scripts, GitHub Actions, `pull_request_target`, cloud
  resources, provider credentials, dependency lifecycle-script exceptions, or
  any dependency outside the fixed decisions above.
- Do not add #4 schema work or #9 storage/media work.
- Preserve same-origin routing and fail closed on database bootstrap errors.
- The PR security evidence must state: no workflow changes, no cloud resources
  or provider credentials, no secrets, and storage/upload boundaries are N/A
  because they remain outside #34.

### 9. PR and evidence checklist

- [ ] Frozen install and `pnpm build`, `pnpm test`, `pnpm lint`,
      `pnpm typecheck`, and `pnpm format:check` outputs recorded.
- [ ] Live `/api/health` JSON and `/` SPA evidence recorded.
- [ ] `foreign_keys=ON`, empty migration no-op, and ordered one-time migration
      behavior covered by tests.
- [ ] `.env`, `.local/`, SQLite files, dependencies, output, and coverage ignore
      checks recorded.
- [ ] `git diff --check` and repository secret scan recorded.
- [ ] Independent Saihai `tech-qa`, `tech-reviewer`, and infrastructure/security
      review evidence recorded before publication.

---

Stable Issue Key: AIT-MVP-026

Classification: MVP Blocking

Dependencies: #2

Labels: area/platform, area/infra, type/implementation, priority/p0, mvp-blocking
