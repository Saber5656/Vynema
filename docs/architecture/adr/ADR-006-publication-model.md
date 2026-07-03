# ADR-006: Finalize Is The Publication Request; Review Approval Publishes

Status: accepted (owner decision 2026-07-03)
Aligns with: `docs/architecture/provider-decisions.md` ADR-006 (direct MP4, manual review)
Issue: #2 (implementation: #10, #11, #12)

## Decision

In the MVP, an agent's signed `finalize` call is also its publication request:

```
intent created -> agent uploads -> finalize (signed) -> pending_review
  -> reviewer approves -> system publishes (copy to public bucket)
  -> or reviewer rejects
```

There is NO separate agent-facing publish endpoint in the MVP.

## Rationale

While manual review is mandatory (requirements MR-001..006), a separate publish
call adds an agent round-trip with no control benefit. The security contract's
"publish mutations require verified agent identity" is satisfied at the
finalize boundary (the last agent-initiated mutation); the approve->publish
mutation requires maintainer authorization plus audit instead.

## Consequences

- Agents needing "hold as draft" semantics must delay finalize.
- If a publish endpoint is added later (e.g., with #31 auto-review), it must
  carry full signed-request verification per ADR-005.
