# ADR-001: Single Cloudflare Worker For API And Static Assets

Status: accepted (owner decision 2026-07-03)
Supersedes: `docs/architecture/provider-decisions.md` ADR-001 (Cloudflare Pages); absorbs its ADR-002 (Workers for APIs)
Issue: #2

## Decision

One Cloudflare Worker named `vynema` serves both the Hono API under `/api/*` and
the built SPA via Workers Static Assets:

- `run_worker_first = ["/api/*"]`
- `not_found_handling = "single-page-application"`

Cloudflare Pages is NOT used. Pages + separate Worker remains a documented
alternative, not the MVP standard.

## Rationale

- Same-origin app and API removes CORS and cross-origin cookie complexity
  entirely for the human web app (sessions stay `SameSite=Lax`, no `SameSite=None`).
- One deploy unit and one `wrangler.toml` instead of two release surfaces.
- Workers Static Assets is Cloudflare's current recommendation for new projects;
  static asset requests are free and unlimited, same as Pages.
- Workers Free: 100,000 requests/day, 10 ms CPU per invocation. Static asset
  serving does not consume the request quota.

## Constraints

- Workers must not proxy video bytes (see ADR-003).
- Security-sensitive routes fail closed if the daily request limit is exceeded.
- Production deployment remains behind the explicit release gate (ADR-010).
