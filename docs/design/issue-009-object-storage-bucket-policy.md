# Issue #9 (#9A): Implement development media writes and capability policy

GitHub issue: https://github.com/Saber5656/Vynema/issues/9

This file is the canonical implementation design for issue #9. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the provider-independent development storage-write boundary:
`StorageAdapter`, immutable SQLite BLOB writes, and intent/kind-scoped
one-time upload capabilities. Public media reads are the split child #54
(#9B).

## Scope

- Implement provider-independent development media storage using SQLite BLOBs behind `StorageAdapter`.
- Define intent/kind-scoped, short-lived, one-time upload capabilities and immutable media ids.
- Implement the same-origin capability PUT boundary without a CORS grant.
- Bound temporary bytes, hashing work, deadlines, and capability reuse.
- Implement intent/kind-scoped adapter deletion and failed-upload temporary-file
  cleanup. #10 owns reservation-releasing lifecycle cleanup.

## Out Of Scope

- Public video/thumbnail read routes and public-read policy evidence (#54).
- Server-side transcoding.
- Production buckets, CDN/cache behavior, credentials, or paid video delivery (#42).

## Acceptance Criteria

- [ ] Agents write each object through a scoped, short-lived, one-time development capability.
- [ ] Capability claim, byte/deadline bounds, digest/MIME checks, and completion fail closed.
- [ ] Committed BLOBs are immutable and ownership-bound to one intent and media kind.
- [ ] Routes never accept a caller-selected BLOB id.
- [ ] Failed or interrupted PUTs remove private temporary files,
      ownership-scoped adapter deletion cannot cross intent/kind, and a claimed
      capability cannot become reusable. #10 owns reservation release and
      lifecycle-cleanup idempotency.
- [ ] Data/security review confirms storage ownership, same-origin restrictions, and secret-safe evidence.

## Dependencies

- #4.
- #14.
- #19.

## Notes

- The application must not store video files as frontend assets.
- [#54](https://github.com/Saber5656/Vynema/issues/54) owns #9B public media
  reads and policy evidence after #9A and #15 merge.

---
Stable Issue Key: AIT-MVP-009
Classification: MVP Blocking
Dependencies: #4, #14, #19
Recommended Labels: area/storage, area/infra, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (amended 2026-07-15)

> Normative for #9A development writes. Prerequisites: #4, #14, and #19.
> Implements the write/capability half of ADR-003. Production database, media
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
its predicate and returns whether that exact owned row was deleted; it does not
clear references or update counters, ledger rows, or audit events. #10 owns the
callable cleanup job that composes reference clearing, this deletion primitive,
reservation release, ledger updates, and audit in one lifecycle transaction.

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
  with the verified BLOB commit. A claimed-but-incomplete token is terminal;
  #10's callable cleanup job owns the later intent transition and reservation
  release. Ambiguous clients query state.
- Raw tokens, BLOB ids, media bytes, and non-public identifiers are never logged.

### Split child: #54 / #9B public media-read boundary

The following public-read requirements are canonical for
[#54](https://github.com/Saber5656/Vynema/issues/54), not part of the #9A PR.
They consume #9A's adapter/write contract and #15's visibility predicate.

#### 4. Development public-read boundary

- Same-origin routes `/media/videos/:id/video` and `/thumbnail` re-check
  `public_read_enabled` and the #15 visibility predicate on every request.
- Responses use `Cache-Control: no-store` in development and support bounded
  Range requests. `Content-Type` comes only from the verified persisted BLOB
  metadata (never a request/query value) and every media response sets
  `X-Content-Type-Options: nosniff`. Pending/rejected/taken-down/disabled/
  revoked/frozen content is always denied.
- Provider domains, public buckets, CDN/cache behavior, and hard spend stops are
  not selected here; #42 must prove equivalent boundaries before release.

### 5. Split policy evidence (`docs/security/storage-policy.md`)

#9A records capability scope/expiry/reuse rejection, no raw token in DB/logs,
digest/MIME mismatch temporary-file cleanup, claim-CAS races, byte/deadline
bounds, ambiguous retry, and intent/kind-scoped adapter deletion. #10 records
reservation-releasing lifecycle and orphan-cleanup evidence.

#54 records private-before-public, published/range reads, pending/failed/
rejected/taken-down/disabled/revoked/frozen denials, the public-read kill
switch, allowed restoration, and the absence of private storage identifiers in
public DTOs. The shared policy document must identify which Issue/PR produced
each row.

#9A tests prove capability scope/expiry/reuse rejection; no raw token in
DB/logs; mismatch, timeout, and disconnect remove the private temporary file and
leave no BLOB; `deleteOwned` cannot delete another intent/kind; fault injection
between BLOB insert and `used_at`; claim-CAS concurrency; size+1/timeout/
disconnect; and ambiguous retry. No outcome may leave committed bytes with a
reusable token or a completed token without recoverable bytes. #10 owns the
barrier race against expiry cleanup and the reservation/byte accounting
invariant in both winner orders.

#54 tests prove pending/failed/rejected/taken-down/disabled/revoked/frozen media
routes deny access; published video/thumbnail and bounded Range reads succeed;
takedown and the kill switch deny immediately; allowed restoration re-enables
access only after the shared predicate passes; and public responses never leak
private storage identifiers. Earlier Issues do not call or implement these
anonymous routes.

### 6. Step-by-step order

#9A: 1. Adapter interface. 2. SQLite BLOB implementation. 3. One-time
capability PUT route. 4. intent/kind-scoped deletion, failed-upload temporary
cleanup, and #9A policy evidence.
#54 then adds visibility-checked media routes and #9B policy evidence after
#9A and #15 merge. Keep all production provisioning blocked on #42.

### 7. Acceptance mapping & PR evidence

- #9A scoped capability and immutable writes → §§1–3 plus #9A evidence in §5.
- #54 private-before-public/read/takedown behavior → child §4 plus #9B evidence in §5.
- Provider independence → no cloud credential/config requirement and adapter-only BLOB access.
- Release migration → #42 must test staging/reconciliation and may not claim cross-provider atomicity.
- #9A PR evidence: adapter/capability, temporary-file cleanup, and scoped-deletion tests; secret scan; and security impact note.
- #54 PR evidence: media-route/visibility transition tests, policy evidence, and security impact note.
