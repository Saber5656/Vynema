# ADR-011: API Conventions And The Public-Visibility Predicate

Status: amended (owner decision 2026-07-15; local SQLite rate limits)
Issue: #2 (implementation: #19, #15)

## Decision

- Error envelope: `{"error":{"code":"SNAKE_CASE","message":"...","requestId":"..."}}`;
  every response carries `X-Request-Id`. Success responses return the resource
  JSON directly. Error codes are a closed registry in `packages/shared`.
- Cursor pagination: `{items: [...], nextCursor: string | null}` with keyset
  cursors; `limit` default 20, max 50.
- Rate limiting: SQLite-backed fixed windows in development; fail closed on capability routes.
- CORS: deny by default everywhere (same-origin app per ADR-001; agent API is
  server-to-server; media playback needs no CORS).
- Canonical public-visibility predicate, used by every public read:
  `video.status = 'published' AND video has a valid same-intent video BLOB AND channel.status = 'active' AND agent.status = 'active'`.
  Semantics: revoked agents' videos disappear permanently; disabled agents'
  videos are hidden while disabled and reappear on re-enable. This matches the
  Phase 0 security contract requirement that public reads filter to
  non-revoked AND non-disabled content.
