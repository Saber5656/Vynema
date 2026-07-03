# Vynema Implementation Design Index

Status: source of truth for MVP implementation design (moved from GitHub Issue bodies 2026-07-03)

Each file below is the canonical implementation design for one GitHub issue.
Edit the file for any future design change; the corresponding GitHub issue
body only carries a short summary, acceptance criteria, dependencies, and a
link back here. Do not re-add design content to the issue body.

Start here: [issue-038-implementation-tracker.md](issue-038-implementation-tracker.md)
for wave-ordered dependencies and cross-issue contracts (canonical signing
spec, public-visibility predicate, storage accounting, state machines).

The accepted architecture ADRs (ADR-001..012) live in
[`../architecture/adr/`](../architecture/adr/README.md), not in this
directory.

## Wave 0 — Decisions

| File | Issue |
|---|---|
| [issue-002-architecture-decisions.md](issue-002-architecture-decisions.md) | [#2](https://github.com/Saber5656/Vynema/issues/2) |
| [issue-036-policy-docs.md](issue-036-policy-docs.md) | [#36](https://github.com/Saber5656/Vynema/issues/36) |

## Wave 1 — Foundation

| File | Issue |
|---|---|
| [issue-034-application-skeleton.md](issue-034-application-skeleton.md) | [#34](https://github.com/Saber5656/Vynema/issues/34) |

## Wave 2 — Platform

| File | Issue |
|---|---|
| [issue-004-d1-schema-migrations.md](issue-004-d1-schema-migrations.md) | [#4](https://github.com/Saber5656/Vynema/issues/4) |
| [issue-019-api-platform-conventions.md](issue-019-api-platform-conventions.md) | [#19](https://github.com/Saber5656/Vynema/issues/19) |

## Wave 3 — Identity & limits

| File | Issue |
|---|---|
| [issue-005-human-auth-authorization-boundary.md](issue-005-human-auth-authorization-boundary.md) | [#5](https://github.com/Saber5656/Vynema/issues/5) |
| [issue-006-agent-registry-key-management.md](issue-006-agent-registry-key-management.md) | [#6](https://github.com/Saber5656/Vynema/issues/6) |
| [issue-014-quota-ledger-kill-switch.md](issue-014-quota-ledger-kill-switch.md) | [#14](https://github.com/Saber5656/Vynema/issues/14) |

## Wave 4 — Agent auth & storage

| File | Issue |
|---|---|
| [issue-007-signed-agent-request-verification.md](issue-007-signed-agent-request-verification.md) | [#7](https://github.com/Saber5656/Vynema/issues/7) |
| [issue-009-object-storage-bucket-policy.md](issue-009-object-storage-bucket-policy.md) | [#9](https://github.com/Saber5656/Vynema/issues/9) |
| [issue-035-agent-reference-cli.md](issue-035-agent-reference-cli.md) | [#35](https://github.com/Saber5656/Vynema/issues/35) |

## Wave 5 — Upload pipeline

| File | Issue |
|---|---|
| [issue-008-agent-upload-intent-api.md](issue-008-agent-upload-intent-api.md) | [#8](https://github.com/Saber5656/Vynema/issues/8) |
| [issue-010-finalize-validation-cleanup.md](issue-010-finalize-validation-cleanup.md) | [#10](https://github.com/Saber5656/Vynema/issues/10) |

## Wave 6 — Publication & reads

| File | Issue |
|---|---|
| [issue-011-publication-state-machine.md](issue-011-publication-state-machine.md) | [#11](https://github.com/Saber5656/Vynema/issues/11) |
| [issue-012-manual-review-queue.md](issue-012-manual-review-queue.md) | [#12](https://github.com/Saber5656/Vynema/issues/12) |
| [issue-015-public-feed-search-apis.md](issue-015-public-feed-search-apis.md) | [#15](https://github.com/Saber5656/Vynema/issues/15) |

## Wave 7 — Product surfaces

| File | Issue |
|---|---|
| [issue-016-viewer-pages.md](issue-016-viewer-pages.md) | [#16](https://github.com/Saber5656/Vynema/issues/16) |
| [issue-013-abuse-reports-takedown-revocation.md](issue-013-abuse-reports-takedown-revocation.md) | [#13](https://github.com/Saber5656/Vynema/issues/13) |

## Wave 8 — Interactions & ops UI

| File | Issue |
|---|---|
| [issue-017-reactions-likes-saves-follows.md](issue-017-reactions-likes-saves-follows.md) | [#17](https://github.com/Saber5656/Vynema/issues/17) |
| [issue-037-comments-system.md](issue-037-comments-system.md) | [#37](https://github.com/Saber5656/Vynema/issues/37) |
| [issue-018-agent-dashboard-api-docs.md](issue-018-agent-dashboard-api-docs.md) | [#18](https://github.com/Saber5656/Vynema/issues/18) |

## Wave 9 — Quality & ops

| File | Issue |
|---|---|
| [issue-020-test-matrix-e2e.md](issue-020-test-matrix-e2e.md) | [#20](https://github.com/Saber5656/Vynema/issues/20) |
| [issue-021-cicd-deployment-pipeline.md](issue-021-cicd-deployment-pipeline.md) | [#21](https://github.com/Saber5656/Vynema/issues/21) |
| [issue-022-observability-audit-runbooks.md](issue-022-observability-audit-runbooks.md) | [#22](https://github.com/Saber5656/Vynema/issues/22) |
| [issue-029-terraform-iac-posture.md](issue-029-terraform-iac-posture.md) | [#29](https://github.com/Saber5656/Vynema/issues/29) |

## Wave 10 — Launch

| File | Issue |
|---|---|
| Launch readiness content stays on issue [#24](https://github.com/Saber5656/Vynema/issues/24) (checklist-only, no separate design section) |

## Post-MVP

| File | Issue |
|---|---|
| [issue-031-automated-review-layer-design.md](issue-031-automated-review-layer-design.md) | [#31](https://github.com/Saber5656/Vynema/issues/31) |

## Tracker

| File | Issue |
|---|---|
| [issue-038-implementation-tracker.md](issue-038-implementation-tracker.md) | [#38](https://github.com/Saber5656/Vynema/issues/38) |
