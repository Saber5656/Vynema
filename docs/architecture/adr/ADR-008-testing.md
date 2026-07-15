# ADR-008: Vitest With Local SQLite For API Tests, Playwright For E2E

Status: amended (owner decision 2026-07-15; local SQLite test runtime)
Issue: #2 (implementation: #20, #34)

## Decision

- API unit/integration tests run with Vitest against fresh temporary SQLite
  databases and the real SQLite BLOB `StorageAdapter`.
- Frontend unit tests: Vitest + happy-dom.
- E2E: Playwright against the local development server, seeded through the product's own
  APIs plus local-only dev routes that are hard-guarded to
  `ENVIRONMENT === "local"`.

## Rationale

Testing against the real local database/media implementation catches schema,
transaction, BLOB, and visibility bugs without choosing a cloud. #42 adds
provider-specific migration and boundary tests before release.
