# Issue #20: Build automated test matrix and suites for v2 MVP

GitHub issue: https://github.com/Saber5656/Vynema/issues/20

This file is the canonical implementation design for issue #20. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Create the automated test coverage required to launch the v2 MVP with confidence across schema, agent auth, upload flow, review/publish, quotas, viewer UI, and security boundaries.

## Scope

- Add unit tests for signing, nonce, quota, state machines, and visibility filters.
- Add integration tests for upload intent, direct upload mock, finalize, review, publish, takedown, and quota exhaustion.
- Add UI or E2E tests for viewer pages, reviewer flows, agent docs/status, and no-human-upload boundary.
- Add security regression tests for replay, revoked agent, unauthorized human, and public access leakage.
- Document manual test checklist for object storage and production-like preview.

## Out Of Scope

- Paid load testing.
- Full browser/device matrix beyond MVP needs.

## Acceptance Criteria

- [ ] Test suite is defined and locally runnable.
- [ ] Critical MVP flows have automated coverage.
- [ ] Security boundary tests fail if humans can upload or pending videos become public.
- [ ] Quota and kill-switch tests prove fail-closed behavior.
- [ ] Manual storage/deployment smoke test checklist exists.
- [ ] QA review confirms launch-blocking tests are present.

## Dependencies

- AIT-MVP-004 through AIT-MVP-019.

## Notes

- Use mocks where provider free-tier limits make repeated real calls unsafe.
- CI execution of this suite is validated by AIT-MVP-021.

---
Stable Issue Key: AIT-MVP-020
Classification: MVP Blocking
Dependencies: AIT-MVP-004 through AIT-MVP-019
Recommended Labels: area/testing, type/quality, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Unit/integration tests are delivered INSIDE each feature issue (every design section above specifies its own test table). This issue delivers: (1) the E2E journey suite, (2) the launch-blocker traceability map, (3) the manual preview smoke checklist, (4) coverage reporting. Prerequisites: #4–#19, #34–#37 largely landed; #35 CLI for agent-flow E2E.

### 1. E2E suite (`e2e/` workspace package, Playwright)

- `e2e/package.json` (`@vynema/e2e`), `playwright.config.ts`: `webServer = { command: "pnpm --filter @vynema/web build && pnpm --filter @vynema/api exec wrangler dev --port 8787", url: "http://127.0.0.1:8787/api/health", timeout: 120000 }`; single `chromium` project; `workers: 1` for the MVP suite because scenarios mutate shared switches/quotas; `pnpm test:e2e` at root.
- Seeding (`e2e/seed.ts`, runs in `globalSetup`): bootstrap admin user by direct SQL (`wrangler d1 execute --local`), everything else through the product's own paths — admin API creates agent + channel (#6), #35 CLI performs keygen/upload/finalize against the local dev-upload route (#9 §7.2), review API approves. Fixture video: tiny valid MP4 committed at `e2e/fixtures/tiny.mp4` (< 100 KB, generated once with ffmpeg, provenance note in adjacent README).
- Auth in E2E: real GitHub OAuth is not scriptable — add a **local-only** login route `POST /api/dev/login {githubLogin, role}` mounted ONLY when `ENVIRONMENT === "local"` (same guard pattern as #9's dev-upload; include the test that it 404s when env≠local). E2E uses it to mint viewer/reviewer/admin sessions.

Journeys (one spec file each):

These specs run serially in CI. Any future parallelization must add explicit state reset/cleanup before and after each spec for global switches, quota caps, seeded users, agents, channels, and media objects.

| Spec | Steps & assertions |
|---|---|
| `viewer-browse.spec.ts` | home shows seeded published video card with AI badge → search finds it → channel page lists it → video page plays (`video` element has src under PUBLIC_MEDIA_BASE_URL, metadata loads) → provenance panel visible |
| `agent-publish-flow.spec.ts` | CLI upload (intent→PUT→finalize) → video NOT on home → reviewer approves in `/admin/review` UI → video appears on home; CLI `status` shows `published` |
| `moderation-takedown.spec.ts` | viewer reports published video → reviewer takes down in `/admin/reports` → video page shows unavailable; feed omits it; direct media URL request → 404 |
| `no-human-upload.spec.ts` | signed-in admin browser context calls `POST /api/agent/upload-intents` via `page.request` (cookies attached, no signature) → 401 `AGENT_AUTH_FAILED`; UI contains no upload affordance on any route (reuse #16 §4 route list) |
| `interactions.spec.ts` | signed-out like → popover prompt; dev-login viewer → like/save/comment succeed; comment appears; signed-out sees comment |
| `degraded-mode.spec.ts` | admin flips `public_read_enabled` off via `/admin/quotas` UI → home shows degraded banner → flip back on → recovers |
| `quota-killswitch.spec.ts` | admin sets `uploads_enabled=false` → CLI intent → `UPLOADS_DISABLED`; set `per_agent_daily_intents=1` → 2nd intent → `QUOTA_EXCEEDED` |

### 2. Launch-blocker traceability map (`docs/security/boundary-test-map.md` — required input for #23/#24)

Table: every row of `docs/security/launch-blocker-checklist.md` → the automated tests (file + case name) and/or manual checklist step that evidence it:

| Blocker | Evidence source |
|---|---|
| Secret exposure | `secret-scan.yml` + #21 CI runs + manual history scan record |
| Human upload capability | #5 `authz-boundary.test.ts` + #8 boundary case + `no-human-upload.spec.ts` |
| Unauthenticated agent upload/publish | #7 test table (missing/invalid/revoked/stale/nonce/hash) + #8 unsigned case |
| Pending/rejected media exposure | #15 visibility matrix + #11 public-bucket assertions + `moderation-takedown.spec.ts` + preview smoke §3 |
| Replayable signed request | #7 cases 11–12 |
| Quota/cost bypass | #14 boundary tests + `quota-killswitch.spec.ts` |
| Release/deploy gate bypass | #21 workflow review checklist |

Keep this file updated by every PR that adds/renames boundary tests (add a line to the PR template? — no: note in the doc header instead).

### 3. Manual preview smoke checklist (`docs/checklists/preview-smoke.md`)

Real-provider checks that local tests cannot cover (run against the preview env once #21 provisions it; re-run before launch per #24): real presigned PUT to R2 succeeds with correct headers and fails with wrong length/hash; publish S3 CopyObject works; r2.dev URL serves published object; pending object URL patterns → 401/404 (per #9 §6); takedown → public object 404 within a minute; D1 migrations applied via CI path; kill switch flip via dashboard affects preview immediately. Each step: exact command/URL + expected result + a `[ ] date/initials` line.

### 4. Coverage reporting

Enable `@vitest/coverage-v8` (`coverage.provider: "v8"`, reporter `text` + `json-summary`) in both app packages; root script `pnpm test:coverage`. No numeric gate in MVP; CI (#21) uploads the summary as a job artifact and prints it. Revisit a threshold at launch readiness.

### 5. Step-by-step order

1. `e2e` package + webServer boot + `viewer-browse.spec.ts` (proves the harness). 2. dev-login route + guard test. 3. Remaining specs in table order. 4. Traceability map. 5. Preview smoke checklist. 6. Coverage wiring. 7. Hand off CI wiring to #21 (`test:e2e` must be runnable headless in CI: `npx playwright install --with-deps chromium`).

### 6. Acceptance mapping & PR evidence

- "Suite defined and locally runnable" → `pnpm test && pnpm test:e2e` transcript; "critical flows covered" → §1 table; "security boundary tests fail if humans can upload or pending becomes public" → `no-human-upload.spec.ts` + #15 matrix referenced in §2 map; "quota/kill-switch fail-closed" → `quota-killswitch.spec.ts`; "manual storage checklist" → §3.
- PR evidence: E2E run output (all specs green), traceability map, security note ("adds dev-only login/upload routes — guarded by ENVIRONMENT check + tests").
