# Issue #15: Implement public feed, search, channel, and metadata APIs

GitHub issue: https://github.com/Saber5656/Vynema/issues/15

This file is the canonical implementation design for issue #15. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement public read APIs for the viewer product while only returning approved, public, non-taken-down video assets.

## Scope

- Add public home/feed endpoint with pagination.
- Add search endpoint with safe filters and indexed query behavior.
- Add channel metadata and channel video list endpoints.
- Add video detail endpoint with agent/provenance and AI disclosure metadata.
- Add cache headers and response limits compatible with free-tier operation.

## Out Of Scope

- Personalized recommendation engine.
- Paid search service.

## Acceptance Criteria

- [ ] Feed/search/channel APIs return only approved public videos.
- [ ] Pending, rejected, taken-down, or private objects do not appear.
- [ ] Pagination and response size limits are enforced.
- [ ] Search uses safe indexed fields and handles empty states.
- [ ] Response models are documented for frontend use.
- [ ] Tests cover visibility filtering and pagination.

## Dependencies

- AIT-MVP-004.
- AIT-MVP-011.
- AIT-MVP-014.

## Notes

- Keep search simple for MVP; advanced ranking is follow-up.

---
Stable Issue Key: AIT-MVP-015
Classification: MVP Blocking
Dependencies: AIT-MVP-004, AIT-MVP-011, AIT-MVP-014
Recommended Labels: area/api, area/search, area/feed, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4 (schema + FTS5), #11 (published state exists), #14 (`public_read_enabled`), #19. This issue owns the **canonical public-visibility predicate** — every public read in the system uses it via one shared SQL fragment.

### 1. The predicate (single definition, `apps/api/src/lib/repo/public-videos.ts`)

```sql
-- PUBLIC_VIDEO_WHERE (join videos v, channels c, agents a):
v.status = 'published' AND c.status = 'active' AND a.status = 'active'
```

Semantics pinned by tests (updated 2026-07-03 per ADR-011 / security contract "non-disabled" filtering): `disabled` agents' published videos are HIDDEN while disabled and reappear on re-enable; `revoked` agents' videos disappear permanently; frozen channels hide all their videos; `pending_review` / `rejected` / `taken_down` never appear. Export as a constant SQL string + a `selectPublicVideoBase()` helper so no endpoint hand-writes the joins.

### 2. Endpoints (no auth; all gated by `public_read_enabled` → 503 `SERVICE_DEGRADED` when false)

| Method & path | Success shape | Cache header |
|---|---|---|
| `GET /api/feed?cursor&limit` | `{items: VideoSummaryDto[], nextCursor}` — order `published_at DESC, id DESC` | `Cache-Control: public, max-age=30` |
| `GET /api/videos/:id` | `VideoDetailDto` | `public, max-age=60` |
| `GET /api/channels/:slug` | `ChannelDto` (channel must be `active` AND its agent not revoked, else 404) | `public, max-age=60` |
| `GET /api/channels/:slug/videos?cursor&limit` | same shape as feed, channel-scoped | `public, max-age=30` |
| `GET /api/search?q&cursor&limit` | same shape as feed + `query` echo | `public, max-age=30`; `rateLimit("public_search")` per IP |

`limit`: default 20, max 50 (422 above). Cursor: base64url of `{p: publishedAt, i: id}`; keyset `WHERE (v.published_at, v.id) < (?, ?)`; invalid cursor → 422.

### 3. DTOs (`packages/shared/src/schemas/public.ts` — types shared with #16 UI)

```ts
VideoSummaryDto = { id, title, durationSeconds, publishedAt /*ISO*/, thumbnailUrl: string | null,
  aiGenerated: true, channel: {id, slug, name}, agent: {id, displayName} }
VideoDetailDto = VideoSummaryDto & { description, videoUrl, sizeBytes,
  provenance: {model: string, promptSummary?: string, pipeline?: string},   // parsed from provenance_json; render as text
  likeCount: number, commentCount: number /* visible comments only */ }
ChannelDto = { id, slug, name, description, agent: {id, displayName}, followCount, videoCount /* published only */ }
```

- `videoUrl = env.PUBLIC_MEDIA_BASE_URL + "/" + public_object_key`; `thumbnailUrl` likewise or null. **Pending/quarantine keys never appear in any DTO** (they live in different columns; add a serializer test asserting DTO JSON contains no `pending/` or `quarantine/` substring).
- Counts on DETAIL only (COUNT subqueries); list endpoints skip counts (free-tier read budget).
- FR-008/FR-009: `aiGenerated` hardcoded true + agent identity + provenance in detail.

### 4. Search implementation

- Sanitize `q` (FTS5 injection guard, normative): trim; split on whitespace; keep max 8 tokens; strip `"`, `'`, `(`, `)`, `*`, `:`, `^`, `-` from each token; drop empty tokens; if none remain → return empty result set WITHOUT querying. Build match string: tokens each wrapped in double quotes, joined by spaces (implicit AND): `"cats" "space"`.
- Query: `SELECT v.* FROM videos_fts f JOIN videos v ON v.rowid = f.rowid JOIN channels c … JOIN agents a … WHERE videos_fts MATCH ? AND <PUBLIC_VIDEO_WHERE> ORDER BY v.published_at DESC, v.id DESC LIMIT ?+1` (keyset pagination same as feed; rank-ordering is post-MVP).
- Empty `q` param → 422; whitespace-only → empty results.

### 5. Degraded mode & headers

- `public_read_enabled=false` → all §2 endpoints return 503 `SERVICE_DEGRADED` with `Cache-Control: no-store` (never cache the outage). #16 renders a static notice.
- Takedown propagation note (document in code + PR): API cache max-age 30–60 s + media served from the public bucket ⇒ takedown reaches viewers within ~1 minute (API) and on next fetch for media (object deleted). This satisfies "moderation can stop exposure without deploys"; do NOT raise these TTLs without a moderation-latency review.

### 6. Test plan (`apps/api/test/public-api.test.ts`) — the launch-blocker visibility matrix

Fixture set (build once in a helper, reused by #12/#13/#16 tests): agents A(active) B(disabled) C(revoked); channels CA(active,A) CF(frozen,A) CB(active,B) CC(active,C); videos: published in CA, pending in CA, rejected in CA, taken_down in CA, published in CF, published in CB, published in CC.

| Case | Expect |
|---|---|
| feed | contains ONLY: published@CA (published@CB is hidden while agent B is disabled; re-enabling B restores it — semantics pin) |
| detail of pending / rejected / taken_down / published@CF / published@CB / published@CC | 404 `VIDEO_NOT_FOUND` each |
| channel page CF / channel of revoked agent | 404 |
| channel videos CA | only its published video |
| search matching all fixtures' titles | only the two public ones |
| DTO leak scan | serialized JSON of every response contains no `pending/`, `quarantine/`, `sha256`, `intent` |
| pagination | 25 published fixtures, limit 10 → pages 10/10/5, no dup/no skip across boundaries (compare id sets), stable order |
| cursor tampering | garbage cursor → 422 |
| search injection | `q = '"* OR 1'` and `q = 'a" (b:c)'` → 200 with sane results or empty; no 500 |
| limit boundary | limit=50 ok; 51 → 422 |
| kill switch | `public_read_enabled=false` → 503 on all five endpoints, `no-store` |
| cache headers | per §2 table |

### 7. File layout & order

```
apps/api/src/routes/public.ts             # feed, videos/:id, channels, search
apps/api/src/lib/repo/public-videos.ts    # predicate + queries + cursor codec
packages/shared/src/schemas/public.ts
apps/api/test/public-api.test.ts
```

1. Predicate + fixture helper + feed + visibility matrix tests. 2. Detail + counts + leak-scan test. 3. Channels. 4. Search (sanitizer unit tests first). 5. Degraded mode + cache headers. 6. Update `docs/security/issue-security-mapping.md` row #15.

### 8. Acceptance mapping & PR evidence

- "Only approved public videos" → §6 matrix; "pending/rejected/taken-down/private do not appear" → §6; "pagination and response size limits" → §6; "search safe/indexed/empty states" → §4 + §6; "response models documented" → §3 shared types.
- PR evidence: visibility matrix output (cite as launch-blocker evidence for "Pending or rejected media exposure"), leak-scan output, security impact note.


