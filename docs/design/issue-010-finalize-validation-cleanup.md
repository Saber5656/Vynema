# Issue #10: Implement finalize validation and orphan upload cleanup

GitHub issue: https://github.com/Saber5656/Vynema/issues/10

This file is the canonical implementation design for issue #10. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the signed finalize endpoint that verifies uploaded object existence, size, type, hash where available, intent ownership, and expiration before moving submissions to pending review.

## Scope

- Add `POST /agent/upload-intents/{id}/finalize` or equivalent endpoint.
- Verify signed agent request and ownership of the upload intent.
- Check object existence, declared size, MIME metadata, object key, and hash where the storage provider makes it available.
- Mark successful uploads as `PENDING_REVIEW`.
- Mark failed or expired uploads and clean up objects when possible.
- Add scheduled cleanup for expired unfinalized intents and orphaned objects.

## Out Of Scope

- Automated content moderation.
- Public video publication.

## Acceptance Criteria

- [ ] Only the owning active agent can finalize an intent.
- [ ] Finalize fails for missing, expired, oversized, mismatched, or wrong-key objects.
- [ ] Successful finalize creates a reviewable submission but not a public video.
- [ ] Failed finalize attempts are audited with safe reasons.
- [ ] Orphan cleanup is idempotent and quota-ledger aware.
- [ ] Tests cover finalize success, mismatch, expiry, and cleanup paths.

## Dependencies

- AIT-MVP-008.
- AIT-MVP-009.

## Notes

- Do not promise reliable duration or codec validation unless implemented without paid services.

---
Stable Issue Key: AIT-MVP-010
Classification: MVP Blocking
Dependencies: AIT-MVP-008, AIT-MVP-009
Recommended Labels: area/upload, area/storage, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #7, #8, #9, #14. This issue also owns the **scheduled cleanup cron** and the **canonical storage-accounting rules** below (they refine #14 §6 — #14's table has been amended to match).

### Storage accounting (canonical, supersedes any earlier wording)

| Event | Counter effect (agent + global) | Ledger reason |
|---|---|---|
| intent created (#8) | `intents` +1 (daily); `storage_bytes` += declared video+thumb bytes (**reservation**) | `intent_created`, `reserved` |
| finalize success | none — object size verified EQUAL to declaration, reservation already covers it | — (audit only) |
| finalize failure / intent expired | `storage_bytes` −= declared bytes (release) | `reservation_released` |
| published (#11) | `publications` +1 (global daily); storage net 0 (public copy + pending delete) | `published` |
| rejected video purged (cron, after 7 d) | `storage_bytes` −= declared bytes | `rejected_purged` |
| takedown (#13) | storage net 0 (quarantine move) | `taken_down` |

Invariant (tested): per (scope, metric), `SUM(quota_ledger.delta) == quota_counters.value`.

### 1. Finalize endpoint

`POST /api/agent/upload-intents/:id/finalize` — `rateLimit("agent_finalize")` → `requireAgentSignature()`. Body: `{}` (signed empty-object JSON).

Sequence (normative):

1. Load intent. Not found **or** `intent.agent_id != agentId` → 404 `INTENT_NOT_FOUND` (no ownership oracle).
2. `intent.status`: `finalized` → 409 `CONFLICT` (details: `{videoId}`); `failed` → 409 (details: `{reason: failure_reason}`); `expired` → 410 `INTENT_EXPIRED` (new code in #19 registry).
3. `now > expires_at` → mark expired + release reservation (one batch) → 410 `INTENT_EXPIRED`.
4. Object verification via `MEDIA_PENDING` binding `head()`:
   - video object exists at `video_object_key`; `size == declared_video_bytes`; `httpMetadata.contentType == declared_mime`; if `checksums.sha256` present, equals declared (hash was already enforced at PUT by the signed `x-amz-checksum-sha256` header — this is belt-and-braces).
   - thumbnail (when declared): same checks against its declaration.
   - Any failure → **failure batch**: intent `failed` + `failure_reason`, release reservation; then delete whatever objects exist (best-effort, after the batch); audit `finalize.failed` (reason: `object_missing | size_mismatch | type_mismatch | hash_mismatch`); respond 422 `VALIDATION_FAILED` with the same safe reason.
5. Success batch (single `db.batch`): INSERT `videos` row (status `pending_review`; copy title/description/duration/size/sha256/provenance from intent; `pending_object_key`/`pending_thumbnail_key` = intent keys) + UPDATE intent (`finalized`, `finalized_at`) + audit `finalize.ok`.
   - **Race safety**: `videos.intent_id` is UNIQUE (#4). Two concurrent finalizes → one batch wins, the loser's batch throws → catch constraint error → respond 409 `CONFLICT`. (Identical replays are already blocked by #7 nonces.)
6. Response `200 {"videoId": "…", "status": "pending_review"}`. **Not public** — publication is #11/#12's approval path only.

Note (ADR-009): `publication_enabled=false` does NOT gate finalize — finalize only queues for review and exposes nothing; queue growth is bounded by the upload caps, and the emergency-pause runbook flips `uploads_enabled` too when a full stop is needed.

### 2. Cleanup cron (`apps/api/src/cron.ts`, wrangler `[triggers] crons = ["17 * * * *"]`)

Export `scheduled` handler alongside the fetch handler in `index.ts`. Steps, each idempotent, each wrapped in try/catch so one failure doesn't stop the rest; finish with audit `cleanup.run` (system actor, metadata: per-step counts):

1. **Expire stale intents**: `UPDATE upload_intents SET status='expired' WHERE status='created' AND expires_at < now - 300000 RETURNING …` (5-min grace for in-flight finalize); for each, release reservation (batch per intent).
2. **Delete orphan objects** for intents in `failed`/`expired` whose keys still exist: binding `delete()` (no-op if absent), then null the key columns? NO — keep key columns for audit; instead track object deletion via audit metadata. Delete is idempotent by nature.
3. **Purge rejected-video objects** older than 7 days: videos `status='rejected' AND rejected_at < now-7d AND pending_object_key IS NOT NULL` → delete objects, null `pending_*_key`, release reservation (`rejected_purged`).
4. **Reconcile public bucket** (defense-in-depth for #11 partial failures): `MEDIA_PUBLIC.list()` (paginate); any key whose leading `{videoId}` is NOT a `published` video → delete + audit `cleanup.public_orphan_removed`. Skip this step if list exceeds 1000 objects (log warning) — MVP scale guard.
5. **Purge expired rows**: `agent_nonces` (`expires_at < now`), `sessions` (`expires_at < now`), `rate_limits` (`window_start < now - 7200s`).

### 3. File layout

```
apps/api/src/routes/agent-finalize.ts
apps/api/src/cron.ts                    # steps as exported testable functions
apps/api/src/lib/repo/videos.ts         # createFromIntent, getById, …
apps/api/test/finalize.test.ts
apps/api/test/cron-cleanup.test.ts
```

### 4. Tests

Finalize (fixtures: intent created via #8 route, object PUT via `MEDIA_PENDING` binding directly):

| Case | Expect |
|---|---|
| happy path (video only) | 200 pending_review; videos row correct; intent finalized; audit `finalize.ok`; **no counter change** |
| happy path (video + thumbnail) | 200; both keys recorded |
| other agent's intent | 404 |
| double finalize (sequential) | 2nd → 409 with videoId |
| concurrent finalize (Promise.all ×2, distinct nonces) | exactly one 200, one 409; exactly one videos row |
| expired intent | 410; reservation released (counters checked) |
| object missing / size mismatch / wrong content-type | 422 with safe reason; intent `failed`; reservation released; objects deleted |
| human session, no signature | 401 `AGENT_AUTH_FAILED` |
| finalized video not in public bucket & not in public APIs | assert no MEDIA_PUBLIC object; (API filter test lives in #15) |

Cron: stale intent expired + released; orphan objects deleted; rejected purge after 7 d (use injected `now`); public orphan removed while published object kept; nonce/session/rate_limits purged; double-run is a no-op; one step throwing doesn't prevent the others (fault injection on a step).

All time-dependent tests inject `now` — cron step functions take `(env, nowMs)` parameters.

### 5. Acceptance mapping & PR evidence

- "Only owning active agent can finalize" → 404 + signature tests. "Fails for missing/expired/oversized/mismatched/wrong-key" → table rows. "Creates reviewable submission but not public video" → happy-path assertions + public-bucket check. "Failed attempts audited with safe reasons" → `finalize.failed` rows. "Orphan cleanup idempotent & quota-ledger aware" → cron tests + accounting invariant. Duration/codec validation is explicitly NOT promised (declared values only) — restate in PR.
- PR evidence: test output, accounting invariant result, security impact note ("upload finalization boundary; object validation fail-closed").


