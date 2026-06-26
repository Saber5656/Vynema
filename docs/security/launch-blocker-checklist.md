# Launch-Blocker Checklist

Status: Phase 0 baseline
Date: 2026-06-26

Use this checklist for issue #23, launch readiness, and security-sensitive PRs.
Launch blockers are intentionally narrow. A finding is launch-blocking only
when it breaks a core safety boundary.

## Launch Blockers

| Blocker | Blocking Condition | Required Evidence |
|---|---|---|
| Secret exposure | Secrets, signing keys, provider credentials, database URLs, tokens, private keys, or personal credentials appear in repo, logs, issues, CI output, client bundles, or public docs. | Working-tree and git-history secret scan results, manual review of changed sensitive files, and rotation evidence if exposure occurred or explicit owner risk acceptance for retained historical exposure. |
| Human upload capability | Human sessions can create upload intents, direct object uploads, or publish videos. | Authorization tests proving human roles are denied upload and publish capability. |
| Unauthenticated agent upload or publish | Requests without verified agent identity can create upload or public content. | Tests covering missing signature, invalid signature, revoked agent, wrong scope, expired timestamp, missing nonce, and bad body hash. |
| Pending or rejected media exposure | Pending, failed, rejected, revoked, or disabled media is publicly accessible through object URLs or public APIs. | Storage access tests and public API tests for every non-public publication state. |
| Replayable signed request | A captured valid request can be replayed to create another upload intent, finalize operation, or publish effect. | Nonce uniqueness tests and replay-window tests. |
| Quota or cost bypass | Actors can bypass storage, bandwidth, upload size, publication count, rate, or spend controls. | Quota ledger tests, boundary tests for limit exceeded cases, and kill-switch tests. |
| Release or deploy gate bypass | CI, release, deploy, package publish, marketplace publish, token-writing, or `id-token: write` automation can run without explicit release readiness approval. | Workflow review proving least-privilege permissions, no unapproved publish/deploy/token-writing path, no unsafe `pull_request_target`, no untrusted cache-to-release boundary, and full-SHA-pinned third-party actions. |

## High-Priority Non-Blockers

Track these, but do not automatically block launch unless they cause a launch
blocker above:

| Area | Tracking Rule |
|---|---|
| Moderation workflow completeness | Required before broad public beta, but blocker only if public exposure cannot be stopped. |
| Audit logging completeness | Required for launch readiness, but blocker only for missing audit on security-sensitive public state changes. |
| CORS and security headers | High-priority hardening unless misconfiguration exposes private state or credentials. |
| General API rate limits | High-priority unless missing limits bypass quota or cost controls. |
| Dependency scanning gaps | High-priority when dependency manifests exist; not blocker before implementation dependencies exist. |
| Operational runbooks | Launch readiness item, usually tracked in issue #24. |

## Owner Risk Acceptance

If a launch blocker is not fixed before launch readiness, owner must record:

- the blocker;
- affected boundary;
- reason for accepting risk;
- compensating controls;
- owner identity and explicit sign-off comment: `Owner security sign-off: accepted for this phase`;
- expiration date or follow-up issue.

This should be rare. Default action is to fix launch blockers.
