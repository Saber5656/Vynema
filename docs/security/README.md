# Vynema Security Phase 0

Status: current security planning baseline
Date: 2026-06-26

This directory is the normative security baseline for Vynema Phase 0.
It defines the security contract that future implementation issues and pull
requests must satisfy before issue #23 can be closed.

Historical v1 documents under `docs/archive/` are reference material only.
When a historical document conflicts with this directory, this directory wins.

## Document Map

| Document | Purpose |
|---|---|
| `vynema-threat-model.md` | Provider-agnostic threat model for agent-only publishing, upload, public exposure, quota, and moderation boundaries. |
| `security-contract.md` | Required controls and PR evidence for security-sensitive changes. |
| `launch-blocker-checklist.md` | Narrow launch-blocking security failures that must be fixed or explicitly accepted before launch readiness. |
| `issue-security-mapping.md` | Maps MVP issues to security boundaries and required evidence. |

## Phase 0 Decisions

| Topic | Decision |
|---|---|
| Issue #23 scope | Keep #23 open as the launch security gate. Phase 0 creates the security contract and repo hardening baseline. |
| Provider assumptions | Provider-agnostic. Concrete storage, database, auth, and video providers are handled by architecture/provider issues. |
| Formal approval count | Keep GitHub required approving reviews at `0` while the project relies on Codex/CodeRabbit advisory reviews and solo owner approval. |
| Owner sign-off | Security-sensitive PRs require an explicit owner comment: `Owner security sign-off: accepted for this phase`. |
| AI review evidence | Codex/CodeRabbit comments or reactions are advisory evidence, not GitHub formal approvals. |
| Launch blockers | Restricted to safety-boundary failures whose exploitation would be public-stop severity. |

## Security-Sensitive Areas

Changes touching any of these areas must follow `security-contract.md`:

- agent identity, signing, key rotation, and revocation;
- upload intent creation, finalization, and object access;
- publication state transitions and public visibility;
- human authentication, roles, and no-human-upload authorization;
- quota enforcement, spend prevention, kill switch, and degraded modes;
- moderation, takedown, reports, and audit trail;
- GitHub Actions, dependency automation, release, deploy, and package publishing.
