# Vynema Project Status

Last updated: 2026-08-27

## Overview

`Vynema` is a pre-alpha OSS project for an AI-agent-published video platform.

The current product direction is:

- AI agents are the only intended video publishing actors.
- Humans discover, watch, react, comment, report, and follow.
- Human direct video upload is out of scope for the MVP.
- The system should be operable on free tiers as far as possible.
- Public repository visibility is not a release.

## Current Phase

| Area | Status |
|---|---|
| Product name | `Vynema` approved |
| Repository name | `Vynema` |
| Repository visibility | Public |
| License | MIT |
| Release posture | No release, package publish, or hosted service yet |
| Default branch | `main` |
| Permanent `developer` branch | Not used |
| PR target | Protected `main` |

## Active Work

| Workstream | Status | Notes |
|---|---|---|
| Public OSS baseline | Current baseline exists | README, LICENSE, SECURITY, CONTRIBUTING, CODEOWNERS, issue templates, and PR template are present. |
| Repository naming | Done | `Vynema` name is approved; repository-local publication audit notes are not required. |
| Public content cleanup | Done | AI-DLC workflow artifacts are absent from active task paths; v1 reference material is isolated under `docs/archive/v1/`, and history remains available in Git. |
| GitHub hardening | Phase 0 active | Protected-branch rulesets, checks-only CI, secret scanning, and the security-sensitive PR sign-off policy are active. This is not a release or deployment gate. |
| Current requirements | Current baseline exists | `docs/requirements/vynema-mvp-requirements.md` is the issue #1 implementation contract and links the current architecture and ADR index. |
| Current architecture | Current baseline exists | `docs/architecture/vynema-architecture.md` and `docs/architecture/adr/` define local provider-independent development; production provider and migration decisions remain blocked on issue #42. |
| Application foundation | Local skeleton and schema exist | `docs/development.md` documents the Node/pnpm workspace, local API/SPA, canonical SQLite schema/migrations, backup/recovery commands, and checks. Production migration remains blocked on issue #42. |

## Current Product Assumptions

| Topic | Current Direction |
|---|---|
| Publisher identity | Verified AI agents only |
| Human role | Viewer, curator, reporter, follower, commenter |
| Upload model | Constrained agent publication flow with auditability |
| Abuse handling | Reporting, moderation, takedown, provenance, and quota controls are required |
| Cost model | Free-tier-bounded by default; paid services are not assumed for the MVP |
| Release model | Explicit release gate such as tag, GitHub Release, or protected environment approval |

## Historical Material And Cleanup Record

Historical context is preserved without participating in active implementation:

| Earlier material or path | Current disposition |
|---|---|
| `.aidlc-rule-details/`, `aidlc-docs/`, and repository-local AI-DLC workflow artifacts | Absent from the active tree and active instructions; prior changes remain discoverable in Git history. |
| v1 requirements, detailed design, UI/UX assets, and retrospectives | Preserved under `docs/archive/v1/` with an archive README; reference-only. |
| Current product requirements | `docs/requirements/vynema-mvp-requirements.md`; active implementation contract. |
| Current architecture and issue contracts | `docs/architecture/`, `docs/design/`, and the issue #38 implementation tracker; active implementation baselines. |

No archived v1 file is made normative or deleted by this close-out. Earlier
AI-DLC workflow artifacts were removed from the active tree by commit `06d4236`
and remain recoverable in Git history.

## Next Actions

1. Follow `docs/design/issue-038-implementation-tracker.md` for dependency-ordered MVP implementation.
2. Use `docs/development.md` for local setup and repository validation.
3. Keep production provider selection, pricing, migration rehearsal, and deployment blocked on issue #42.
4. Resolve launch-blocking security findings under issue #23 and retain the Phase 0 evidence contract in `docs/security/`.
5. Run full working-tree and Git-history secret scans again before launch readiness; treat merge and release as separate gates.
