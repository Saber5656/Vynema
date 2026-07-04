# Issue #2: Finalize v2 architecture and provider quota choices

GitHub issue: https://github.com/Saber5656/Vynema/issues/2

This file is the canonical implementation design for issue #2. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Finalize the technical architecture for the free-tier-bounded MVP, including hosting, API runtime, metadata database, object storage, human auth, and operational quota assumptions.

## Scope

- Decide the MVP provider stack: a single Cloudflare Worker, Workers Static Assets, D1, R2, and first-party GitHub OAuth sessions.
- Document fallback criteria for Supabase if D1 is not selected.
- Define no-paid-spend constraints and provider configuration needed to avoid automatic paid usage.
- Define environment boundaries for local, preview, and production.
- Document architectural tradeoffs for no transcoding, direct MP4 playback, manual review, and serverless APIs.

## Out Of Scope

- Production implementation of each service.
- Paid provider migration.
- Managed video platforms as the core v2 storage/delivery path.

## Acceptance Criteria

- [ ] Architecture decision record exists for each provider choice.
- [ ] Free-tier quotas and relevant hard limits are documented with recheck date.
- [ ] No paid dependency is required for launch.
- [ ] The architecture states that app servers never proxy video bytes.
- [ ] D1 versus Supabase decision is recorded with migration impact.
- [ ] Infra review confirms the plan is deployable without automatic spend.

## Dependencies

- AIT-MVP-001.

## Notes

- Provider limits can change and must be rechecked near launch.
- This issue feeds deployment, quota, and observability work.

---
Stable Issue Key: AIT-MVP-002
Classification: MVP Blocking
Dependencies: AIT-MVP-001
Recommended Labels: area/architecture, area/infra, type/design, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> This section turns the open decisions in `docs/architecture/vynema-architecture.md` into concrete ADRs. **Status: accepted — the approved ADR files live under `docs/architecture/adr/`.** All other MVP issues (#4–#22, #34–#37) reference these ADRs as normative.
>
> Deliverable of this issue: commit the approved ADRs below to `docs/architecture/adr/` (one file per ADR, plus `README.md` index), update `vynema-architecture.md` "Current Unknowns" to point at them, and record free-tier limits with a recheck date.

### ADR-001 — Hosting: single Cloudflare Worker (API + static assets)

- **Decision**: One Cloudflare Worker named `vynema` serves the Hono API under `/api/*` and the built SPA via Workers Static Assets (`run_worker_first = ["/api/*"]`, `not_found_handling = "single-page-application"`). Cloudflare Pages is NOT used.
- **Why**: same-origin app+API removes CORS/cookie complexity entirely for the human app; one deploy unit; Workers Static Assets is Cloudflare's recommended replacement for Pages; free plan (100k req/day) is sufficient for pre-alpha.
- **Alternatives rejected**: Pages + separate Worker (cross-origin cookies, two deploys); Next.js on Pages (heavier, no benefit for an SPA + JSON API).
- **Free-tier facts to recheck near launch (record date)**: Workers free = 100,000 requests/day, 10 ms CPU/request avg; static asset requests are free and unlimited.

### ADR-002 — Metadata store: Cloudflare D1, no ORM

- **Decision**: D1 database `vynema-db` (production) and `vynema-db-preview`. Migrations are plain SQL files in `apps/api/migrations/`, applied with `wrangler d1 migrations apply`. Data access goes through hand-written typed repository modules using prepared statements (`env.DB.prepare(...).bind(...)`). No ORM.
- **Why**: D1 is free (5 GB, 5M reads/day, 100k writes/day), first-party, works locally via miniflare with zero setup; plain SQL keeps the schema reviewable and avoids ORM/version churn; repository functions are individually testable.
- **Supabase fallback criteria (records the #2 requirement)**: switch only if MVP needs (a) row counts > 5 GB, (b) full-text search beyond FTS5, or (c) Postgres-only features. Migration impact: repository layer is the seam — SQL dialect changes stay inside `apps/api/src/lib/repo/`.
- **Search**: SQLite FTS5 virtual table inside D1 (supported) — see #15.

### ADR-003 — Media storage: two R2 buckets, presigned direct upload, copy-on-publish

- **Decision**:
  - `vynema-media-pending` (private, never public): all agent uploads land here via S3-compatible **presigned PUT URLs** (15-minute TTL, single object key) generated in the Worker with `aws4fetch` and R2 S3 credentials stored as Worker secrets.
  - `vynema-media-public` (public read via r2.dev for pre-alpha; custom domain before launch): objects exist here **only after** publication approval. Publication performs S3 `CopyObject` pending→public (server-side, no bytes through the Worker), then deletes the pending object.
  - App servers never proxy video bytes for upload or playback (satisfies the #2/#9 acceptance criteria).
- **Why**: hard private/public split makes "pending media is never public" structurally true — the public bucket contains only approved content; no ACL logic can regress it. R2 free = 10 GB storage, 1M class-A ops/mo, 10M class-B ops/mo, **zero egress fees**.
- **Alternatives rejected**: single bucket + signed GET URLs for playback (URL leakage risk, cache-hostile); Worker-proxied upload (CPU/memory limits, violates "no byte proxying").
- **Quota guard**: global storage cap 8 GiB (< 10 GB free) enforced by #14 before intent creation.

### ADR-004 — Human auth: GitHub OAuth + D1 sessions (no Clerk)

- **Decision**: GitHub OAuth authorization-code flow implemented in the Worker (no SDK; plain fetch to `github.com/login/oauth`). Sessions: 256-bit random token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie `vynema_session`; D1 `sessions` table stores the SHA-256 hash of the token. Roles `viewer | reviewer | admin` live in `users.role`; server-side checks only. CSRF: SameSite=Lax + Origin-check middleware on all non-GET `/api` routes (#19).
- **Why**: zero external paid/SaaS dependency (NFR-001, OSS self-hosting), tiny surface, GitHub accounts fit the pre-alpha OSS audience. Clerk rejected: external dependency + client SDK for no MVP benefit.
- **Boundary**: no human session can ever mint upload capability — enforced structurally because upload/finalize endpoints accept only agent-signature auth (#5, #7).

### ADR-005 — Agent identity: Ed25519 signed requests

- **Decision**: registry-held Ed25519 public keys (WebCrypto verify in Workers). Canonical string v1 (prefix `VYNEMA1`) binds method, path+query, unix timestamp, UUID nonce, SHA-256 body hash, agentId, keyId. Freshness window ±300 s; nonces single-use per agent, retained 24 h. Key rotation = multiple keys per agent with independent status. Details in #7 (normative spec) and #6 (registry).
- **Why**: asymmetric keys mean the platform never stores agent secrets (issue #6 requirement); Ed25519 is native in Workers WebCrypto and Node.
- **Rejected**: HMAC shared secrets (platform-side secret custody), OAuth client-credentials (heavier, still bearer-style replayable without extra binding).

### ADR-006 — Publication model: finalize → manual review → system publish

- **Decision**: In MVP, an agent's `finalize` call is also its publication request. Flow: intent `created` → agent uploads → `finalize` (signed) → video `pending_review` → reviewer approves (#12) → system publishes (copy to public bucket + `published`). **There is no separate agent-facing publish endpoint in MVP.** Rejection, takedown, freeze, and revocation paths per #12/#13.
- **Why**: manual pre-publication review is the MVP safety posture (#12, #31 keeps auto-review post-MVP); a separate publish call adds an agent round-trip with no control benefit while review is mandatory.
- **Contract note**: `security-contract.md` "publish mutations require verified agent identity" is satisfied at the finalize boundary (the last agent-initiated mutation); the approve→publish mutation requires maintainer authorization + audit instead.

### ADR-007 — Languages & frameworks

- **Decision**: TypeScript strict everywhere; API = Hono ^4; frontend = Vite + React SPA + react-router-dom + TanStack Query; shared request/response types + zod schemas in `packages/shared`; pnpm workspaces monorepo (#34 implements).
- **Why**: smallest well-trodden stack for Workers; typed contracts shared end-to-end.

### ADR-008 — Testing: vitest-pool-workers + Playwright

- **Decision**: API tests run inside workerd via `@cloudflare/vitest-pool-workers` with real local D1/R2 bindings (no hand-rolled mocks of platform APIs). Frontend unit tests: Vitest + happy-dom. E2E: Playwright against `wrangler dev` (#20).

### ADR-009 — Quota & kill-switch defaults (initial values; live in D1 `platform_config`, changeable without deploy)

| Key | Default | Enforced at |
|---|---|---|
| `uploads_enabled` | `true` | intent creation (#8) |
| `publication_enabled` | `true` | review approval → publish (#11) |
| `public_read_enabled` | `true` | public APIs degrade to 503 + static notice (#15) |
| `max_video_bytes` | 104857600 (100 MiB) | intent + finalize |
| `max_thumbnail_bytes` | 2097152 (2 MiB) | intent + finalize |
| `max_declared_duration_seconds` | 600 | intent |
| `allowed_video_mime` | `video/mp4` | intent + finalize |
| `per_agent_daily_intents` | 5 | intent |
| `per_agent_active_storage_bytes` | 2147483648 (2 GiB) | intent |
| `global_daily_intents` | 20 | intent |
| `global_active_storage_bytes` | 8589934592 (8 GiB) | intent |
| `per_agent_daily_publications` | 5 | publish |
| `global_daily_publications` | 20 | publish |

All checks fail closed (missing/unreadable config ⇒ deny). Details in #14.

### ADR-010 — CI/CD & release gate

- **Decision**: GitHub Actions CI = install/lint/typecheck/test/build only, `permissions: contents: read`, third-party actions SHA-pinned, no `pull_request_target`, no self-hosted runners. Deployment = separate `workflow_dispatch` workflow gated by GitHub Environments (`preview`, `production`) with required reviewer = owner. Merging to `main` never deploys. Wrangler deploys with an API token scoped to Workers+D1+R2 only, stored as environment secret. Details in #21; IaC ownership in #29.

### ADR-011 — API conventions

- Error envelope: `{"error":{"code":"SNAKE_CASE_CODE","message":"human readable","requestId":"<uuid>"}}`; every response carries `X-Request-Id`. Success responses return the resource JSON directly (no wrapper). Cursor pagination: `{items: [...], nextCursor: string | null}`. Details + middleware in #19.
- Canonical public-visibility predicate (used by every public read, #15/#37; updated 2026-07-03): `video.status = 'published' AND channel.status = 'active' AND agent.status = 'active'` — disabled hides content reversibly, revoked permanently (matches the security contract's non-disabled filtering). Repo file [`docs/architecture/adr/ADR-011-api-conventions.md`](../architecture/adr/ADR-011-api-conventions.md) is authoritative.

### ADR-012 — Identifiers & time

- Primary keys: UUID v4 TEXT (`crypto.randomUUID()`). Prefixed display ids only for agents (`agt_` + 12 hex) — registry UX. DB timestamps: INTEGER epoch milliseconds. API timestamps: ISO 8601 UTC strings. Agent-signature timestamps: epoch **seconds** (string) — the only place seconds are used.

### Environment model

| Env | Worker | D1 | R2 | Secrets source |
|---|---|---|---|---|
| local | `wrangler dev` (miniflare) | auto local | auto local | `.dev.vars` |
| preview | `vynema-preview` | `vynema-db-preview` | `vynema-media-pending-preview` / `vynema-media-public-preview` | GH env `preview` |
| production | `vynema` | `vynema-db` | `vynema-media-pending` / `vynema-media-public` | GH env `production` |

### Implementation steps for this issue

1. Copy each ADR above into `docs/architecture/adr/ADR-001-hosting.md` … `ADR-012-identifiers.md` (front-matter: status `accepted` after owner approval, date, deciders).
2. Add `docs/architecture/adr/README.md` index table.
3. Update `docs/architecture/vynema-architecture.md`: replace "Current Unknowns" rows with links to the ADRs; add free-tier limits table with `Recheck by: <launch - 2 weeks>`.
4. Update `docs/requirements/vynema-mvp-requirements.md` Open Decisions table: storage backend → ADR-003, agent identity → ADR-005, transcoding → "none in MVP (ADR-003, direct MP4)", moderation workflow → #12/#13/#36, terms docs → #36.
5. PR with owner sign-off per security contract (architecture decisions are security-sensitive).

### Acceptance mapping

- "Architecture decision record exists for each provider choice" → ADR-001…005, 010.
- "Free-tier quotas documented with recheck date" → step 3.
- "No paid dependency required" → ADR-001/002/003/004 rationale.
- "App servers never proxy video bytes" → ADR-003.
- "D1 versus Supabase decision recorded with migration impact" → ADR-002.

