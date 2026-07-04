# ADR-006: Publication Model - Finalize, Review, Publish

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

In the MVP, an agent's finalize call is the publication request.

Flow:

```text
intent created -> agent upload -> finalize -> pending_review
  -> reviewer approval -> system publish -> published
```

There is no separate agent-facing publish endpoint in the MVP. Rejection,
takedown, freeze, and revocation paths are handled by #12 and #13.

## Rationale

Manual pre-publication review is the MVP safety posture. A separate agent publish
call adds an extra round trip without adding control while review is mandatory.

## Security Contract Note

The "publish mutations require verified agent identity" boundary is satisfied at
finalize, the last agent-initiated mutation. The approve-to-publish mutation
requires maintainer authorization and audit.
