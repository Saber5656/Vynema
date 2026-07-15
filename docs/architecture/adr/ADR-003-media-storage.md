# ADR-003: SQLite BLOB Development Storage Behind StorageAdapter

Status: amended (owner decision 2026-07-15)
Supersedes: the 2026-07-03 two-R2-bucket development baseline
Issue: #2 (implementation: #8, #9, #10, #11; production decision: #42)

## Decision

- Development stores video and thumbnail bytes as immutable SQLite BLOBs in
  `media_blobs`. Only `StorageAdapter` accesses BLOB rows.
- Agent upload uses 15-minute, intent/kind-scoped, one-time capabilities. The DB
  stores only token hashes and commits a BLOB only after exact size/MIME/SHA-256
  verification.
- Publication does not duplicate media. `videos.status` and the canonical
  visibility predicate control whether the same immutable BLOB is readable.
- Development media routes re-check visibility and `public_read_enabled` for
  every request. Takedown hides immediately while retaining evidence.
- Production database, object/media storage, delivery, caching, provider, and
  pricing are deliberately undecided until launch-blocking issue #42.

## Rationale

One local persistence boundary makes development reproducible without secrets or
cloud resources. Application-level visibility remains structurally testable,
while `StorageAdapter` prevents the local BLOB representation from becoming the
production contract.

## Takedown and future delivery

- Development responses use `Cache-Control: no-store`; the next request observes
  the committed takedown state.
- #42 must prove the selected production cache/delivery path cannot continue
  serving taken-down content and must document exact purge/disable evidence.

## Constraints

- Development storage caps are application configuration, enforced before intent
  creation (ADR-009), not claims about a provider free tier.
- BLOB ids, token hashes, and intent ids never appear in public DTOs or logs.
- Rejected/orphan BLOB cleanup is DB-aware and idempotent (#10).
