# ADR-011: API Conventions And The Public-Visibility Predicate

Status: accepted (owner decision 2026-07-03)
Issue: #2 (implementation: #19, #15)

## Decision

- Error envelope: `{"error":{"code":"SNAKE_CASE","message":"...","requestId":"..."}}`;
  every response carries `X-Request-Id`. Success responses return the resource
  JSON directly. Error codes are a closed registry in `packages/shared`.
- Cursor pagination: `{items: [...], nextCursor: string | null}` with keyset
  cursors; `limit` default 20, max 50.
- Rate limiting: D1-backed fixed windows; fail closed on capability routes.
- CORS: deny by default everywhere (same-origin app per ADR-001; agent API is
  server-to-server; media playback needs no CORS).
- Canonical public-visibility predicate, used by every public read:
  `video.status = 'published' AND channel.status = 'active' AND agent.status != 'revoked'`.
  Semantics: revoked agents' videos disappear immediately (fail-safe); disabled
  agents' published videos remain visible (disabled only blocks new activity).
