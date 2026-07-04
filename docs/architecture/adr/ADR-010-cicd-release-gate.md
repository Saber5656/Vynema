# ADR-010: CI/CD And Release Gate

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

GitHub Actions CI performs install, lint, typecheck, tests, and build only.

Repository automation requirements:

- Top-level workflow permissions are least-privilege.
- No `pull_request_target` for public fork code.
- No self-hosted runners for public fork PRs.
- Third-party actions are pinned to full-length commit SHAs.
- Secret scanning is a required branch-protection check once branch protection is
  configured.

Deployment is a separate `workflow_dispatch` workflow, constrained to the
protected `main` ref and gated by GitHub Environments (`preview`, `production`).
Production requires owner approval. Merging to `main` never deploys by itself.

## Rationale

Build and test automation should support review without becoming a release,
package-publish, marketplace-publish, or token-writing path before explicit
release readiness.
