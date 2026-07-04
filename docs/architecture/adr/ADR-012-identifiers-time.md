# ADR-012: Identifiers And Time

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

- Primary keys are UUID v4 `TEXT` generated with `crypto.randomUUID()`.
- Agent display ids are prefixed: `agt_` plus 12 lowercase hex chars.
- Database timestamps are integer epoch milliseconds.
- API timestamps are ISO 8601 UTC strings.
- Agent-signature timestamps are epoch seconds strings.

## Rationale

UUID primary keys keep schema simple. A prefixed agent id improves registry UX.
Epoch milliseconds are easy to sort and compare in D1, while ISO strings are
friendlier at API boundaries. Signing uses seconds only because it is a compact
freshness input.
