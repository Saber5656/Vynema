# Architecture Decision Records

Status: accepted baseline (owner decisions recorded 2026-07-03)
Issue: #2

These ADRs are the normative implementation-architecture baseline for the
Vynema v2 MVP. They extend `../provider-decisions.md` (2026-06-28 provider
evidence); where the two disagree, the ADRs in this directory win — superseded
sections in `provider-decisions.md` are marked in place.

Implementation issues (#4-#22, #34-#38) reference these ADR numbers.

| ADR | Title | Supersedes / refines |
|---|---|---|
| [ADR-001](ADR-001-hosting.md) | Single Worker for API + static assets | supersedes provider-decisions ADR-001 (Pages), absorbs ADR-002 |
| [ADR-002](ADR-002-metadata-store.md) | D1 + plain SQL migrations, no ORM | refines provider-decisions ADR-003 |
| [ADR-003](ADR-003-media-storage.md) | Two R2 buckets, copy-on-publish, public-bucket playback | refines provider-decisions ADR-004 |
| [ADR-004](ADR-004-human-auth.md) | GitHub OAuth + D1 sessions (no Clerk) | supersedes provider-decisions ADR-005 |
| [ADR-005](ADR-005-agent-identity.md) | Ed25519 signed agent requests | — |
| [ADR-006](ADR-006-publication-model.md) | Finalize = publication request | aligns with provider-decisions ADR-006 |
| [ADR-007](ADR-007-languages-frameworks.md) | TS strict / Hono / React SPA / pnpm 10 | — |
| [ADR-008](ADR-008-testing.md) | vitest-pool-workers + Playwright | — |
| [ADR-009](ADR-009-quota-defaults.md) | Quota defaults + kill switches in `platform_config` | — |
| [ADR-010](ADR-010-cicd-release-gate.md) | CI checks-only; gated manual deploy | — |
| [ADR-011](ADR-011-api-conventions.md) | API conventions + public-visibility predicate | — |
| [ADR-012](ADR-012-identifiers-time.md) | Identifiers and time | — |

Full implementation detail (schemas, endpoint contracts, test plans) lives in
the GitHub issues; start from the implementation tracker issue #38.
