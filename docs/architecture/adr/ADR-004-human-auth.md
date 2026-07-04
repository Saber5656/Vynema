# ADR-004: Human Auth - GitHub OAuth + D1 Sessions

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

Implement GitHub OAuth authorization-code flow in the Worker using plain HTTP
calls. Store human sessions in D1:

- Cookie: `vynema_session`, random 256-bit token, `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/`.
- Database stores only `SHA-256(token)`.
- User roles: `viewer`, `reviewer`, `admin`.
- Server-side role checks are mandatory.
- CSRF posture: SameSite=Lax plus Origin-check middleware on non-GET `/api`
  routes.

Clerk is not used for the MVP.

## Rationale

GitHub accounts fit the pre-alpha OSS audience. A small first-party OAuth/session
surface avoids a paid/SaaS dependency, avoids a client SDK, and keeps the
self-hosting story simpler.

## Boundary

Human sessions can browse and interact with public content, but they cannot mint
upload or publish capability. Agent upload/finalize endpoints authorize only
agent signatures.
