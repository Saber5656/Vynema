# Issue #11: Implement publication state machine and public video asset creation

GitHub issue: https://github.com/Saber5656/Vynema/issues/11

This file is the canonical implementation design for issue #11. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the controlled state machine that turns finalized agent submissions into public video assets only after approval.

## Scope

- Define upload and publication states across intent, review, video asset, and moderation records.
- Create public `VideoAsset` records only from approved finalized intents.
- Store AI-generated labels, agent/provenance metadata, the same-intent immutable BLOB reference, and moderation state. #15 consumes the publication state for public metadata; #54 consumes it for anonymous media-route access.
- Persist rejected and pending submissions in non-public states; #15 and #54 own the corresponding public metadata and anonymous media-route suppression.
- Add idempotency for repeated approve/publish actions.

## Out Of Scope

- Viewer UI.
- Agent upload request signing.

## Acceptance Criteria

- [ ] Pending and rejected submissions remain in non-public states consumed by #15's public predicate and #54's anonymous media-route boundary.
- [ ] Approved submissions create exactly one public video asset.
- [ ] Public video records include required AI/provenance labels where safe.
- [ ] Publication state transitions are audited.
- [ ] Idempotent retry does not create duplicate public videos.
- [ ] Tests prove only approval creates the published state, immutable BLOB reference, publication counters, and safe metadata; #15 and #54 own public HTTP visibility assertions.

## Dependencies

- #4.
- #9 (storage-write #9A).
- #10.
- #14.

## Notes

- This issue should be reviewed together with moderation and public metadata APIs. It owns state transitions and stored references, while #15 owns public metadata predicates and #54 owns anonymous media-route transition assertions.

---
Stable Issue Key: AIT-MVP-011
Classification: MVP Blocking
Dependencies: #4, #9 (#9A), #10, #14
Recommended Labels: area/publication, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #9A/#9 (`StorageAdapter` writes), #10 (videos exist in `pending_review`), and #14 (publish quota/switch). This issue precedes and is consumed by #12; #13 also consumes it. Implements ADR-006.

### 1. State machine (`apps/api/src/lib/publication.ts` — the ONLY module allowed to change `videos.status`)

```
pending_review ──approve (#12)──▶ published ──takedown (#13)──▶ taken_down
      │
      └──reject (#12)──▶ rejected
```

```ts
type VideoStatus = "pending_review" | "published" | "rejected" | "taken_down";
const ALLOWED: Record<string, VideoStatus[]> = {
  pending_review: ["published", "rejected"],
  published: ["taken_down"],
  rejected: [],           // terminal (purge handled by #10 cleanup job)
  taken_down: [],         // terminal in MVP (no re-publish)
};
```

`assertTransition(from, to)` throws `TransitionError` otherwise. Repos/routes NEVER write `videos.status` directly — grep-able rule: only `publication.ts` contains `SET status` on videos (enforce with a lint-style test: grep the src tree).

### 1a. Concurrency control (single-writer via compare-and-swap)

`assertTransition` guards legality but NOT concurrency. A load-then-write
pattern lets two concurrent legal transitions from the same predecessor (for
example approve vs reject, double-approve, or double-takedown) both act on a
stale read and duplicate effects. Every `videos.status` mutation MUST therefore be
a conditional update that re-asserts the expected `from` state, and the caller
MUST check the affected-row count:

```sql
UPDATE videos SET status = :to, <timestamps/keys set here> WHERE id = :id AND status = :from;
```

Because the status graph is acyclic and forward-only (`pending_review` →
`published` → `taken_down`; `pending_review` → `rejected`), a status-only guard
is sufficient — there is no ABA cycle, so no `version` column is needed. If
`changes == 0`, another writer already moved the row: re-load before deciding
the result. A publish loser that now sees `published` returns the idempotent
already-published result; any other mismatched state returns `409 CONFLICT`.
Publish and takedown use distinct recovery rules. A lost CAS never deletes or
mutates the shared media BLOB. The §2 publish transaction rolls back its own
quota/audit writes with the failed status transition. The §4 takedown
transaction leaves the winning visibility state and media intact; any later
physical-retention cleanup is separately retryable and is never invoked from a
lost CAS path.

### 2. `publishVideo(env, {videoId, reviewerUserId, requestId, extraStatements?})` (called by #12 approve; NO agent-facing publish endpoint exists in MVP — ADR-006)

`extraStatements?: PreparedStatement[]` is part of the publication transaction —
#12 passes its `moderation_reviews` INSERT here so the review record and the
state change commit atomically. For approval, execute that INSERT immediately
before the conditional status UPDATE: the #4 schema rejects a transition to
`published` unless an approved review already exists in the same transaction.
`rejectVideo` takes the same parameter.

Sequence:

1. Load video. `status == "published"` → **return `{alreadyPublished: true, video}` (idempotent success — approval retries are safe).** Else `assertTransition(status, "published")` → 409 `CONFLICT` if illegal.
2. Guards (all fail-closed): a same-intent `video_blob_id` exists, has
   `kind='video'`, and is readable through `StorageAdapter`; otherwise 409
   `CONFLICT` and publication cannot begin. Then require
   `publication_enabled`, quota capacity, active channel, and active agent —
   video stays `pending_review` on any failure.
3. In one local SQLite transaction, insert the approved review supplied by #12,
   conditionally update the video from `pending_review` to `published`, set
   `published_at`, increment the per-agent and global publication counters only
   when their caps permit it, append the ledger rows, and write `publish.ok`.
   The immutable `video_blob_id` and
   `thumbnail_blob_id` do not change. If a cap guard fails, roll back and return
   429. If the status CAS affects zero rows, roll back all quota/audit writes,
   re-load, and apply the §1a idempotent/409 rule.
4. Return the published video. The committed status transition and immutable
   BLOB references are this Issue's output. #15's shared predicate and #54's
   anonymous media route consume that state; #11 neither implements nor calls
   the anonymous route.

Partial-failure notes: status, counters, ledger, and audit commit together in
the development SQLite transaction. Media bytes are immutable and are not
copied or deleted during publish, so a losing approval cannot erase the winner's
asset. Production storage/copy/delivery behavior is intentionally deferred to
launch-blocking issue #42 and must preserve this logical ownership invariant.
If the transaction or CAS fails, `publish.ok` is absent. After rollback, write a
separate best-effort `publish.failed` audit containing only requestId, videoId,
and a safe reason; it is an attempt record and must never be interpreted as a
committed transition. Failure to write that diagnostic audit does not change or
retry the rolled-back publication transaction.

### 3. `rejectVideo(env, {videoId, reviewerUserId, reason})` (called by #12)

`assertTransition(status, "rejected")`; transaction: video → `rejected`, `rejected_at`; audit `publish.rejected`. The media BLOB is retained for 7 days as review evidence, then #10 cleanup removes it through the adapter. Rejection never creates public visibility.

### 4. `takedownVideo(env, {videoId, actorUserId, reason})` (called by #13; mechanics here so state stays in one module)

Conditionally update `published` → `taken_down` in one SQLite transaction with
`taken_down_at`, `takedown_reason`, and `takedown.ok`. The media BLOB remains
immutable evidence; #54 proves that the anonymous media route denies it
immediately after the canonical visibility predicate stops matching. If the
CAS affects zero rows,
roll back, re-load, and return the winner's state/409 without deleting media.
Any later evidence-retention purge is an idempotent #10 cleanup job. Production
cache purge or provider-side deletion is a release-readiness concern owned by
#42 and must fail closed before that environment can claim takedown readiness.

### 5. Provenance & disclosure invariants (FR-008/FR-009)

Published rows keep `ai_generated = 1` and `provenance_json` (from intent) — #15 exposes `aiGenerated: true`, agent id/name, and provenance in public DTOs. Test: published video's DTO includes these fields.

### 6. File layout

```
apps/api/src/lib/publication.ts
apps/api/test/publication.test.ts
```

(Uses #9's SQLite BLOB `StorageAdapter`; fixture videos are structurally valid,
small ISO-BMFF files.)

### 7. Tests

| Case | Expect |
|---|---|
| approve pending video | published; adapter can read the same immutable BLOB; counters `publications` +1; audit `publish.ok` |
| re-approve published (retry) | idempotent success; **no** second counter increment; no duplicate media side effects |
| approve rejected / takedown pending (illegal transitions, full matrix) | 409, state unchanged — table-driven over all from→to pairs vs `ALLOWED` |
| concurrent double-approve (barrier immediately before status CAS, distinct reviewers) | one publishes; the CAS loser reloads `published` and returns 200 idempotent success; exactly one approved review row, one `publish.ok`, and `publications` counter +1; the BLOB remains present/readable |
| concurrent approve + reject from pending (barrier immediately before status CAS) | exactly one legal transition/audit/review effect; final status is `published` or `rejected`; original evidence BLOB remains adapter-readable |
| concurrent double-takedown from published (barrier immediately before status CAS) | one logical takedown/audit effect; final status `taken_down`; original evidence BLOB remains |
| approve commit followed by takedown load | both transitions succeed in order; final `taken_down`; publication counter +1; one publish and one takedown audit; BLOB retained |
| `publication_enabled=false` | 503, stays pending |
| global daily publications at cap | 429, stays pending |
| frozen channel / disabled agent / revoked agent | 409, stays pending |
| transaction failure | rollback: stays pending, counters/ledger unchanged, media BLOB intact, no `publish.ok`; separate post-rollback `publish.failed` attempt audit uses a safe reason |
| missing/cross-intent/wrong-kind video BLOB | publish guard/schema rejects; no status/counter/ledger/audit success effect |
| takedown published | status `taken_down`; evidence BLOB remains retained; #54 owns immediate anonymous route denial |
| reject | rejected; evidence BLOB retained until the 7-day cleanup policy |
| status write choke point | grep test: `SET status` on videos appears only in `publication.ts` |
| provenance | published DTO fields per §5 |

### 8. Acceptance mapping & PR evidence

- "Pending/rejected remain non-public states" → #15 predicate contract + §7 state assertions; #54 owns the anonymous route transition matrix. "Approved creates exactly one logical public asset" → UNIQUE intent_id + immutable BLOB + idempotent publish test. "AI/provenance labels" → §5. "Transitions audited" → `publish.ok/rejected/failed`, `takedown.ok`. "Idempotent retry no duplicates" → re-approve test.
- PR evidence: transition-matrix test output, orphan-reconcile test output, security impact note ("public/private transition boundary").
