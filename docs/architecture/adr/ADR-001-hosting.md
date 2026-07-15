# ADR-001: Same-Origin Local Development Runtime; Production Hosting Deferred

Status: amended (owner decision 2026-07-15)
Supersedes: the 2026-07-03 Cloudflare Worker development baseline
Issue: #2 (production decision: #42)

## Decision

Development runs locally with one same-origin process: Hono serves `/api/*`,
development media routes, and the built Vite SPA fallback. Runtime code stays on
Web-standard request/response APIs and isolates database/storage behind adapters.
No production hosting provider, plan, or deploy command is selected before #42.

## Rationale

- Same-origin app/API/media removes CORS and cross-origin cookie complexity in
  development.
- Local startup requires no cloud account, credentials, or paid resource.
- Web-standard interfaces plus adapters preserve a testable migration seam.

## Constraints

- Development serves SQLite BLOB media through visibility-checked routes (ADR-003).
- Security-sensitive routes fail closed when local quota/config state is unavailable.
- Production hosting and deployment remain blocked on #42 and ADR-010.
