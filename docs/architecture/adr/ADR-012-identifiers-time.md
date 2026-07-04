# ADR-012: Identifiers And Time Representation

Status: accepted (owner decision 2026-07-03)
Issue: #2 (implementation: #4)

## Decision

- Primary keys: UUID v4 TEXT (`crypto.randomUUID()`); agents use display ids
  `agt_` + 12 hex.
- Database timestamps: INTEGER epoch milliseconds.
- API timestamps: ISO 8601 UTC strings.
- Agent-signature timestamps: unix epoch SECONDS as a decimal string — the only
  seconds-based timestamp in the system (see #7).
