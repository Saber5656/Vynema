# ADR-010: CI Is Checks-Only; Deploy Is A Gated Manual Workflow

Status: amended (owner decision 2026-07-15; deployment blocked on #42)
Issue: #2 (implementation: #21)

## Decision

- `ci.yml` (pull_request + push main): install/lint/typecheck/test/build only.
  `permissions: contents: read`, third-party actions pinned to full commit
  SHAs, no `pull_request_target`, no self-hosted runners, no secrets.
- No deploy workflow or cloud environment secret is added before #42 selects the
  production runtime/database/media providers and records owner approval. #42
  must define the later manual deployment gate with least privilege. Merging to
  `main` never deploys.
- No package publishing, marketplace, token-writing, or `id-token: write`
  automation without an explicit release-readiness review.

## Rationale

Implements the security contract's Repository Automation rules and the
"CI is not release" invariant from the threat model.
