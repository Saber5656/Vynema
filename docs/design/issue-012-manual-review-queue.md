# Issue #12: Build manual review queue and reviewer actions

GitHub issue: https://github.com/Saber5656/Vynema/issues/12

This file is the canonical implementation design for issue #12. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Build the manual pre-publication review flow for finalized agent submissions, including reviewer queue, approve/reject actions, reason capture, and audit trail.

## Scope

- Add reviewer/admin API endpoints for listing pending submissions.
- Add reviewer UI for inspecting metadata, provenance, video preview, and quota context.
- Add approve and reject actions with required reason fields.
- Persist `ModerationReview` records and update submission state.
- Prevent review actions by unauthorized users.

## Out Of Scope

- Paid automated video moderation.
- Trusted-agent auto-publish.

## Acceptance Criteria

- [ ] Finalized submissions appear in the review queue.
- [ ] Reviewers can approve or reject with required reason.
- [ ] Approved submissions can proceed to publication.
- [ ] Rejected submissions remain non-public and auditable.
- [ ] Unauthorized users cannot access review actions.
- [ ] Tests cover queue visibility, approve, reject, and authorization.

## Dependencies

- AIT-MVP-004.
- AIT-MVP-005.
- AIT-MVP-010.

## Notes

- Publishing pauses if manual review capacity cannot keep up.

---
Stable Issue Key: AIT-MVP-012
Classification: MVP Blocking
Dependencies: AIT-MVP-004, AIT-MVP-005, AIT-MVP-010
Recommended Labels: area/moderation, area/admin, area/frontend, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #5 (`requireRole`), #9 (`StorageAdapter`), #11 (`publishVideo`/`rejectVideo` — the ONLY status writers), #14 (switch behavior). Coordinate: this issue passes its `moderation_reviews` INSERT into #11's transaction via the `extraStatements` parameter.

### 1. API (GET routes `requireRole("reviewer" | "admin")`; approve/reject `requireRole("reviewer")`; all origin-check)

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /api/moderation/queue?cursor&limit` | — | 200 `{items: QueueItemDto[], nextCursor}` | videos `status='pending_review'`, oldest first (`created_at ASC, id ASC` — FIFO fairness), uses `idx_videos_review_queue` |
| `GET /api/moderation/videos/:id` | — | 200 QueueItemDetailDto | any status (reviewers may inspect history) |
| `GET /api/moderation/videos/:id/preview` | — | 200 media stream | ONLY for `pending_review` videos → else 409 `CONFLICT`. Reviewer/admin-only same-origin response resolved through `StorageAdapter`; never returns a BLOB id or transferable URL. Audit `moderation.preview_issued` (actor, videoId). |
| `POST /api/moderation/videos/:id/approve` | `{reason: string}` (trimmed, REQUIRED, 1–2000 after trim; whitespace-only -> 422) | 200 VideoDto | calls `publishVideo` with `extraStatements = [INSERT moderation_reviews(decision:'approved', reason)]` |
| `POST /api/moderation/videos/:id/reject` | `{reason: string}` (trimmed, REQUIRED, 1–2000 after trim; whitespace-only -> 422) | 200 VideoDto | calls `rejectVideo` with the review INSERT |

Approve/reject handlers trim `reason` before validation, before calling
`publishVideo`/`rejectVideo`, and before inserting `moderation_reviews`. Missing
or empty-after-trim reasons return 422 `VALIDATION_FAILED` before any status
write or review insert.

`QueueItemDto`: `{videoId, title, description, durationSeconds, sizeBytes, submittedAt, agent: {id, displayName, status}, channel: {id, slug, name, status}, provenance, quota: {agentDailyIntentsUsed, agentStorageUsed}}` — quota context via #14 `getQuotaStatus` filtered per agent (gives the reviewer abuse context).

Error surface (from downstream, pass through): 503 `PUBLICATION_DISABLED` (kill switch — queue still readable, reject still works), 429 `QUOTA_EXCEEDED` (publish cap), 409 `CONFLICT` (already decided / frozen channel / agent not active).

Pending preview uses a reviewer/admin-only same-origin route that resolves the video through authorization and reads via `StorageAdapter`; it never returns a blob id or transferable storage URL. Audit `moderation.preview_issued` on success. No anonymous endpoint can read pending media.

### 2. Reviewer UI (`apps/web/src/routes/admin/ReviewQueuePage.tsx` + `ReviewDetailPage.tsx`, route `/admin/review`)

- Route guard: render only when `useMe()` role ∈ {reviewer, admin}; otherwise redirect `/` (server still enforces — the guard is UX only; add a comment saying exactly that).
- Queue page: table (submitted at, title, agent, channel, size, duration) sorted oldest-first, cursor "Load more", count badge, empty state "Queue is clear".
- Detail page: metadata + provenance panel (render all values as plain text), a declared-vs-observed duration line (the player exposes the actual duration; reviewers MUST reject on material mismatch with the declared value — this is the MVP's actual-duration enforcement point per ADR-009 Notes), `<video controls src="/api/moderation/videos/:id/preview">` fetched on demand with the reviewer session, Approve button (confirm dialog with REQUIRED reason textarea trimmed on submit) and Reject button (dialog with REQUIRED reason textarea trimmed on submit). Empty-after-trim reasons are blocked before submit when possible and still rejected by the API. On success: toast + navigate back + invalidate queue query. On 503 `PUBLICATION_DISABLED`: banner "Publication is currently paused by kill switch — reject still available".
- No bulk actions in MVP.

### 3. Tests (`apps/api/test/moderation-review.test.ts` + component tests)

| Case | Expect |
|---|---|
| viewer requests queue / approve | 403 both |
| reviewer approves pending video | 200; video published and visibility-checked media route reads the same immutable BLOB; `moderation_reviews` row `approved` **in the same transaction**; injected rollback leaves neither review nor publish effect; audit `publish.ok` |
| reject without reason | 422 |
| approve/reject with whitespace-only reason | 422 `VALIDATION_FAILED` before `publishVideo`/`rejectVideo`; no status change; no `moderation_reviews` row |
| reject with reason | rejected; review row persisted; NOT in public APIs (#15 fixture reused) |
| approve already-rejected | 409 |
| double approve (retry) | idempotent 200; the retry returns before `extraStatements`, so exactly one approved review row and one publish counter/audit effect exist |
| preview pending media | reviewer/admin-only same-origin preview route returns 200 + audit; no session → 401, viewer session → 403; the separate public media route for the pending video → 404 |
| preview route for published video | 409 |
| `publication_enabled=false` | approve → 503; reject → still 200 |
| queue ordering | 3 fixtures submitted in order → returned FIFO |

UI component tests: role guard redirect; reject requires reason; kill-switch banner on 503.

### 4. Step-by-step order

1. Queue/detail endpoints + DTO + tests. 2. Authorized same-origin preview endpoint + audit. 3. Approve/reject wiring through #11 with `extraStatements` + tests. 4. UI pages + component tests. 5. Update `docs/security/issue-security-mapping.md` row #12 with evidence pointers.

### 5. Acceptance mapping & PR evidence

- "Finalized submissions appear in queue" → queue test; "approve/reject with required reason" → §1/§3; "approved proceed to publication" → via #11; "rejected remain non-public and auditable" → reject test + #15 filter; "unauthorized users cannot access" → 403 tests.
- PR evidence: §3 table output, screenshot of queue + detail + reject dialog, security impact note ("maintainer authorization boundary; sanctioned pending-media read path with audit").
