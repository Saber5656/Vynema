# Issue #9: Implement development media StorageAdapter and capability policy

GitHub issue: https://github.com/Saber5656/Vynema/issues/9

This file is the canonical implementation design for issue #9. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement local SQLite BLOB media storage and one-time agent upload capabilities while preventing public access to unreviewed media and preserving a production migration seam.

## Scope

- Implement provider-independent development media storage using SQLite BLOBs behind `StorageAdapter`.
- Define intent/kind-scoped one-time upload capabilities and immutable media ids.
- Keep development upload/read routes same-origin with no CORS grant.
- Ensure upload capabilities cannot write unrelated intents/kinds or consume unbounded temporary resources.
- Document BLOB lifecycle, ownership, retention, and cleanup rules.

## Out Of Scope

- Server-side transcoding.
- Managed paid video delivery.

## Acceptance Criteria

- [ ] Agents upload through a scoped, short-lived, one-time development capability.
- [ ] Pending BLOBs are not publicly accessible.
- [ ] Public playback only becomes available after review and publication.
- [ ] Routes never accept a caller-selected BLOB id and always resolve ownership/visibility.
- [ ] One-time capability claim, byte/deadline bounds, and cleanup fail closed.
- [ ] Data/security review confirms storage ownership and same-origin restrictions.

## Dependencies

- AIT-MVP-002.
- AIT-MVP-008.

## Notes

- The application must not store video files as frontend assets.

---
Stable Issue Key: AIT-MVP-009
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-008
Recommended Labels: area/storage, area/infra, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (amended 2026-07-15)

> Normative for development. Implements ADR-003. Production database, media
> storage, delivery, provider, pricing, credentials, and migration are deferred
> to launch-blocking issue #42.

### 1. StorageAdapter boundary

`apps/api/src/lib/storage/adapter.ts` is the only media persistence interface:

```ts
type MediaKind = "video" | "thumbnail";
type MediaHead = { id: string; size: number; sha256: string; mime: string };

interface StorageAdapter {
  withTransaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
  commitVerifiedUpload(tx: StorageTransaction, args: { capabilityId: string; intentId: string; kind: MediaKind; tempFile: PrivateTempFile; expectedSize: number; expectedSha256: string; expectedMime: string; nowMs: number }): Promise<MediaHead>;
  head(intentId: string, kind: MediaKind): Promise<MediaHead | null>;
  readRange(blobId: string, offset: number, length: number): Promise<Uint8Array>;
  read(blobId: string, range?: { offset: number; length: number }): Promise<ReadableStream>;
  deleteOwned(tx: StorageTransaction, args: { blobId: string; intentId: string; kind: MediaKind }): Promise<boolean>;
}
```

Application routes never query `media_blobs.content` directly. This keeps the
development representation from becoming the production contract.
`StorageTransaction` and `PrivateTempFile` are opaque development types: the
SQLite adapter uses the transaction to insert the BLOB and set the already
claimed capability's `used_at` atomically. A production adapter must not claim
cross-provider atomicity; #42 must instead design staging, idempotency,
reconciliation, and cleanup that preserve the same logical invariant.
All development deletes run inside `withTransaction` and receive that same
repository/adapter SQLite transaction. `deleteOwned` includes intent and kind in
its predicate and the caller checks its affected-row result, so reference
clearing, owned-BLOB deletion, counters/ledger, and audit commit atomically.

### 2. SQLite BLOB implementation

- `SQLiteBlobStorageAdapter` stores immutable bytes in #4 `media_blobs`.
- Upload streams to a private temporary file while computing SHA-256, then
  inserts the verified bytes as one immutable SQLite BLOB transaction. The temp
  file is always removed; mismatch never commits partial bytes.
- Require exact persisted `Content-Length` before streaming, stop after
  `expectedSize + 1`, and apply a bounded request/stream deadline. An atomic
  `claimed_at IS NULL` compare-and-set runs before streaming. The first accepted
  attempt burns the token even on mismatch, timeout, or disconnect, so
  concurrent reuse cannot multiply temporary-disk or hashing work.
- `readRange` validates non-negative, overflow-safe bounds. Public reads never
  accept a blob id from the caller; they resolve video id through the canonical
  visibility predicate first.
- Publication changes only `videos.status`; it never copies or deletes media.
  Takedown hides immediately and retains the BLOB as evidence.
- Completion begins with an immediate SQLite write lock and a conditional guard
  requiring matching scope/metadata, claimed+unused+unexpired capability, and an
  owning intent still `created` and unexpired at `nowMs`. Exactly one affected
  row is required before BLOB insertion. Zero rows or any later failure rolls
  back BLOB and completion together. This serializes with #10 cleanup: a
  cleanup-first winner blocks completion; an upload-first winner is later
  deleted with its reservation release in one cleanup transaction.

### 3. One-time upload capability

- #8 creates a 256-bit token scoped to exactly one intent and media kind, valid
  for 900 seconds. Store only SHA-256(token).
- The PUT route compares token hashes in constant time, rejects expired,
  claimed, or used tokens, and obtains expected metadata only from the persisted
  capability/intent. It claims before reading, then atomically marks completion
  with the verified BLOB commit. A claimed-but-incomplete token is terminal and
  cleanup releases its intent reservation; ambiguous clients query state.
- Raw tokens, BLOB ids, media bytes, and non-public identifiers are never logged.

### 4. Development public-read boundary

- Same-origin routes `/media/videos/:id/video` and `/thumbnail` re-check
  `public_read_enabled` and the #15 visibility predicate on every request.
- Responses use `Cache-Control: no-store` in development and support bounded
  Range requests. `Content-Type` comes only from the verified persisted BLOB
  metadata (never a request/query value) and every media response sets
  `X-Content-Type-Options: nosniff`. Pending/rejected/taken-down/disabled/
  revoked/frozen content is always denied.
- Provider domains, public buckets, CDN/cache behavior, and hard spend stops are
  not selected here; #42 must prove equivalent boundaries before release.

### 5. Policy evidence (`docs/security/storage-policy.md`)

Record tests proving: capability scope/expiry/reuse rejection; no raw token in
DB/logs; mismatch leaves no BLOB; pending media route 404; published media/range
read succeeds; takedown immediately denies while evidence remains; kill switch
denies media; orphan cleanup is idempotent. Add fault injection between BLOB
insert and `used_at`, a claim-CAS concurrency barrier, size+1/timeout/disconnect
cases, and an ambiguous-retry case; no outcome may leave committed bytes with a
reusable token or a completed token without recoverable bytes.
Add a barrier after streaming but before the completion guard and race expiry
cleanup in both orders; no reservation-free BLOB may remain.

### 6. Step-by-step order

1. Adapter interface. 2. SQLite BLOB implementation and migration. 3. One-time
capability PUT route. 4. visibility-checked media routes. 5. cleanup and policy
evidence. 6. Keep all production provisioning blocked on #42.

### 7. Acceptance mapping & PR evidence

- Scoped short-lived capability → §3 tests.
- Private before publication and takedown → §4 visibility matrix.
- Provider independence → no cloud credential/config requirement and adapter-only
  BLOB access.
- Release migration → #42 must test a staged production adapter/double and may
  not model an external object store plus database as one atomic transaction.
- PR evidence: adapter/capability/media-route tests, migration test, secret scan,
  and security impact note.
