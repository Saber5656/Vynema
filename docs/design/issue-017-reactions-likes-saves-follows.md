# Issue #17: Build comments, likes, saves, follows, and reporting flows

GitHub issue: https://github.com/Saber5656/Vynema/issues/17

This file is the canonical implementation design for issue #17. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement signed-in viewer interactions for comments, likes, saves, follows, and reports with rate limits, moderation visibility rules, and free-tier-safe behavior.

## Scope

- Add API and UI for comments on public videos.
- Add like/unlike, save/unsave, and follow/unfollow actions.
- Add report entry points integrated with abuse report records.
- Enforce auth, rate limits, visibility checks, and quota-safe response sizes.
- Add moderation states for hidden or removed comments.

## Out Of Scope

- Realtime comments.
- Infinite social graph recommendations.

## Acceptance Criteria

- [ ] Signed-in viewers can comment, like, save, follow, and report.
- [ ] Signed-out viewers see appropriate prompts and cannot mutate state.
- [ ] Interactions are blocked for taken-down or non-public videos.
- [ ] Rate limits and abuse protections exist for mutating endpoints.
- [ ] Comment moderation state is respected in UI and API.
- [ ] Tests cover interaction success, auth failures, and visibility failures.

## Dependencies

- AIT-MVP-005.
- AIT-MVP-013.
- AIT-MVP-015.
- AIT-MVP-016.

## Notes

- Polling or manual refresh is acceptable for MVP.

---
Stable Issue Key: AIT-MVP-017
Classification: MVP Blocking
Dependencies: AIT-MVP-005, AIT-MVP-013, AIT-MVP-015, AIT-MVP-016
Recommended Labels: area/frontend, area/backend, area/viewer, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260



---

## Scope Update (2026-07-02)

**Comments moved to #37** (own moderation lifecycle → separate deliverable). This issue now covers: **likes, saves, follows, and the report entry points** (report backend/API is #13; this issue mounts its dialog in the viewer UI). Everything else in the original scope stands.

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #5 (auth), #15 (visibility predicate + detail counts), #19 (rate limits), #13 (ReportDialog), #16 (pages to mount into).

### 1. API contract (all session auth `requireUser()` + origin-check + `rateLimit("reaction", 60s, 30)`)

| Method & path | Success | Notes |
|---|---|---|
| `PUT /api/videos/:id/like` | `200 {liked: true, likeCount}` | idempotent: repeat → same result |
| `DELETE /api/videos/:id/like` | `200 {liked: false, likeCount}` | idempotent: absent → same result |
| `PUT /api/videos/:id/save` | `200 {saved: true}` | |
| `DELETE /api/videos/:id/save` | `200 {saved: false}` | |
| `PUT /api/channels/:id/follow` | `200 {following: true, followCount}` | channel must be publicly visible (active + agent not revoked) else 404 |
| `DELETE /api/channels/:id/follow` | `200 {following: false, followCount}` | |
| `GET /api/videos/:id/me` | `200 {liked, saved}` | auth; `Cache-Control: no-store` (the PUBLIC detail endpoint stays user-independent and cacheable — this is why viewer state is a separate endpoint) |
| `GET /api/me/saves?cursor&limit` | `{items: VideoSummaryDto[], nextCursor}` | **filtered by the #15 public predicate** — a saved video that was taken down or hidden disappears from the list (row may remain in DB; never expose non-public state) |
| `GET /api/me/follows?cursor&limit` | `{items: ChannelDto[], nextCursor}` | same filtering rule for channels |

Target-visibility rule (normative): every mutation checks the #15 predicate first; non-public target → 404 (`VIDEO_NOT_FOUND` / `NOT_FOUND`), never 403 — no existence oracle. Signed-out → 401 `AUTH_REQUIRED`.

Implementation: `INSERT OR IGNORE` / `DELETE` on the composite-PK tables (`likes`, `saves`, `follows` from #4); counts via `COUNT(*)` after mutation (acceptable at MVP scale). No audit events for reactions (not security-sensitive; volume noise) — reports ARE audited (#13).

### 2. UI

- `apps/web/src/features/reactions/`: `LikeButton` (heart + count; optimistic toggle via TanStack `onMutate`/rollback), `SaveButton` (bookmark), `FollowButton` (on `ChannelHeader`, label Follow/Following + count).
- Signed-out behavior: buttons render enabled; click → inline popover "Sign in to like/save/follow" with sign-in link (`/api/auth/login?next=<current>`); NO mutation attempted.
- `VideoPage` action row order: Like, Save, Report (opens #13 `ReportDialog` with `targetType:"video"`), share-less (no share button in MVP).
- `/me/saves` page (`SavedVideosPage`) and `/me/follows` page (`FollowedChannelsPage`): reuse `VideoGrid` / channel list; route-guarded by session (redirect to `/` when signed out); linked from the user menu.
- Viewer state hydration: `useVideoMe(videoId)` (enabled only when signed in) powers initial button states.

### 3. Tests

API (`apps/api/test/reactions.test.ts`):

| Case | Expect |
|---|---|
| like/save/follow happy + repeat (idempotent) | 200 both times, count stable on repeat |
| unlike when never liked | 200 `{liked:false}` |
| signed out mutation | 401 |
| like pending/taken_down video; follow frozen channel | 404 |
| 31st reaction in 60 s | 429 |
| saves list hides taken-down video | save video → take it down (#11 helper) → `GET /api/me/saves` omits it |
| `/api/videos/:id/me` signed-out | 401; header `no-store` when authed |
| origin-check | PUT with foreign Origin → 403 |

UI component tests: optimistic toggle + rollback on 500; signed-out popover (no fetch called); saved page redirect when signed out.

### 4. File layout

```
apps/api/src/routes/reactions.ts        # like/save/follow + /me lists + /videos/:id/me
apps/api/src/lib/repo/reactions.ts
apps/web/src/features/reactions/*       # buttons + hooks
apps/web/src/routes/me/SavedVideosPage.tsx / FollowedChannelsPage.tsx
apps/api/test/reactions.test.ts
```

Order: 1. repo + PUT/DELETE endpoints + idempotency/visibility tests. 2. `/me` state + lists + filtering tests. 3. Buttons + optimistic UI + tests. 4. Pages + user-menu links. 5. Mount ReportDialog on `VideoPage` (report flow tests live in #13).

### 5. Acceptance mapping & PR evidence

- "Signed-in viewers can comment" → #37 (state the split in the PR); "like/save/follow/report" → §1/§2; "signed-out see prompts and cannot mutate" → 401 tests + popover test; "interactions blocked for non-public videos" → 404 rows; "rate limits" → 429 row; "comment moderation state respected" → #37.
- PR evidence: §3 table output + screenshots (action row, signed-out popover, saved page).

