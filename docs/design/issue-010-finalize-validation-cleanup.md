# Issue #10: Implement finalize validation and orphan upload cleanup

GitHub issue: https://github.com/Saber5656/Vynema/issues/10

This file is the canonical implementation design for issue #10. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the signed finalize endpoint that verifies same-intent/kind BLOB
existence, exact size/type/hash, bounded container structure, ownership, and
expiration before moving submissions to pending review.

## Scope

- Add `POST /agent/upload-intents/{id}/finalize` or equivalent endpoint.
- Verify signed agent request and ownership of the upload intent.
- Check media BLOB existence, declared size, MIME metadata, hash, and bounded container structure through `StorageAdapter`.
- Mark successful uploads as `PENDING_REVIEW`.
- Mark failed or expired uploads and clean up owned BLOBs when possible.
- Add a callable/manual development cleanup job for expired unfinalized intents
  and orphaned BLOBs; production scheduling is deferred to #42.

## Out Of Scope

- Automated content moderation.
- Public video publication.

## Acceptance Criteria

- [ ] Only the owning active agent can finalize an intent.
- [ ] Finalize fails for missing, expired, oversized, mismatched, or wrong-intent/kind BLOBs.
- [ ] Successful finalize creates a reviewable submission but not a public video.
- [ ] Failed finalize attempts are audited with safe reasons.
- [ ] Orphan cleanup is idempotent and quota-ledger aware.
- [ ] Tests cover finalize success, mismatch, expiry, and cleanup paths.

## Dependencies

- AIT-MVP-007.
- AIT-MVP-008.
- AIT-MVP-009.
- AIT-MVP-014.

## Notes

- Do not promise reliable duration or codec validation unless implemented without paid services.
- The uploaded container is validated by a bounded ISO-BMFF structure parse at finalize (§1a); duration stays declared-only by explicit risk acceptance.

---
Stable Issue Key: AIT-MVP-010
Classification: MVP Blocking
Dependencies: AIT-MVP-007, AIT-MVP-008, AIT-MVP-009, AIT-MVP-014
Recommended Labels: area/upload, area/storage, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #7, #8, #9, #14. This issue also owns the callable **development cleanup job** and the **canonical storage-accounting rules** below. Production scheduling is deferred to #42.

### Storage accounting (canonical, supersedes any earlier wording)

| Event | Counter effect (agent + global) | Ledger reason |
|---|---|---|
| intent created (#8) | `intents` +1 (daily); `storage_bytes` += declared video+thumb bytes (**reservation**) | `intent_created`, `reserved` |
| finalize success | none — immutable BLOB size/hash verified equal to declaration, reservation already covers it | — (audit only) |
| finalize failure / intent expired | `storage_bytes` −= declared bytes (release) | `reservation_released` |
| published (#11) | `publications` +1 (global daily); storage net 0 (visibility change over same BLOB) | `published` |
| rejected video purged (cleanup job, after 7 d) | `storage_bytes` −= declared bytes | `rejected_purged` |
| takedown (#13) | storage net 0 (visibility/quarantine state change; evidence BLOB retained) | `taken_down` |

Invariant (tested): per `(scope, scope_id, metric, period_start)`,
`SUM(quota_ledger.delta) == quota_counters.value`; daily periods use UTC day
start and storage gauges use period `0`.

### 1. Finalize endpoint

`POST /api/agent/upload-intents/:id/finalize` — coarse
`rateLimit("agent_pre_auth")` keyed by trusted peer/global request shape →
`rateLimit("agent_pre_auth_global")` → `requireAgentSignature()` →
`rateLimit("agent_any")` →
`rateLimit("agent_finalize")`, with both agent buckets keyed only by the verified
`c.get("agent").agentId`. Claimed agent headers never select an agent bucket.
Body: `{}` (signed empty-object JSON).

Sequence (normative):

1. Load intent. Not found **or** `intent.agent_id != agentId` → 404 `INTENT_NOT_FOUND` (no ownership oracle).
2. `intent.status`: `finalized` → 409 `CONFLICT` (details: `{videoId}`); `failed` → 409 (details: `{reason: failure_reason}`); `expired` → 410 `INTENT_EXPIRED` (new code in #19 registry).
3. `now > expires_at` → in one `StorageAdapter.withTransaction` using the
   same repository/adapter SQLite transaction: conditionally change
   `created → expired`, delete every owned BLOB with
   `deleteOwned(tx, {blobId, intentId, kind})`, release the reservation exactly
   once, add matching ledger rows, and audit `intent.expired`. Commit all effects
   before returning 410 `INTENT_EXPIRED`. Any missing affected row or injected
   failure rolls everything back and returns 503; never report 410 with bytes
   left unaccounted.
4. Media verification via `StorageAdapter.head()` / `readRange()`:
   - immutable video BLOB exists for the intent; stored size, MIME, and SHA-256 equal the declaration and upload capability record.
   - thumbnail (when declared): same checks against its immutable BLOB.
   - Any failure → **failure transaction**: intent `failed` + `failure_reason`,
     clear any video/media references, delete only BLOBs owned by that same
     intent, release the reservation once with its ledger row, and write
     `finalize.failed`; FK `RESTRICT` means reference clearing precedes deletion
     in the same transaction. Respond 422 with a safe reason. If the transaction
     fails, all reference/BLOB/counter/ledger/audit changes roll back.
     After such a rollback, emit a separate best-effort `finalize.failed`
     attempt audit plus a structured operational log with requestId and a safe
     reason; never emit `finalize.ok`. The intent remains retryable/cleanable,
     and return 503 rather than claiming the failure transition committed.
5. Success transaction: INSERT `videos` row (status `pending_review`; copy title/description/duration/size/sha256/provenance from intent; reference the immutable `video_blob_id`/`thumbnail_blob_id`) + UPDATE intent (`finalized`, `finalized_at`) + audit `finalize.ok`.
   - **Race safety**: `videos.intent_id` is UNIQUE (#4). Two concurrent finalizes → one batch wins, the loser's batch throws → catch constraint error → respond 409 `CONFLICT`. (Identical replays are already blocked by #7 nonces.)
6. Response `200 {"videoId": "…", "status": "pending_review"}`. **Not public** — publication is #11/#12's approval path only.

Note (ADR-009): `publication_enabled=false` does NOT gate finalize — finalize only queues for review and exposes nothing; queue growth is bounded by the upload caps, and the emergency-pause runbook flips `uploads_enabled` too when a full stop is needed.

### 1a. Uploaded container validation (bounded ISO-BMFF structure parse)

Client-declared `contentType` is not trustworthy: a non-video payload (HTML,
script, arbitrary binary) can otherwise be labelled `video/mp4` and later
served to viewers. Finalize MUST verify the stored bytes, in addition to the §1
step-4 size/hash checks. A four-byte `ftyp` marker alone is only a label and can
be prepended to arbitrary data, so it is insufficient.

Use `StorageAdapter.readRange()` to walk top-level ISO-BMFF box headers without
loading or decoding the whole video. The parser MUST:

- start at offset 0 and parse standard 32-bit sizes, 64-bit extended sizes, and
  size `0` (extends to EOF) without integer overflow;
- require every box size/end offset to be internally consistent with the
  verified object size, make forward progress, and reject truncation;
- cap work at 256 top-level boxes and 64 KiB of header bytes read; exceeding a
  cap fails closed as `container_invalid`;
- require one `ftyp` box whose major brand is in the allowlist (`isom`, `iso2`,
  `mp41`, `mp42`, `avc1`, `mp4v`, `M4V `), plus at least one `moov` and one
  non-empty `mdat` box anywhere in the top-level box sequence.

Any parse or structural failure routes to the §1 step-4 failure batch with
reason `container_invalid` and responds 422 `VALIDATION_FAILED`.
- Thumbnail (when declared): assert JPEG (`FF D8 FF`) or PNG (`89 50 4E 47`)
  magic; else failure reason `thumbnail_invalid`.

This is a bounded structural check, needs no transcoding, external binary, or
paid service, and rejects trivial prefix-spoofed containers. It does not claim
codec-level validity or malware scanning. Add
`container_invalid`/`thumbnail_invalid` to the §1 step-4 `finalize.failed`
reason set.

Duration remains DECLARED-ONLY (explicit risk acceptance): without decoding the
container we cannot verify `durationSeconds`, so a lying agent can under-declare
it. This is accepted for MVP because storage cost is bounded by the byte caps
(QT-001/QT-003) and playback-UX degradation is low-severity. It is recorded as
an accepted residual in the threat model non-blockers; do NOT promise verified
duration in product copy or agent docs.

### 2. Cleanup job (`apps/api/src/cleanup.ts`)

Export a callable development cleanup job; scheduling for a production runtime is deferred to #42. Steps are idempotent and independently guarded so one failure does not stop the rest; finish with audit `cleanup.run` (system actor, metadata: per-step counts):

1. **Expire stale intents**: conditionally change eligible `created` intents to
   `expired`, clear their owned media references, delete their BLOBs, release the
   reservation once, and add the ledger row in one transaction. This also
   covers a claimed-but-incomplete upload capability after its deadline.
2. **Delete orphan BLOBs** for failed/expired intents through the same
   ownership-checked `StorageAdapter.withTransaction`, passing its same SQLite
   transaction and `(blobId, intentId, kind)` into `deleteOwned`; require one
   affected row, preserve intent/audit metadata, and never delete by a
   caller-supplied BLOB id alone.
3. **Purge rejected-video BLOBs** older than 7 days when no retained evidence
   requirement applies; atomically clear only that video's references, delete
   its same-intent BLOBs, and release the reservation exactly once
   (`rejected_purged`). FK `RESTRICT` is intentional.
4. **Reconcile BLOB references**: delete any `media_blobs` row that has no live intent/video reference, in bounded batches, and audit `cleanup.media_orphan_removed`. Never delete the BLOB referenced by a published or retained taken-down video.
5. **Purge expired rows**: upload capabilities, `agent_nonces` (`expires_at < now`), `sessions` (`expires_at < now`), `rate_limits` (`window_start < now - 7200s`).

### 3. File layout

```
apps/api/src/routes/agent-finalize.ts
apps/api/src/cleanup.ts                 # steps as exported testable functions
apps/api/src/lib/repo/videos.ts         # createFromIntent, getById, …
apps/api/test/finalize.test.ts
apps/api/test/cleanup.test.ts
```

### 4. Tests

Finalize (fixtures: intent created via #8 route, media PUT through the development capability route):

| Case | Expect |
|---|---|
| happy path (video only) | 200 pending_review; videos row correct; intent finalized; audit `finalize.ok`; **no counter change** |
| happy path (video + thumbnail) | 200; both immutable BLOB references recorded |
| other agent's intent | 404 |
| double finalize (sequential) | 2nd → 409 with videoId |
| concurrent finalize (Promise.all ×2, distinct nonces) | exactly one 200, one 409; exactly one videos row |
| expired intent | 410; reservation released (counters checked) |
| expired intent with uploaded BLOB | status/BLOB deletion/counter/ledger/audit commit together; fault after each statement rolls all back and returns 503 |
| paused upload completion races expiry cleanup | barrier after stream; cleanup-first blocks BLOB completion, upload-first is deleted with reservation release; both orders leave no unaccounted BLOB |
| BLOB missing / size mismatch / wrong content-type / hash mismatch | 422 with safe reason; intent `failed`; reservation released; failed media deleted |
| bytes are `<html>…` but declared content-type is `video/mp4` | 422 `container_invalid` (§1a); intent `failed`; reservation released; media deleted |
| allowed `ftyp` prefix followed by arbitrary bytes, missing/truncated `moov`, or missing/empty `mdat` | 422 `container_invalid`; proves prefix spoofing cannot pass |
| valid MP4 with `moov` after `mdat` | finalize succeeds; bounded box walk handles either legal order |
| human session, no signature | 401 `AGENT_AUTH_FAILED` |
| finalized video is not public | media route denies while `pending_review`; public API filter test lives in #15 |

Cleanup: stale/claimed-incomplete intent expired + released; orphan BLOBs
deleted; rejected purge after 7 d (use injected `now`) atomically clears refs,
deletes each BLOB once, decrements counters/ledger once; cross-intent deletion is
rejected; referenced published/taken-down evidence BLOB is kept;
capability/nonce/session/rate-limit rows are purged; double-run is a no-op; an
injected transaction failure leaves refs/BLOB/counters/ledger unchanged while a
failure in one independent cleanup step does not prevent later steps.

All time-dependent tests inject `now`; cleanup functions take `(env, nowMs)` parameters.

### 5. Acceptance mapping & PR evidence

- "Only owning active agent can finalize" → 404 + signature tests. "Fails for missing/expired/oversized/mismatched media" → table rows. "Creates reviewable submission but not public video" → happy-path assertions + denied media-route check. "Failed attempts audited with safe reasons" → `finalize.failed` rows. "Orphan cleanup idempotent & quota-ledger aware" → cleanup tests + accounting invariant. Duration and codec decoding are not promised; bounded container structure validation is implemented as §1a.
- PR evidence: test output, accounting invariant result, security impact note ("upload finalization boundary; object validation fail-closed").
