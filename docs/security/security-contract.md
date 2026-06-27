# Vynema Security Contract

Status: Phase 0 baseline
Date: 2026-06-26

This contract applies to every issue and pull request that touches
security-sensitive areas listed in `docs/security/README.md`.

## Pull Request Evidence

Security-sensitive PRs must include:

| Evidence | Requirement |
|---|---|
| Security impact note | State which security boundary is affected and what risk changes. |
| Boundary test evidence | Provide local or CI evidence for the affected boundary, or explicitly write `N/A` with a reason. |
| AI review evidence | Link or summarize Codex/CodeRabbit review evidence when available. Treat it as advisory, not formal approval. |
| Owner sign-off | Before merge, owner must comment: `Owner security sign-off: accepted for this phase`. |

GitHub required approving reviews remain at `0` in Phase 0 because current
AI review signals do not reliably create GitHub formal approving reviews.
This is an operational constraint, not a relaxation of security review.

## Required Controls By Boundary

### Agent Identity And Signing

- Each agent has a stable identity and explicit scopes.
- Signed requests bind method, path, timestamp, nonce, body hash, and agent id.
- Nonces are single-use inside a bounded replay window.
- Key rotation and revocation are represented in the agent registry.
- Revoked agents cannot obtain new upload or publish capability.

### Upload Intent And Finalization

- Upload intents are object-specific, short-lived, and non-transferable where provider support permits.
- Intent creation requires verified agent identity, allowed scope, freshness, revocation status, and quota availability.
- Upload finalization requires signed agent authorization, freshness, nonce/body-hash binding where applicable, and allowed scope.
- Human sessions cannot create upload intents or finalize uploads.
- Upload size, duration, object type, and target path are constrained.

### Object Access And Publication

- Uploaded objects are private by default.
- Public URLs or public object ACLs are created only after publication checks pass.
- Pending, rejected, failed, revoked, or disabled content is not public.
- Public APIs filter by published, non-revoked, non-disabled, and otherwise public state.
- Publish mutations require verified agent identity, allowed scope, freshness, nonce/body-hash binding, and revocation status.

### Human Auth And Roles

- Authenticated humans can interact with public content but cannot upload or publish videos.
- Maintainer-only actions require maintainer authorization, not only authentication.
- Role checks are enforced server-side.

### Quota, Cost, And Kill Switch

- Quota checks fail closed.
- Upload, publication, storage, bandwidth, and provider spend controls are enforced before capability creation.
- Kill switches can stop upload and publication without code deployment.
- Degraded modes must not bypass security checks.

### Moderation And Audit

- Report, takedown, unpublish, revocation, and maintainer override actions are auditable.
- Audit records include actor, action, target, timestamp, and outcome.
- Audit logging must not expose secrets or private media URLs.

### Repository Automation

- Workflows use least-privilege `permissions:`.
- `pull_request_target` is forbidden unless a dedicated threat review documents the trust boundary.
- Self-hosted runners are forbidden for public fork PRs.
- Third-party actions are pinned to full-length commit SHAs.
- Release, deploy, package publishing, marketplace publishing, and token-writing workflows require explicit release readiness approval.
- `id-token: write` is treated as release-capable and must not be added casually.
- Workflow caches must not cross untrusted fork and trusted release boundaries without a documented mitigation.

## Acceptance Rules

| Situation | Required Outcome |
|---|---|
| Launch-blocking failure exists | Fix it or record explicit owner risk acceptance before launch readiness, including owner identity, sign-off comment, affected boundary, reason, compensating controls, and expiration date or follow-up issue. |
| Test cannot be written yet | Record the missing implementation dependency and add an issue mapping entry. |
| Provider-specific control is unknown | Keep the provider-agnostic control and add a provider appendix later. |
| AI review approves by comment or reaction | Record as advisory evidence only. |
