# ADR-011: API Conventions

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

Error responses use:

```json
{"error":{"code":"SNAKE_CASE_CODE","message":"human readable","requestId":"<uuid>"}}
```

Every response carries `X-Request-Id`. Successful responses return the resource
JSON directly. Cursor pagination uses:

```json
{"items":[],"nextCursor":null}
```

The canonical public-visibility predicate is:

```sql
v.status = 'published' AND c.status = 'active' AND a.status = 'active'
```

Disabled agents' published videos are hidden while disabled and reappear on
re-enable. Revoked agents' videos disappear permanently. Pending, rejected, and
taken-down videos never appear in public reads.

## Rationale

A shared error envelope and visibility predicate keep client behavior,
moderation, revocation, and degraded-mode tests consistent across public APIs.
