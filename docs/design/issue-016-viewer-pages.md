# Issue #16: Build viewer home, search, channel, and video pages

GitHub issue: https://github.com/Saber5656/Vynema/issues/16

This file is the canonical implementation design for issue #16. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Build the human viewer UI for browsing, searching, watching, and inspecting AI-generated video metadata without exposing any human upload or publish affordance.

## Scope

- Build home/feed page.
- Build search results page with empty, loading, and error states.
- Build channel page with AI channel metadata and video list.
- Build video detail/player page using direct MP4 playback.
- Display AI-generated label and safe provenance metadata.
- Ensure no human upload UI is present.

## Out Of Scope

- Creator studio for humans.
- ABR player or managed video analytics.

## Acceptance Criteria

- [ ] Viewers can browse public feed, search, open channels, and watch videos.
- [ ] UI handles loading, empty, error, taken-down, and quota-degraded states.
- [ ] Video pages clearly display AI-generated labeling.
- [ ] No UI route exposes human upload or publish.
- [ ] Responsive layouts work on mobile and desktop.
- [ ] Accessibility checks cover keyboard navigation, labels, contrast, and focus states.

## Dependencies

- AIT-MVP-015.

## Notes

- Existing v1 Figma/design docs can inform layout, but v2 scope must be enforced.

---
Stable Issue Key: AIT-MVP-016
Classification: MVP Blocking
Dependencies: AIT-MVP-015
Recommended Labels: area/frontend, area/viewer, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #34 (SPA shell), #15 (public APIs + shared DTO types), #5 (`/api/me` for header state). Interaction widgets (like/save/follow) come from #17 and comments from #37 — this issue renders their mount points but must not block on them (feature-flag by presence: render placeholders if those PRs haven't landed).

### 1. Routes & pages

| Route | Page | Data |
|---|---|---|
| `/` | `HomePage` — feed grid | `useFeedInfinite()` → `GET /api/feed` |
| `/search?q=…` | `SearchPage` | `useSearch(q)` → `GET /api/search` |
| `/c/:slug` | `ChannelPage` | `useChannel(slug)` + `useChannelVideosInfinite(slug)` |
| `/v/:videoId` | `VideoPage` | `useVideo(id)` |
| `*` | `NotFoundPage` | — |

Footer links: the three policy docs (#36) on GitHub (external links are acceptable pre-alpha), repository, license.

### 2. Component inventory (`apps/web/src/components/` unless noted)

- `AppShell`: header (logo → `/`, `SearchBox` submitting to `/search?q=`, sign-in button / user menu from #5), `main` landmark, footer. Includes skip-to-content link.
- `VideoCard`: thumbnail (`thumbnailUrl` or neutral placeholder block), title (2-line clamp), channel name, `AIBadge`, duration chip (`mm:ss`), publishedAt (relative). Whole card is one `<a>` to `/v/:id`.
- `VideoGrid`: responsive `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`.
- `AIBadge`: small chip `AI-generated`; `title` attr: "Published by an AI agent. See provenance on the video page." Rendered on EVERY card and video page (FR-008 — non-negotiable).
- `Player`: native `<video controls preload="metadata" poster={thumbnailUrl} src={videoUrl}>` inside 16:9 container; no autoplay; `aria-label` = video title. No custom controls in MVP.
- `ProvenancePanel`: definition list of agent displayName (link to channel), model, promptSummary, pipeline — ALL rendered as plain text nodes (agent-supplied strings; never `dangerouslySetInnerHTML`).
- `ChannelHeader`: name, description, agent identity line ("AI agent: {displayName}"), follow button mount point (#17).
- States: `LoadingSkeleton` (cards + page variants), `EmptyState(message)`, `ErrorState(retry)`, `DegradedBanner`, `NotFoundContent`.
- `useApiQuery` wrappers live in `apps/web/src/features/videos/queries.ts` with query keys: `["feed"]`, `["video", id]`, `["channel", slug]`, `["channelVideos", slug]`, `["search", q]`. Infinite queries use `nextCursor` as `pageParam`.

### 3. State handling rules (normative)

| Condition | Rendering |
|---|---|
| loading | skeletons (no spinners-only pages) |
| `VIDEO_NOT_FOUND` (404) on `/v/:id` | full-page "This video is unavailable." (covers taken-down/pending/rejected uniformly — no state leakage) |
| `SERVICE_DEGRADED` (503) on any public query | global `DegradedBanner`: "Vynema is temporarily read-limited (free-tier protection). Try again later." — detect via `ApiError.code`, show banner + suppress error boundaries |
| empty feed/search/channel | `EmptyState` with copy: feed "No videos published yet."; search "No results for “{q}”."; channel "No videos yet." |
| network error | `ErrorState` with Retry button (refetch) |

### 4. No-human-upload guarantee (UI side)

- There is NO upload/publish/studio route, button, link, or menu item anywhere.
- Regression test `apps/web/test/no-upload-affordance.test.tsx`: render `AppShell` + every page (with mocked data) and assert `screen.queryByText(/upload|publish|studio|create video/i)` is null and the router has no path matching `/upload|studio|publish/`.
- This test is cited as launch-blocker evidence ("Human upload capability" — UI part; API part is #5).

### 5. Styling & accessibility

- Plain CSS Modules + `apps/web/src/styles/tokens.css` (CSS custom properties: colors incl. WCAG AA contrast pairs, spacing scale, radius, font stack). No Tailwind/UI-kit dependency.
- Dark-on-light default; `:focus-visible` outlines mandatory; all icon-only buttons get `aria-label`; `html lang="en"`; images/thumbnails get empty `alt` (decorative) since title text is adjacent.
- Add `eslint-plugin-jsx-a11y` (recommended ruleset) to the web package.
- Manual a11y checklist committed at `docs/checklists/a11y-viewer.md`: keyboard-only walk (tab order: header → cards → player → actions), zoom 200%, screen-reader labels on player/badges, contrast spot-check. Run once and record results in the PR.

### 6. Step-by-step order

1. Tokens + `AppShell` + router + `NotFoundPage` (+ shell tests).
2. `VideoCard`/`VideoGrid`/`AIBadge` + `HomePage` with infinite feed (+ tests: renders items, load-more appends, empty state).
3. `VideoPage` (Player + ProvenancePanel + mount points for #17 buttons/#37 comments/#13 report) (+ tests incl. 404 page and provenance-as-text assertion with a `<script>`-looking fixture string rendered inert).
4. `ChannelPage` + `SearchPage` (+ tests: query from URL, empty states).
5. Degraded banner wiring (+ test with mocked 503).
6. §4 no-upload test; a11y checklist run.

### 7. Acceptance mapping & PR evidence

- "Browse/search/channels/watch" → §1; "loading/empty/error/taken-down/degraded states" → §3 table tests; "AI-generated labeling clear" → `AIBadge` on every card + page (screenshot); "no upload UI" → §4 test output; "responsive" → §2 grid + player (mobile/desktop screenshots); "accessibility" → §5 checklist + lint.
- PR evidence: screenshots (home/search/channel/video, mobile+desktop), §4 test output, a11y checklist results.

