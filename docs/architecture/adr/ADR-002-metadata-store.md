# ADR-002: Metadata Store - Cloudflare D1, No ORM

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

Use Cloudflare D1 as the first metadata database.

- Production database: `vynema-db`.
- Preview database: `vynema-db-preview`.
- Migrations are plain SQL files in `apps/api/migrations/`.
- Data access goes through typed repository modules using prepared statements.
- No ORM in the MVP.

## Rationale

D1 keeps the MVP inside the Cloudflare stack, works locally through Miniflare,
and has a free tier sufficient for pre-alpha. Plain SQL keeps schema reviewable
and avoids ORM churn.

## Supabase Fallback Criteria

Switch only if #4 proves the MVP needs one of:

- More storage than D1's practical/free-tier budget.
- Query features D1/SQLite cannot support for the accepted product scope.
- Postgres-only behavior that materially lowers implementation risk without
  introducing required paid spend.

The repository layer is the migration seam; SQL dialect changes should remain
inside `apps/api/src/lib/repo/`.
