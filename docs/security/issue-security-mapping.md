# Issue Security Mapping

Status: Phase 0 baseline
Date: 2026-06-26

This map connects MVP issues to the security boundaries in
`security-contract.md`. It is not a full implementation plan.

## Core Dependency Issues

| Issue | Security Boundary | Required Evidence |
|---|---|---|
| #5 Human auth, roles, and no-human-upload authorization | Human auth and no-human-upload | Tests proving human roles cannot create upload intents, upload media, or publish videos. |
| #6 Agent registry and key management | Agent identity, scopes, rotation, revocation | Tests or fixtures for active, rotated, and revoked agent keys. |
| #7 Signed agent request verification and nonce replay protection | Signing, freshness, body hash, nonce, replay resistance | Verification tests for missing/invalid signatures, stale timestamps, reused nonce, wrong body hash, and revoked agents. |
| #8 Agent upload-intent API | Upload capability creation | Tests for signed agent authorization, scope, revocation, quota, object-specific target, short lifetime, and human denial. |
| #9 Development media capability and `StorageAdapter` policy | Media privacy and scoped writes | Storage policy evidence that pending BLOBs are private, one-time writes are bounded, and public reads re-check visibility. |
| #10 Finalize validation and orphan upload cleanup | Object validation and cleanup | Tests for signed agent finalization authorization, invalid metadata, oversized objects, missing objects, orphan cleanup, and non-public failed states. |
| #11 Publication state machine and public video asset creation | Public/private transition | State-machine and signed publish authorization tests proving only approved published content becomes public. |
| #12 Manual review queue and reviewer actions | Moderation state and maintainer authorization | Tests for maintainer-only review actions and no accidental public exposure before approval. |
| #13 Abuse reports, takedown, revocation, and audit trail | Moderation, revocation, and audit | Tests proving takedown/revocation removes public exposure and creates audit records. |
| #14 Quota ledger, kill switch, and degraded modes | Quota, cost, and fail-closed behavior | Boundary tests for quota exceeded, kill switch enabled, and degraded provider states. |
| #15 Public feed, search, channel, and metadata APIs | Public API filtering | Tests proving pending, failed, rejected, revoked, disabled, and otherwise non-public states are excluded from public reads. |
| #16 Viewer pages | Human public surfaces | UI/data tests proving pages use public-only APIs and do not expose private URLs. |
| #17 Comments, likes, saves, follows, and reports | Human interaction authorization and abuse surfaces | Auth and rate-limit tests for write actions; report workflow evidence. |
| #18 Agent dashboard and API documentation | Developer experience and secret handling | Docs avoid secrets, clarify signing, scopes, replay protection, and no-human-upload boundary. |
| #19 API errors, request IDs, rate limits, and CORS | API hardening and observability | Tests for safe error shape, request ids, CORS allowlist behavior, and boundary rate limits. |

## Supporting Issues

| Issue | Security Relevance |
|---|---|
| #20 Automated test matrix | Should include launch-blocker boundary tests from `launch-blocker-checklist.md`. |
| #21 CI/CD and deployment pipeline | Must follow repository automation rules in `security-contract.md`. |
| #22 Observability, audit logs, and runbooks | Supplies operational evidence and incident response readiness. |
| #23 Security hardening and threat model review | Remains open until launch-blocking findings are fixed or explicitly accepted. |
| #24 Launch readiness | Consumes #23 evidence for final go/no-go. |

## PR Labeling Guidance

Labels help triage, but compliance does not depend on perfect labels. If a PR
touches a security-sensitive area, the PR must include the evidence required by
`security-contract.md` even if it is not labeled.
