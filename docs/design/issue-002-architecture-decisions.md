# Issue #2: Finalize v2 architecture and provider quota choices

GitHub issue: https://github.com/Saber5656/Vynema/issues/2

This file is the canonical implementation design for issue #2. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Define the provider-independent development architecture and defer production cloud, database/media provider, pricing, and migration decisions to the release-readiness gate in #42.

## Scope

- Define local SQLite metadata/media BLOB storage behind repository and `StorageAdapter` seams.
- Keep development free of cloud provider credentials and paid resources.
- Define the boundary between local development and #42 production migration.
- Document architectural tradeoffs for no transcoding, direct MP4 playback, manual review, and serverless APIs.

## Out Of Scope

- Production implementation of each service.
- Paid provider migration.
- Managed video platforms as the core v2 storage/delivery path.

## Acceptance Criteria

- [ ] Development ADRs specify local SQLite metadata and media BLOBs behind adapters.
- [ ] No cloud account, provider credential, or paid dependency is required for development.
- [ ] #42 is the explicit launch blocker for provider/pricing selection and migration rehearsal.
- [ ] Private-before-public, quota, takedown, and agent-only boundaries remain provider-independent.
- [ ] Infra/security review confirms production is not implied or provisioned by the development design.

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

> This section turns the open decisions in `docs/architecture/vynema-architecture.md` into concrete ADRs. **Status: amended by owner decision 2026-07-15.** Development database/media decisions are local and provider-independent; production provider/pricing/migration is launch-blocked on #42. All other MVP issues reference the amended ADR files as normative.
>
> Deliverable of this issue: commit the approved ADRs below to `docs/architecture/adr/` (one file per ADR, plus `README.md` index), update `vynema-architecture.md` "Current Unknowns" to point at them, and record free-tier limits with a recheck date.

### ADR-001 — Hosting: same-origin local development; production deferred

- **Decision**: development runs one same-origin local Hono process for API, media routes, and built SPA fallback. No production hosting provider or pricing plan is selected.
- **Why**: local work needs no cloud account or credentials; same-origin removes CORS/cookie complexity; Web-standard APIs and adapters preserve portability.
- **Production gate**: #42 selects hosting/runtime and adds current pricing/limits and migration/deploy evidence.

### ADR-002 — Metadata store: local SQLite, no ORM

- **Decision**: development uses a repository-owned SQLite database with plain SQL migrations and hand-written typed repositories. No cloud database or ORM is required.
- **Why**: local development remains reproducible without accounts, secrets, or pricing assumptions; plain SQL keeps migrations reviewable.
- **Production gate**: #42 selects the production database and rehearses export/import. Repository interfaces are the migration seam.
- **Search**: SQLite FTS5 in development — see #15.

### ADR-003 — Media storage: SQLite BLOB development adapter

- **Decision**: development stores immutable video/thumbnail BLOBs in SQLite through `StorageAdapter`. One-time intent/kind-scoped upload capabilities store only token hashes. Publication changes visibility/status over the same BLOB; it does not duplicate bytes.
- **Why**: development needs no cloud storage, provider credentials, or pricing decision while retaining testable private-before-public and takedown boundaries.
- **Production gate**: #42 selects media storage/delivery/pricing and rehearses BLOB migration. No provider-specific quota mitigation is claimed before then.
- **Quota guard**: development caps are application configuration, not provider free-tier claims.

### ADR-004 — Human auth: GitHub OAuth + SQLite sessions (no Clerk)

- **Decision**: GitHub OAuth authorization-code flow implemented in the API (no SDK; plain fetch to `github.com/login/oauth`). Sessions: 256-bit random token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie `vynema_session`; local SQLite `sessions` stores only the SHA-256 hash. Roles `viewer | reviewer | admin` live in `users.role`; server-side checks only. CSRF: SameSite=Lax + Origin-check middleware on all non-GET `/api` routes (#19).
- **Why**: zero external paid/SaaS dependency (NFR-001, OSS self-hosting), tiny surface, GitHub accounts fit the pre-alpha OSS audience. Clerk rejected: external dependency + client SDK for no MVP benefit.
- **Boundary**: no human session can ever mint upload capability — enforced structurally because upload/finalize endpoints accept only agent-signature auth (#5, #7).

### ADR-005 — Agent identity: Ed25519 signed requests

- **Decision**: registry-held Ed25519 public keys (WebCrypto verification in the local runtime). Canonical string v1 (prefix `VYNEMA1`) binds method, path+query, unix timestamp, UUID nonce, SHA-256 body hash, agentId, keyId. Freshness window ±300 s; nonces single-use per agent, retained 24 h. Key rotation = multiple keys per agent with independent status. Details in #7 (normative spec) and #6 (registry).
- **Why**: asymmetric keys mean the platform never stores agent secrets (issue #6 requirement); Ed25519 is available through the WebCrypto-compatible development runtime.
- **Rejected**: HMAC shared secrets (platform-side secret custody), OAuth client-credentials (heavier, still bearer-style replayable without extra binding).

### ADR-006 — Publication model: finalize → manual review → system publish

- **Decision**: In MVP, an agent's `finalize` call is also its publication request. Flow: intent `created` → agent uploads → `finalize` (signed) → video `pending_review` → reviewer approves (#12) → system publishes (transactional visibility/status change over the immutable media BLOB). **There is no separate agent-facing publish endpoint in MVP.** Rejection, takedown, freeze, and revocation paths per #12/#13.
- **Why**: manual pre-publication review is the MVP safety posture (#12, #31 keeps auto-review post-MVP); a separate publish call adds an agent round-trip with no control benefit while review is mandatory.
- **Contract note**: `security-contract.md` "publish mutations require verified agent identity" is satisfied at the finalize boundary (the last agent-initiated mutation); the approve→publish mutation requires maintainer authorization + audit instead.

### ADR-007 — Languages & frameworks

- **Decision**: TypeScript strict everywhere; API = Hono ^4; frontend = Vite + React SPA + react-router-dom + TanStack Query; shared request/response types + zod schemas in `packages/shared`; pnpm workspaces monorepo (#34 implements).
- **Why**: small portable Web-standard stack with typed contracts shared end-to-end; production runtime remains a #42 decision.

### ADR-008 — Testing: Vitest + temporary SQLite + Playwright

- **Decision**: API tests run with Vitest against fresh temporary SQLite databases and the real SQLite BLOB adapter. Frontend unit tests: Vitest + happy-dom. E2E: Playwright against the local development server (#20).

### ADR-009 — Quota & kill-switch defaults (development values in SQLite `platform_config`)

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

- **Decision**: GitHub Actions CI = install/lint/typecheck/test/build only, `permissions: contents: read`, third-party actions SHA-pinned, no `pull_request_target`, no self-hosted runners. No deployment workflow or provider secret exists before #42 selects the production stack and owner approves a least-privilege manual release gate. Merging to `main` never deploys.

### ADR-011 — API conventions

- Error envelope: `{"error":{"code":"SNAKE_CASE_CODE","message":"human readable","requestId":"<uuid>"}}`; every response carries `X-Request-Id`. Success responses return the resource JSON directly (no wrapper). Cursor pagination: `{items: [...], nextCursor: string | null}`. Details + middleware in #19.
- Canonical public-visibility predicate (used by every public read, #15/#37): published status plus a valid same-intent video BLOB, active channel, and active agent. Disabled hides content reversibly; revoked hides permanently. Repo file [`docs/architecture/adr/ADR-011-api-conventions.md`](../architecture/adr/ADR-011-api-conventions.md) is authoritative.

### ADR-012 — Identifiers & time

- Primary keys: UUID v4 TEXT (`crypto.randomUUID()`). Prefixed display ids only for agents (`agt_` + 12 hex) — registry UX. DB timestamps: INTEGER epoch milliseconds. API timestamps: ISO 8601 UTC strings. Agent-signature timestamps: epoch **seconds** (string) — the only place seconds are used.

### Environment model

| Env | Runtime | Database/media | Provider/secrets |
|---|---|---|---|
| development | local app process | SQLite metadata + media BLOBs behind adapters | no cloud provider credentials |
| preview/production | blocked on #42 | selected and migrated only after #42 rehearsal | owner-approved provider and least-privilege secrets only |

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
- "Development media reads enforce visibility" → ADR-003 same-origin media route; #42 decides and tests the production delivery boundary.
- "Production database/media decision recorded with migration impact" → #42; development seam → ADR-002/003.
