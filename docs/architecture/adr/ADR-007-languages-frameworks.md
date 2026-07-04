# ADR-007: Languages And Frameworks

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

- TypeScript strict mode throughout the repo.
- API: Hono on Cloudflare Workers.
- Frontend: Vite React SPA with react-router-dom and TanStack Query.
- Shared request/response contracts and zod schemas in `packages/shared`.
- pnpm workspaces monorepo.

## Rationale

This is the smallest well-trodden stack for a Workers JSON API and SPA while
keeping contracts typed across API, web, and reference CLI code.
