# Issue #37: Build comments system with moderation visibility states

GitHub issue: https://github.com/Saber5656/Vynema/issues/37

This file is the canonical implementation design for issue #37. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the comments system: posting, listing, deleting, moderation visibility states, and the comment report hook, across API and viewer UI.

Split out of #17 by scope separation: comments carry their own moderation lifecycle and abuse surface, which is substantially more complex than the toggle-style reactions (like/save/follow) that remain in #17. Keeping them separate lets each land as an independently reviewable PR.

## Scope

- `comments` API: create, list (paginated), delete-own, plus moderator hide/unhide.
- Comment moderation states: `visible`, `hidden_by_moderator`, `deleted_by_user`.
- Viewer UI: comment list + form on the video page, signed-out prompt, moderated placeholders.
- Report entry point per comment (creates an `abuse_report` with `targetType: "comment"` — report backend is #13).

## Out Of Scope

- Likes/saves/follows and video-level report UI (#17).
- Realtime updates (polling/refresh only).
- Threaded replies (flat list for MVP).

## Acceptance Criteria

- [ ] Signed-in viewers can post comments on published videos only; signed-out users get a sign-in prompt (UI) and 401 (API).
- [ ] Comments on non-public videos are rejected with 404 (existence not leaked).
- [ ] Authors can delete their own comments; reviewers/admins can hide any comment; both leave audit records.
- [ ] Hidden comments show a neutral placeholder in the UI and are excluded from public API bodies.
- [ ] Rate limit: max 10 comments per user per 5 minutes, enforced server-side, fail-closed.
- [ ] Tests cover auth, visibility filtering, moderation transitions, and rate limiting.

## Dependencies

- #4 (schema), #5 (human auth), #15 (video visibility predicate), #19 (error envelope, rate limiter). Report hook completes with #13.

---

## Implementation Plan & Design (2026-07-02)

> Normative. Uses the platform conventions from issue #2 ADRs and middleware from #19. Read #4's schema section first — the `comments` table is created there; this issue implements behavior only.

### 1. Data model (defined in #4, restated here)

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,                 -- uuid v4
  video_id TEXT NOT NULL REFERENCES videos(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible','hidden_by_moderator','deleted_by_user')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_video_created ON comments(video_id, created_at DESC);
CREATE INDEX idx_comments_user ON comments(user_id);
```

### 2. API contract (all under `/api`, JSON, error envelope per #19)

| Method & path | Auth | Success | Errors |
|---|---|---|---|
| `GET /videos/:videoId/comments?cursor=&limit=` | none | `200 {items, nextCursor}` | `404 VIDEO_NOT_FOUND` if video not publicly visible |
| `POST /videos/:videoId/comments` body `{body: string}` | session (any role) | `201 CommentDto` | `401 AUTH_REQUIRED`, `404 VIDEO_NOT_FOUND`, `422 VALIDATION_FAILED`, `429 RATE_LIMITED` |
| `DELETE /comments/:id` | session; author only | `200 {status:"deleted_by_user"}` | `401`, `403 FORBIDDEN` (not author), `404 COMMENT_NOT_FOUND` |
| `POST /moderation/comments/:id/hide` body `{reason: string}` | session; role reviewer/admin | `200 CommentDto` | `401`, `403`, `404` |
| `POST /moderation/comments/:id/unhide` | session; role reviewer/admin | `200 CommentDto` | same |

`CommentDto` (public list shape):

```json
{
  "id": "…", "videoId": "…", "status": "visible",
  "body": "…",                      // null unless status == "visible"
  "author": { "id": "…", "displayName": "…" } ,  // null unless visible
  "createdAt": "2026-07-02T00:00:00.000Z"
}
```

Rules:
- List endpoint returns rows of all statuses BUT for `hidden_by_moderator` and `deleted_by_user` it nulls `body`/`author` (placeholder rendering); this keeps pagination stable. Never return the original text of non-visible comments.
- Video visibility check reuses the exact public predicate from #15 (`video.status='published' AND channel.status='active' AND agent.status = 'active'`); non-visible → `404 VIDEO_NOT_FOUND` for both GET and POST (no existence leak).
- Pagination: cursor = base64 of `{createdAt, id}` of last item; `limit` default 20, max 50; order `created_at DESC, id DESC`.
- Rate limit via #19 limiter: key `comment:{userId}`, window 300 s, max 10 → `429 RATE_LIMITED`.
- Audit events (#4 `audit_events`): `comment.created`, `comment.deleted_by_user`, `comment.hidden`, `comment.unhidden` with actor, target id, and reason (hide only). Never log comment body into audit metadata.

### 3. File layout

```
apps/api/src/routes/comments.ts            # public + session endpoints
apps/api/src/routes/moderation-comments.ts # hide/unhide (mount under requireRole('reviewer'))
apps/api/src/lib/repo/comments.ts          # repository functions below
apps/api/test/comments.test.ts
apps/web/src/features/comments/CommentList.tsx
apps/web/src/features/comments/CommentForm.tsx
apps/web/src/features/comments/useComments.ts   # TanStack Query hooks
```

Repository functions (exact signatures):

```ts
createComment(db, {id, videoId, userId, body, now}): Promise<CommentRow>
listCommentsByVideo(db, {videoId, cursor, limit}): Promise<{rows: CommentRow[]; nextCursor: string | null}>
getComment(db, id): Promise<CommentRow | null>
setCommentStatus(db, {id, status, now}): Promise<void>
```

### 4. UI behavior (video page section, rendered by #16's `VideoPage`)

- `CommentList`: infinite "Load more" button (no auto-infinite-scroll), skeleton loading, empty state "No comments yet". Hidden/deleted → grey placeholder `Comment removed`. Each visible comment shows author displayName, relative time, body (plain text, no markdown/HTML rendering — render as text node only, never `dangerouslySetInnerHTML`), a Report button (opens #17's report dialog with `targetType:"comment"`), and Delete for own comments.
- `CommentForm`: textarea (maxLength 2000, live counter), disabled when not signed in with a "Sign in to comment" button linking to `/api/auth/login`. Optimistic insert on success via query invalidation (not manual cache surgery).
- Signed-in state comes from #5's `GET /api/me` hook.

### 5. Step-by-step order

1. Repository + unit tests against local D1 (vitest-pool-workers).
2. Public GET route + visibility filtering tests (fixtures: published/pending/taken_down videos).
3. POST/DELETE with auth + rate limit + audit; tests for 401/403/404/422/429.
4. Moderation hide/unhide + role tests.
5. Web UI components + hook; component tests with mocked fetch.
6. Wire into `VideoPage` (coordinate with #16 if not yet merged: build behind a `videoId` prop, integration happens in whichever lands second).

### 6. Edge cases (must be tested)

| Case | Expected |
|---|---|
| POST to video that is `pending_review` | 404 VIDEO_NOT_FOUND |
| Video taken down after comments exist; GET list | 404 (list gated by video visibility) |
| Author deletes an already-hidden comment | 403 FORBIDDEN (moderator state wins; author cannot mask moderation) |
| body = 2001 chars | 422 VALIDATION_FAILED |
| body = only whitespace | 422 (trim, then length check ≥ 1) |
| 11th comment in 5 min | 429 with `retryAfter` seconds in error detail |
| Reviewer hides, then unhides | body/author reappear in list |

### 7. Security mapping (security-contract.md)

- Human auth & roles: hide/unhide behind server-side `requireRole('reviewer')` (from #5).
- Moderation & audit: all four audit actions recorded with actor/action/target/timestamp/outcome.
- No secrets in logs: log comment ids, never bodies.

### 8. PR / evidence checklist

- [ ] Test run output covering §6 table.
- [ ] Security impact note: "adds authenticated human write surface; rate-limited; no upload capability".
- [ ] Screenshot of comment list incl. hidden placeholder state.

---
Stable Issue Key: AIT-MVP-029
Classification: MVP Blocking
Dependencies: #4, #5, #15, #19; report hook completes with #13
Labels: area/frontend, area/backend, area/viewer, area/moderation, type/implementation, priority/p0, mvp-blocking


