# Vynema Architecture Decision Records

Status: accepted MVP baseline
Date: 2026-07-03
Issue: #2
Deciders: owner
Provider quota recheck: 2026-08-01 or before launch readiness, whichever comes first

These ADRs are the canonical architecture baseline for the Vynema MVP.
Implementation design files under `docs/design/` reference these records by ADR
number.

| ADR | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-hosting.md) | Hosting: single Cloudflare Worker | accepted |
| [ADR-002](ADR-002-metadata-store.md) | Metadata store: Cloudflare D1, no ORM | accepted |
| [ADR-003](ADR-003-media-storage.md) | Media storage: two R2 buckets | accepted |
| [ADR-004](ADR-004-human-auth.md) | Human auth: GitHub OAuth + D1 sessions | accepted |
| [ADR-005](ADR-005-agent-identity.md) | Agent identity: Ed25519 signed requests | accepted |
| [ADR-006](ADR-006-publication-model.md) | Publication model: finalize -> review -> publish | accepted |
| [ADR-007](ADR-007-languages-frameworks.md) | Languages and frameworks | accepted |
| [ADR-008](ADR-008-testing.md) | Testing stack | accepted |
| [ADR-009](ADR-009-quotas-kill-switches.md) | Quotas and kill switches | accepted |
| [ADR-010](ADR-010-cicd-release-gate.md) | CI/CD and release gate | accepted |
| [ADR-011](ADR-011-api-conventions.md) | API conventions | accepted |
| [ADR-012](ADR-012-identifiers-time.md) | Identifiers and time | accepted |
