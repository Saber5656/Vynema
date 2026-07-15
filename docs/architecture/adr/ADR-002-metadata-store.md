# ADR-002: Local SQLite With Plain SQL Migrations, No ORM

Status: amended (owner decision 2026-07-15)
Supersedes: the 2026-07-03 D1-first provider decision
Issue: #2 (schema implementation: #4; production decision: #42)

## Decision

- Development uses a repository-owned local SQLite database. It stores both
  application metadata and development media BLOBs through `StorageAdapter`.
- Migrations are plain SQL files in `apps/api/migrations/` and run locally.
- Data access goes through hand-written typed repository modules using prepared
  statements. No ORM.
- No production database provider is selected. Launch-blocking issue #42 owns
  provider/pricing selection and the rehearsed export/import migration.

## Rationale

- Local SQLite keeps development offline, reproducible, and free of cloud
  accounts, provider credentials, or pricing assumptions.
- Plain SQL keeps the schema reviewable in PRs and avoids ORM version churn;
  repository functions are individually testable.
- The repository and storage adapter layers are the migration seams; SQL dialect
  and media transfer changes remain isolated when #42 selects production.

## Constraints

- Full-text search uses SQLite FTS5 in development (see issue #15).
- SQLite BLOB storage is development-only; it is not evidence that a production
  database should serve media.
- Release cannot provision or migrate production data until #42 is approved.
