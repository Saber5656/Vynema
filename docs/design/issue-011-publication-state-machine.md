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
- Store AI-generated labels, agent/provenance metadata, storage key, playback URL or resolver, and moderation state.
- Ensure rejected or pending submissions never appear in public APIs.
- Add idempotency for repeated approve/publish actions.

## Out Of Scope

- Viewer UI.
- Agent upload request signing.

## Acceptance Criteria

- [ ] Pending and rejected submissions are not visible in public feed/search/channel APIs.
- [ ] Approved submissions create exactly one public video asset.
- [ ] Public video records include required AI/provenance labels where safe.
- [ ] Publication state transitions are audited.
- [ ] Idempotent retry does not create duplicate public videos.
- [ ] Tests prove public visibility only after approval.

## Dependencies

- AIT-MVP-004.
- AIT-MVP-010.
- AIT-MVP-012.

## Notes

- This issue should be reviewed together with moderation and public metadata APIs.

---
Stable Issue Key: AIT-MVP-011
Classification: MVP Blocking
Dependencies: AIT-MVP-004, AIT-MVP-010, AIT-MVP-012
Recommended Labels: area/publication, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #9 (storage adapter `copyObject`), #10 (videos exist in `pending_review`), #14 (publish quota/switch). Consumed by #12 (review endpoints call this module) and #13 (takedown transition). Implements ADR-006.

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
  rejected: [],           // terminal (purge handled by #10 cron)
  taken_down: [],         // terminal in MVP (no re-publish)
};
```

`assertTransition(from, to)` throws `TransitionError` otherwise. Repos/routes NEVER write `videos.status` directly — grep-able rule: only `publication.ts` contains `SET status` on videos (enforce with a lint-style test: grep the src tree).

### 2. `publishVideo(env, {videoId, reviewerUserId, requestId, extraStatements?})` (called by #12 approve; NO agent-facing publish endpoint exists in MVP — ADR-006)

`extraStatements?: D1PreparedStatement[]` is appended to the step-4 commit batch — #12 passes its `moderation_reviews` INSERT here so the review record and the state change commit atomically. `rejectVideo` takes the same parameter.

Sequence:

1. Load video. `status == "published"` → **return `{alreadyPublished: true, video}` (idempotent success — approval retries are safe).** Else `assertTransition(status, "published")` → 409 `CONFLICT` if illegal.
2. Guards (all fail-closed): `publication_enabled` config true else 503 `PUBLICATION_DISABLED`; `checkPublishAllowed` (#14, per-agent AND global daily caps) else 429 `QUOTA_EXCEEDED`; channel `active` else 409 `CONFLICT` (details `channel_frozen`); agent `active` else 409 (details `agent_not_active`) — video stays `pending_review`.
3. Storage copies (via #9 adapter, S3 CopyObject server-side): `pending/{…}/video.mp4` → public `{videoId}/video.mp4`; thumbnail likewise when present. Copy failures → audit `publish.failed`, respond 503, **no state change** (copies are idempotent overwrites; retry by re-approving).
4. Commit batch (single `db.batch`): video → `published`, `published_at = now`, `public_object_key`/`public_thumbnail_key` set, `pending_*_key` nulled + `buildPublishedStatements()` (#14) + audit `publish.ok` (actor: reviewer user id).
5. After commit (best-effort): delete pending objects (storage net-0 per #10 accounting). Failure → log; #10 cron step 2 will retire them.
6. Return the published video.

Partial-failure notes (why this order is safe): copy-then-commit means a crash after step 3 leaves an unreferenced public object at an unguessable UUID key — #10 cron step 4 (public-bucket reconcile) removes it; a crash after step 4 leaves pending objects — cron step 2 removes them. No ordering leaves a public object for a non-published video past one cron cycle.

### 3. `rejectVideo(env, {videoId, reviewerUserId, reason})` (called by #12)

`assertTransition(status, "rejected")`; batch: video → `rejected`, `rejected_at`; audit `publish.rejected`. Objects stay in pending bucket 7 days (evidence), then #10 cron purges. Never touches the public bucket.

### 4. `takedownVideo(env, {videoId, actorUserId, reason})` (called by #13; mechanics here so state stays in one module)

`assertTransition("published","taken_down")`; storage: copy public `{videoId}/video.mp4` → pending `quarantine/{videoId}/video.mp4` (evidence), then delete public objects; then, when a Cloudflare custom domain fronts the public bucket, purge the video/thumbnail URLs via the Cloudflare purge-by-URL API (zone-scoped token as Worker secret `CF_CACHE_PURGE_TOKEN` + `CF_ZONE_ID`, added to #34's env list; on pre-alpha r2.dev, skip with a logged warning). Public objects carry `cache-control: public, max-age=3600` (#9) so even a failed purge is bounded to 1 h; batch: status `taken_down`, `taken_down_at`, `takedown_reason`, null public keys, set `pending_object_key = quarantine key`; audit `takedown.ok`. Public URL must 404 afterwards (test).

### 5. Provenance & disclosure invariants (FR-008/FR-009)

Published rows keep `ai_generated = 1` and `provenance_json` (from intent) — #15 exposes `aiGenerated: true`, agent id/name, and provenance in public DTOs. Test: published video's DTO includes these fields.

### 6. File layout

```
apps/api/src/lib/publication.ts
apps/api/test/publication.test.ts
```

(Uses #9's StorageAdapter test double with local R2 bindings; KB-sized fixture objects.)

### 7. Tests

| Case | Expect |
|---|---|
| approve pending video | published; public objects exist (binding get); pending objects deleted; counters `publications` +1; audit `publish.ok` |
| re-approve published (retry) | idempotent success; **no** second counter increment; no duplicate copies side effects |
| approve rejected / takedown pending (illegal transitions, full matrix) | 409, state unchanged — table-driven over all from→to pairs vs `ALLOWED` |
| `publication_enabled=false` | 503, stays pending |
| global daily publications at cap | 429, stays pending |
| frozen channel / disabled agent / revoked agent | 409, stays pending |
| copy failure (adapter double throws) | 503, stays pending, no partial DB state, audit `publish.failed` |
| commit-crash simulation (throw between copy and batch) | public orphan exists → run #10 cron step 4 → orphan removed |
| takedown published | public objects gone (404 via binding), quarantine object exists, status `taken_down` |
| reject | rejected; pending objects still present (until cron 7 d) |
| status write choke point | grep test: `SET status` on videos appears only in `publication.ts` |
| provenance | published DTO fields per §5 |

### 8. Acceptance mapping & PR evidence

- "Pending/rejected never in public APIs" → #15's filter + §7 public-bucket assertions here. "Approved creates exactly one public asset" → UNIQUE intent_id + idempotent publish test. "AI/provenance labels" → §5. "Transitions audited" → `publish.ok/rejected/failed`, `takedown.ok`. "Idempotent retry no duplicates" → re-approve test.
- PR evidence: transition-matrix test output, orphan-reconcile test output, security impact note ("public/private transition boundary").



