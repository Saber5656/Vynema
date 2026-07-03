# ADR-008: Vitest Pool Workers For API Tests, Playwright For E2E

Status: accepted (owner decision 2026-07-03)
Issue: #2 (implementation: #20, #34)

## Decision

- API unit/integration tests run inside workerd via
  `@cloudflare/vitest-pool-workers` with real local D1/R2 bindings (no
  hand-rolled platform mocks).
- Frontend unit tests: Vitest + happy-dom.
- E2E: Playwright against `wrangler dev`, seeded through the product's own
  APIs plus local-only dev routes that are hard-guarded to
  `ENVIRONMENT === "local"`.

## Rationale

Testing against the real Workers runtime and real (local) D1/R2 semantics
catches platform-behavior bugs that mocks hide, and it is the officially
supported Cloudflare path.
