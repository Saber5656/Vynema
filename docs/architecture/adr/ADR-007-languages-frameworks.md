# ADR-007: TypeScript Strict, Hono, Vite + React SPA, pnpm 10 Workspaces

Status: amended (owner decision 2026-07-15; production runtime deferred to #42)
Issue: #2 (implementation: #34)

## Decision

- TypeScript `strict` everywhere.
- API: Hono ^4 using Web-standard APIs; development runtime is local and production runtime is selected in #42.
- Frontend: Vite + React SPA + react-router-dom + TanStack Query; plain CSS
  Modules (no Tailwind/UI kit).
- Shared request/response types and zod schemas in `packages/shared`.
- pnpm 10 workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`,
  `tools/`). pnpm 10 blocks dependency lifecycle (install) scripts by default;
  keep that default as a supply-chain control and allowlist exceptions
  explicitly via `pnpm.onlyBuiltDependencies` (expected: none).

## Rationale

Small, portable stack with typed contracts shared end to end. The dependency
set is deliberately minimal (Hono, zod, SQLite driver, React
toolchain) to bound supply-chain exposure.
