# Issue #34: Bootstrap application skeleton and local dev environment

GitHub issue: https://github.com/Saber5656/Vynema/issues/34

This file is the canonical implementation design for issue #34. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Bootstrap the Vynema application skeleton so that every implementation issue (#4 onward) has a concrete codebase to land in. This issue creates the monorepo layout, local Hono API/server, SQLite development database, frontend shell, shared contracts package, and baseline checks without choosing a production cloud.

This issue was split out because issues #4–#22 all implicitly assume an existing codebase, and no existing issue owns creating it.

## Scope

- Create the pnpm workspace monorepo layout (`apps/api`, `apps/web`, `packages/shared`, `tools/`).
- Set up TypeScript (strict), ESLint, Prettier, Vitest, and build scripts.
- Create the local Hono app/server, serving `/api/*`, development media routes, and static SPA assets from one same-origin process.
- Create the Vite + React SPA shell with routing and a health screen.
- Create local SQLite configuration and migration startup; no cloud binding or placeholder provider id.
- Document local development in `docs/development.md`.

## Out Of Scope

- Any product feature (auth, upload, publication, moderation).
- CI workflows (issue #21) — but scripts created here must be CI-invokable.
- Any production cloud resource, provider credential, deployment, or pricing decision (#42).

## Acceptance Criteria

- [ ] `pnpm install && pnpm build && pnpm test && pnpm lint && pnpm typecheck` all succeed from the repo root on a clean checkout.
- [ ] `pnpm dev` starts a local server; `GET /api/health` returns the documented health payload, including `environment`, and `/` serves the SPA shell.
- [ ] No secrets are committed; `.dev.vars.example` documents required local variables with dummy values.
- [ ] Repository layout matches the design below exactly.
- [ ] `docs/development.md` lets a new contributor run the stack with copy-paste commands.

## Dependencies

- #2 (architecture ADRs — this issue implements ADR-001/002/007 mechanically).

---

## Implementation Plan & Design (2026-07-02)

> This section is normative. Implement exactly as written. If something is impossible as specified, stop and comment on this issue instead of improvising.
> Read first: `docs/architecture/vynema-architecture.md`, `docs/security/security-contract.md`, and the ADR section of issue #2.

### 1. Fixed decisions used by this issue

| Topic | Decision |
|---|---|
| Package manager | pnpm **10.x**, workspace mode. pnpm 10 blocks dependency lifecycle (install) scripts by default — keep that default as a supply-chain control; if a dependency genuinely needs a build script, allowlist it explicitly via `pnpm.onlyBuiltDependencies` in the root `package.json` with a comment justifying it (expected: none). |
| Language | TypeScript 5.x, `strict: true` everywhere |
| API framework | Hono ^4 on the local Node 22 server adapter; Web-standard handlers stay portable |
| Frontend | Vite ^5 + React ^18 + react-router-dom ^6 + @tanstack/react-query ^5 |
| Single origin | One local process serves `/api/*`, `/media/*`, and the SPA. No CORS needed for the first-party web app. |
| Tests | Vitest ^2 with a fresh temporary SQLite database and real SQLite BLOB adapter per test suite. |
| Node version | 22.x (`.nvmrc` = `22`) |

### 2. Directory layout (create exactly this)

```text
/package.json                 # root: workspace scripts only, "private": true
/pnpm-workspace.yaml
/.nvmrc
/.editorconfig
/.prettierrc.json
/eslint.config.mjs            # flat config, typescript-eslint
/tsconfig.base.json
/apps/api/
  package.json                # name: @vynema/api
  src/server.ts                # local Node entry
  tsconfig.json
  vitest.config.ts
  .dev.vars.example
  migrations/                 # SQLite SQL migrations (filled by #4)
    0001_init.sql             # created by #4, NOT this issue; keep dir with .gitkeep
  src/
    index.ts                  # exports app factory
    app.ts                    # builds the Hono app, mounts routes
    env.ts                    # Env type: bindings + vars (single source of truth)
    routes/
      health.ts               # GET /api/health
    lib/
      .gitkeep                # middleware/repos land here in later issues
  test/
    health.test.ts
/apps/web/
  package.json                # name: @vynema/web
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx                   # router shell
    routes/
      HomePage.tsx            # placeholder: fetches /api/health, renders status
    lib/
      api.ts                  # fetch wrapper (see 5.3)
  test/
    App.test.tsx              # renders without crashing (happy-dom)
/packages/shared/
  package.json                # name: @vynema/shared
  tsconfig.json
  src/
    index.ts                  # re-exports
    api-types.ts              # error envelope + health types (see 5.4)
/tools/.gitkeep
/docs/development.md
```

### 3. Root configuration files (exact content)

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```

Root `package.json` scripts (workspace fan-out; each package defines its own `build`/`test`/`lint`/`typecheck`):

```json
{
  "name": "vynema-monorepo",
  "private": true,
  "scripts": {
    "build": "pnpm --filter @vynema/shared build && pnpm --filter @vynema/web build && pnpm --filter @vynema/api build",
    "dev": "pnpm --filter @vynema/web build && pnpm --filter @vynema/api dev",
    "test": "pnpm -r test",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write ."
  }
}
```

`tsconfig.base.json`: `"strict": true`, `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"noUncheckedIndexedAccess": true`, `"forceConsistentCasingInFileNames": true`, `"skipLibCheck": true`.

### 4. Local runtime and database configuration

- `apps/api/src/server.ts` uses `@hono/node-server` on
  `http://127.0.0.1:8787`, mounts the Hono app, serves `apps/web/dist`, and falls
  back to `index.html` for non-API/non-media routes.
- `VYNEMA_DB_PATH` defaults to `.local/vynema.sqlite`; startup creates `.local/`,
  opens SQLite, enables `PRAGMA foreign_keys=ON`, and applies pending migrations.
- `apps/api/.env.example` contains only safe placeholders for optional GitHub
  OAuth/session development values. `.env` and `.local/` are gitignored.
- No cloud URL, bucket/database id, deploy token, or provider secret is defined.

### 5. Code specifications

#### 5.1 `apps/api/src/env.ts`

```ts
export type Env = {
  db: Database;
  storage: StorageAdapter;
  environment: "development";
  // Secrets (optional at type level; features fail closed when absent):
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};
```

Every later issue extends this type here — it is the single source of truth for bindings.

#### 5.2 `apps/api/src/app.ts` and `index.ts`

```ts
// app.ts
import { Hono } from "hono";
import type { Env } from "./env";
import { healthRoute } from "./routes/health";

export function buildApp(env: Env) {
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("env", env); await next(); });
  app.route("/api", healthRoute);
  // Later issues mount more routes here. server.ts owns SPA static fallback.
  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "Not found", requestId: "" } }, 404)
  );
  return app;
}
```

```ts
// index.ts exports buildApp; server.ts constructs local env and starts Node.
```

`routes/health.ts`: Hono sub-router; `GET /health` returns `200 {"status":"ok","environment":"development"}`.

#### 5.3 `apps/web/src/lib/api.ts`

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? res.statusText);
  }
  return (await res.json()) as T;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
```

#### 5.4 `packages/shared/src/api-types.ts`

```ts
export type ApiErrorBody = { error: { code: string; message: string; requestId: string } };
export type HealthResponse = { status: "ok"; environment: string };
```

(Zod is added in #19; do not add it here.)

### 6. Test setup

- `apps/api/vitest.config.ts` uses standard Vitest node environment.
- `apps/api/test/health.test.ts`: create a temporary SQLite file and adapter, call `buildApp(env).request("http://x/api/health")`, assert status 200 and body `{status:"ok", environment:"development"}`, then remove the temporary directory.
- `apps/web` tests run with `environment: "happy-dom"`; `App.test.tsx` mocks `fetch` and asserts the shell renders.

### 7. Step-by-step implementation order

1. Root files (`package.json`, `pnpm-workspace.yaml`, `.nvmrc`, tsconfigs, eslint flat config with `typescript-eslint` recommended, prettier). Checkpoint: `pnpm install` succeeds.
2. `packages/shared` (build = `tsc -p tsconfig.json` emitting to `dist/`, with `exports` map). Checkpoint: `pnpm --filter @vynema/shared build`.
3. `apps/web` shell. Checkpoint: `pnpm --filter @vynema/web build` produces `apps/web/dist/index.html`.
4. `apps/api` local server + SQLite bootstrap. Checkpoint: `pnpm --filter @vynema/api dev` then `curl http://127.0.0.1:8787/api/health` returns ok; `curl http://127.0.0.1:8787/` returns the SPA HTML.
5. Vitest configs + the two tests. Checkpoint: `pnpm test` green.
6. `docs/development.md`: prerequisites (Node 22, pnpm 10), install, dev, test, lint, SQLite path/reset/backup, and optional local OAuth setup.
7. Update `.gitignore`: add `node_modules/`, `dist/`, `.local/`, `.env`, `*.sqlite`, `*.sqlite-*` if not present.

### 8. Guardrails

- Do NOT add: deploy scripts, GitHub Actions, `pull_request_target`, any dependency not listed above, any secret value.
- Pin dependency majors as listed; use caret ranges within majors.
- PR must include the security-contract evidence block: state "no workflow changes, no cloud resources or provider credentials".

### 9. PR / evidence checklist

- [ ] Output of `pnpm build && pnpm test && pnpm lint && pnpm typecheck` pasted in PR.
- [ ] `curl /api/health` output pasted in PR.
- [ ] Confirmation that `.env` and `.local/` are gitignored.

---
Stable Issue Key: AIT-MVP-026
Classification: MVP Blocking
Dependencies: #2
Labels: area/platform, area/infra, type/implementation, priority/p0, mvp-blocking

