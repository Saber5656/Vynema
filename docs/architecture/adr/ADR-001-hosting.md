# ADR-001: Hosting - Single Cloudflare Worker

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

One Cloudflare Worker named `vynema` serves the Hono API under `/api/*` and the
built SPA through Workers Static Assets.

`wrangler.toml` uses:

```toml
run_worker_first = ["/api/*"]
not_found_handling = "single-page-application"
```

Cloudflare Pages is not used for the MVP baseline.

## Rationale

- Same-origin app and API removes first-party CORS and cross-origin cookie
  complexity.
- One deploy unit is easier to gate during pre-alpha.
- Workers Static Assets is the baseline expected by the application skeleton.
- Static asset requests stay out of Worker execution except for `/api/*`.

## Rejected Alternatives

| Alternative | Reason rejected |
|---|---|
| Cloudflare Pages + separate Worker | More release surfaces and cross-origin/cookie complexity for little MVP benefit. |
| Next.js on Pages | Heavier than a Vite SPA + JSON API and not needed for the MVP. |

## Free-Tier Facts To Recheck

Workers free tier assumptions: 100,000 requests/day and 10 ms CPU/request
average. Static asset requests are free and unlimited unless routed through the
Worker first.
