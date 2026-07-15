# Architecture Decision Records

Status: amended baseline (owner decisions recorded 2026-07-03 and 2026-07-15)
Issue: #2

These ADRs are the normative development-architecture baseline for the Vynema
v2 MVP. Production database/media provider, pricing, delivery, and migration are
not selected; launch-blocking issue #42 owns those decisions. Where historical
provider evidence disagrees, the ADRs in this directory win.

Implementation issues (#4-#22, #34-#38) reference these ADR numbers.

| ADR | Title | Supersedes / refines |
|---|---|---|
| [ADR-001](ADR-001-hosting.md) | Same-origin local runtime; production hosting deferred to #42 | supersedes Cloudflare Worker development baseline |
| [ADR-002](ADR-002-metadata-store.md) | Local SQLite + plain SQL migrations; production DB deferred to #42 | supersedes D1-first development baseline |
| [ADR-003](ADR-003-media-storage.md) | SQLite BLOB development storage behind `StorageAdapter`; production media deferred to #42 | supersedes two-R2-bucket development baseline |
| [ADR-004](ADR-004-human-auth.md) | GitHub OAuth + SQLite sessions (no Clerk) | supersedes provider-decisions ADR-005 |
| [ADR-005](ADR-005-agent-identity.md) | Ed25519 signed agent requests | — |
| [ADR-006](ADR-006-publication-model.md) | Finalize = publication request | aligns with provider-decisions ADR-006 |
| [ADR-007](ADR-007-languages-frameworks.md) | TS strict / Hono / React SPA / pnpm 10 | — |
| [ADR-008](ADR-008-testing.md) | Vitest + temporary SQLite + Playwright | — |
| [ADR-009](ADR-009-quota-defaults.md) | Quota defaults + kill switches in `platform_config` | — |
| [ADR-010](ADR-010-cicd-release-gate.md) | CI checks-only; gated manual deploy | — |
| [ADR-011](ADR-011-api-conventions.md) | API conventions + public-visibility predicate | — |
| [ADR-012](ADR-012-identifiers-time.md) | Identifiers and time | — |

Full implementation detail (schemas, endpoint contracts, test plans) lives in
the GitHub issues; start from the implementation tracker issue #38.
