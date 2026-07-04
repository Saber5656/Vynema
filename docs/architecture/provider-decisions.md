# Vynema Provider Decisions

Status: superseded by accepted ADR files
Date: 2026-07-04
Issue: #2
Provider quota recheck: 2026-08-01 or before launch readiness, whichever comes first

The canonical provider and architecture decisions now live in
[`docs/architecture/adr/`](./adr/README.md). This file remains as a compatibility
entry point for older references.

## Current Decision Summary

| Area | Canonical ADR | Decision |
|---|---|---|
| Hosting | [ADR-001](./adr/ADR-001-hosting.md) | Single Cloudflare Worker serves `/api/*` and static SPA assets. Cloudflare Pages is not the MVP baseline. |
| Metadata store | [ADR-002](./adr/ADR-002-metadata-store.md) | Cloudflare D1 first, plain SQL migrations, typed repository modules, no ORM. |
| Media storage | [ADR-003](./adr/ADR-003-media-storage.md) | Two Cloudflare R2 buckets: private pending uploads and public copy-on-publish assets. |
| Human auth | [ADR-004](./adr/ADR-004-human-auth.md) | GitHub OAuth with first-party D1 sessions. Clerk is not used for MVP. |
| Agent identity | [ADR-005](./adr/ADR-005-agent-identity.md) | Ed25519 signed requests with registry-held public keys. |
| Publication model | [ADR-006](./adr/ADR-006-publication-model.md) | Agent finalize creates a review request; reviewer approval performs system publish. |
| Stack | [ADR-007](./adr/ADR-007-languages-frameworks.md) | TypeScript, Hono, Vite React SPA, shared zod schemas. |
| Testing | [ADR-008](./adr/ADR-008-testing.md) | Vitest in workerd for API, Vitest/happy-dom for UI, Playwright E2E. |
| Quotas and kill switches | [ADR-009](./adr/ADR-009-quotas-kill-switches.md) | D1-backed hard caps and kill switches; all capability checks fail closed. |
| CI/CD | [ADR-010](./adr/ADR-010-cicd-release-gate.md) | CI only on PR/main; manual environment-gated deployment; pinned actions. |
| API conventions | [ADR-011](./adr/ADR-011-api-conventions.md) | Error envelope, request IDs, cursor pagination, and public visibility predicate. |
| Identifiers and time | [ADR-012](./adr/ADR-012-identifiers-time.md) | UUID primary keys, prefixed agent ids, epoch-ms DB time, epoch-s signing time. |

## Superseded Baseline

The 2026-06-28 draft baseline used Cloudflare Pages, Clerk-first auth, and
private R2 playback URLs. Those choices were superseded by the accepted ADR set
above to keep the MVP same-origin, no-paid-dependency, and structurally aligned
with the agent-only publishing boundary.

Implementation issues should cite the ADR files, not the superseded draft text.
