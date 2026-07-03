# ADR-010: CI Is Checks-Only; Deploy Is A Gated Manual Workflow

Status: accepted (owner decision 2026-07-03)
Issue: #2 (implementation: #21)

## Decision

- `ci.yml` (pull_request + push main): install/lint/typecheck/test/build only.
  `permissions: contents: read`, third-party actions pinned to full commit
  SHAs, no `pull_request_target`, no self-hosted runners, no secrets.
- `deploy.yml`: `workflow_dispatch` only, gated by GitHub Environments
  (`preview`, `production`; production requires owner approval). Runs D1
  migrations then `wrangler deploy`. Merging to `main` never deploys.
- No package publishing, marketplace, token-writing, or `id-token: write`
  automation without an explicit release-readiness review.

## Rationale

Implements the security contract's Repository Automation rules and the
"CI is not release" invariant from the threat model.
