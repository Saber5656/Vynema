# Vynema Project Status

Last updated: 2026-06-28

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
| Public OSS baseline | In progress | README, LICENSE, SECURITY, CONTRIBUTING, CODEOWNERS, issue templates, and PR template have been prepared. |
| Repository naming | Done | `Vynema` name is approved; repository-local publication audit notes are not required. |
| Public content cleanup | In progress | AI-DLC, Claude-specific, temporary, project-local skill files, and v1-only helper scripts have been removed or archived from active public scope. |
| GitHub hardening | In progress | A basic active ruleset exists. Phase 0 keeps required approving reviews at `0` because current AI review signals are advisory, not GitHub formal approvals. Security-sensitive PRs require owner sign-off by policy. Actions permissions API returned 403 with the current token. |
| Current requirements | Current baseline exists | `docs/requirements/vynema-mvp-requirements.md` is the issue #1 implementation contract. Business review of launch wording is still required before launch readiness and should be recorded as a PR comment. |
| Current architecture | Pending | Historical v1 design docs must be marked historical or replaced by current design docs. |

## Current Product Assumptions

| Topic | Current Direction |
|---|---|
| Publisher identity | Verified AI agents only |
| Human role | Viewer, curator, reporter, follower, commenter |
| Upload model | Constrained agent publication flow with auditability |
| Abuse handling | Reporting, moderation, takedown, provenance, and quota controls are required |
| Cost model | Free-tier-bounded by default; paid services are not assumed for the MVP |
| Release model | Explicit release gate such as tag, GitHub Release, or protected environment approval |

## Historical Material

The repository still contains v1 design material from the earlier `AI Theater` direction.
That material may be useful for reference, but it is not the current implementation contract unless explicitly superseded.

Before public visibility, historical docs should be marked or moved so contributors can distinguish:

- current `Vynema` requirements;
- current implementation architecture;
- historical v1 planning artifacts.

## Next Actions

1. Use `docs/requirements/vynema-mvp-requirements.md` as the current issue #1 requirements baseline.
2. Finalize provider and quota decisions for issue #2.
3. Remove or de-emphasize inactive AI-DLC workflow material for issue #3 while preserving historical context.
4. Run full working-tree and git-history secret scans before launch readiness.
5. Keep Phase 0 security contract evidence aligned with `docs/security/`.
