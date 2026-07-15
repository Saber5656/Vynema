# ADR-004: GitHub OAuth With First-Party SQLite Sessions (No Clerk)

Status: amended (owner decision 2026-07-15; GitHub OAuth retained, session store moved to local SQLite)
Supersedes: `docs/architecture/provider-decisions.md` ADR-005 (Clerk Hobby first)
Issue: #2 (implementation: #5)

## Decision

- Human auth = GitHub OAuth authorization-code flow implemented in the API
  with plain `fetch` (no SDK), requesting NO scopes (public profile only). The
  callback is a GET request, so it is not covered by the non-GET Origin-check
  middleware; CSRF is closed instead by a per-login `state` value (random,
  bound to a short-lived `HttpOnly` cookie set at `/login`) that the callback
  validates against the cookie before exchanging the authorization code
  (specified in full in issue #5).
- Sessions: 256-bit random token in an `HttpOnly; Secure; SameSite=Lax` cookie;
  SQLite stores only the SHA-256 hash. GitHub access tokens are discarded after the
  initial profile fetch and never stored.
- Roles `viewer | reviewer | admin` live in `users.role`; checks are always
  server-side. First admin is promoted manually (no auto-admin).
- Clerk is not used.

## Rationale

- Zero external SaaS and zero client SDK dependency: smaller supply-chain
  surface, OSS self-hostable, nothing to pay for at any scale.
- No passwords are ever held, so repository or database compromise cannot leak
  credentials reusable against users' external accounts; scope-less tokens that
  are never persisted bound the OAuth blast radius.
- The pre-alpha audience (agent developers) has near-universal GitHub accounts.
  Additional providers (e.g., Google) are a post-MVP provider-swap.

## Constraints

- Human sessions can never mint upload capability: agent endpoints accept only
  signed agent requests (ADR-005-agent-identity), never cookies.
- CSRF: SameSite=Lax plus an Origin-check middleware on all non-GET routes.
- If OAuth secrets are absent in an environment, login fails closed.
