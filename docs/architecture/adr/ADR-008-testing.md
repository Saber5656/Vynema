# ADR-008: Testing

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

- API tests run inside workerd using `@cloudflare/vitest-pool-workers` with real
  local D1/R2 bindings.
- Frontend unit tests use Vitest with happy-dom.
- E2E tests use Playwright against `wrangler dev`.

## Rationale

The most security-sensitive behavior depends on Workers, D1, and R2 semantics.
Testing the API inside workerd reduces drift from production behavior and avoids
hand-rolled mocks for platform APIs.
