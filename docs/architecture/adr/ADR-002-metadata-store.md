# ADR-002: Cloudflare D1 With Plain SQL Migrations, No ORM

Status: accepted (owner decision 2026-07-03)
Refines: `docs/architecture/provider-decisions.md` ADR-003 (D1 first, Supabase fallback)
Issue: #2 (schema implementation: #4)

## Decision

- D1 databases `vynema-db` (production) and `vynema-db-preview` (preview).
- Migrations are plain SQL files in `apps/api/migrations/`, applied with
  `wrangler d1 migrations apply`. Forward-only; recovery via D1 Time Travel.
- Data access goes through hand-written typed repository modules using prepared
  statements. No ORM.

## Rationale

- D1 Free (5 GB, 5M reads/day, 100k writes/day) covers pre-alpha scale; local
  development works with zero setup via miniflare.
- Plain SQL keeps the schema reviewable in PRs and avoids ORM version churn;
  repository functions are individually testable.
- The repository layer is the migration seam if the Supabase fallback in
  provider-decisions.md ADR-003 is ever triggered (SQL dialect changes stay
  inside `apps/api/src/lib/repo/`).

## Constraints

- Full-text search uses SQLite FTS5 inside D1 (see issue #15).
- Application quotas must keep usage below D1 free limits (ADR-009).
