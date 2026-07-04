# Issue #34: Bootstrap application skeleton and local dev environment

GitHub issue: https://github.com/Saber5656/Vynema/issues/34

This file is the canonical implementation design for issue #34. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Bootstrap the Vynema application skeleton so that every implementation issue (#4 onward) has a concrete codebase to land in. Today the repository contains documentation only. This issue creates the monorepo layout, toolchain, Cloudflare Workers app shell, frontend shell, shared contracts package, local development flow, and baseline checks.

This issue was split out because issues #4–#22 all implicitly assume an existing codebase, and no existing issue owns creating it.

## Scope

- Create the pnpm workspace monorepo layout (`apps/api`, `apps/web`, `packages/shared`, `tools/`).
- Set up TypeScript (strict), ESLint, Prettier, Vitest, and build scripts.
- Create the Cloudflare Worker app shell with Hono, serving `/api/*` routes and static SPA assets from one Worker.
- Create the Vite + React SPA shell with routing and a health screen.
- Create `wrangler.toml` with D1 / R2 bindings (placeholder IDs), local dev via `wrangler dev`.
- Document local development in `docs/development.md`.

## Out Of Scope

- Any product feature (auth, upload, publication, moderation).
- CI workflows (issue #21) — but scripts created here must be CI-invokable.
- Real Cloudflare resource creation (issue #21 / #29).

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
| API framework | Hono ^4 on Cloudflare Workers |
| Frontend | Vite ^5 + React ^18 + react-router-dom ^6 + @tanstack/react-query ^5 |
| Single origin | One Worker serves both `/api/*` (Hono) and static SPA assets (Workers Static Assets). No Cloudflare Pages. No CORS needed for the first-party web app. |
| Tests | Vitest ^2. API tests use `@cloudflare/vitest-pool-workers` (runs in workerd with real D1/R2 local bindings). |
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
  wrangler.toml
  tsconfig.json
  vitest.config.ts
  .dev.vars.example
  migrations/                 # D1 SQL migrations (filled by #4)
    0001_init.sql             # created by #4, NOT this issue; keep dir with .gitkeep
  src/
    index.ts                  # Worker entry: export default app
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

### 4. `apps/api/wrangler.toml` (exact content; placeholder IDs are intentional)

```toml
name = "vynema"
main = "src/index.ts"
compatibility_date = "2026-06-01"

# Static SPA assets built by @vynema/web.
# run_worker_first ensures /api/* always reaches the Worker.
[assets]
directory = "../web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "vynema-db"
database_id = "PLACEHOLDER-SET-IN-ISSUE-21"

[[r2_buckets]]
binding = "MEDIA_PENDING"
bucket_name = "vynema-media-pending"

[[r2_buckets]]
binding = "MEDIA_PUBLIC"
bucket_name = "vynema-media-public"

[vars]
ENVIRONMENT = "local"
PUBLIC_MEDIA_BASE_URL = "http://127.0.0.1:8787/dev-media"

[observability]
enabled = true
```

Notes:
- `wrangler dev` provisions local D1/R2 automatically (miniflare); placeholder `database_id` is fine for local. Issue #21 replaces IDs per environment.
- Secrets (`GITHUB_OAUTH_CLIENT_SECRET`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`, `SESSION_SECRET`) are NOT in this file. `.dev.vars.example` lists them with `changeme` values; developers copy to `.dev.vars` (gitignored — verify `.gitignore` covers `.dev.vars` and add if missing).

### 5. Code specifications

#### 5.1 `apps/api/src/env.ts`

```ts
export type Env = {
  DB: D1Database;
  MEDIA_PENDING: R2Bucket;
  MEDIA_PUBLIC: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: "local" | "preview" | "production";
  PUBLIC_MEDIA_BASE_URL: string;
  // Secrets (optional at type level; features fail closed when absent):
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  SESSION_SECRET?: string;
  CF_CACHE_PURGE_TOKEN?: string;  // zone-scoped cache purge for takedown (#11); optional until custom domain
  CF_ZONE_ID?: string;
};
```

Every later issue extends this type here — it is the single source of truth for bindings.

#### 5.2 `apps/api/src/app.ts` and `index.ts`

```ts
// app.ts
import { Hono } from "hono";
import type { Env } from "./env";
import { healthRoute } from "./routes/health";

export function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api", healthRoute);
  // Later issues mount more routes here. Assets are served automatically
  // for non-/api paths because of run_worker_first = ["/api/*"].
  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "Not found", requestId: "" } }, 404)
  );
  return app;
}
```

```ts
// index.ts
import { buildApp } from "./app";
export default buildApp();
```

`routes/health.ts`: Hono sub-router; `GET /health` returns `200 {"status":"ok","environment":c.env.ENVIRONMENT}`.

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

- `apps/api/vitest.config.ts` uses `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config` with `wrangler: { configPath: "./wrangler.toml" }`.
- `apps/api/test/health.test.ts`: import `SELF` from `cloudflare:test`, call `SELF.fetch("http://x/api/health")`, assert status 200 and body `{status:"ok", environment:"local"}`. (Set `ENVIRONMENT` via miniflare vars if needed.)
- `apps/web` tests run with `environment: "happy-dom"`; `App.test.tsx` mocks `fetch` and asserts the shell renders.
- Note: the assets binding is not served by vitest-pool-workers; API tests must only hit `/api/*`.

### 7. Step-by-step implementation order

1. Root files (`package.json`, `pnpm-workspace.yaml`, `.nvmrc`, tsconfigs, eslint flat config with `typescript-eslint` recommended, prettier). Checkpoint: `pnpm install` succeeds.
2. `packages/shared` (build = `tsc -p tsconfig.json` emitting to `dist/`, with `exports` map). Checkpoint: `pnpm --filter @vynema/shared build`.
3. `apps/web` shell. Checkpoint: `pnpm --filter @vynema/web build` produces `apps/web/dist/index.html`.
4. `apps/api` shell + wrangler.toml. Checkpoint: `pnpm --filter @vynema/api dev` then `curl http://127.0.0.1:8787/api/health` returns ok; `curl http://127.0.0.1:8787/` returns the SPA HTML.
5. Vitest configs + the two tests. Checkpoint: `pnpm test` green.
6. `docs/development.md`: prerequisites (Node 22, pnpm 10), install, dev, test, lint commands, `.dev.vars` setup, and a troubleshooting note that placeholder D1 IDs are expected until #21.
7. Update `.gitignore`: add `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`, `*.local` if not present.

### 8. Guardrails

- Do NOT add: deploy scripts, GitHub Actions, `pull_request_target`, any dependency not listed above, any secret value.
- Pin dependency majors as listed; use caret ranges within majors.
- PR must include the security-contract evidence block (this touches repo tooling): state "no workflow changes, no secrets, placeholder IDs only".

### 9. PR / evidence checklist

- [ ] Output of `pnpm build && pnpm test && pnpm lint && pnpm typecheck` pasted in PR.
- [ ] `curl /api/health` output pasted in PR.
- [ ] Confirmation that `.dev.vars` is gitignored (`git check-ignore apps/api/.dev.vars`).

---
Stable Issue Key: AIT-MVP-026
Classification: MVP Blocking
Dependencies: #2
Labels: area/platform, area/infra, type/implementation, priority/p0, mvp-blocking


