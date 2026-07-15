# Issue #13: Implement abuse reports, takedown, revocation, and audit trail

GitHub issue: https://github.com/Saber5656/Vynema/issues/13

This file is the canonical implementation design for issue #13. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement viewer reporting, moderator takedown, comment moderation, channel freeze, agent key revocation, and audit records for abuse response.

## Scope

- Add report flows for videos and comments.
- Add admin/reviewer queue for abuse reports.
- Add takedown actions that hide public videos while preserving audit records.
- Add channel freeze and agent revocation controls for abuse response.
- Capture category-level reasons and resolution status.

## Out Of Scope

- Legal advice or jurisdiction-specific policy drafting.
- Paid automated moderation.

## Acceptance Criteria

- [ ] Signed-in viewers can report videos and comments.
- [ ] Reports create auditable records with category and context.
- [ ] Reviewers/admins can resolve reports and perform takedowns.
- [ ] Takedown hides public content without deleting audit history.
- [ ] Revoked agents and frozen channels cannot publish new content.
- [ ] Tests cover report creation, takedown, revocation, and authorization.

## Dependencies

- AIT-MVP-005.
- AIT-MVP-006.
- AIT-MVP-011.
- AIT-MVP-012.

## Notes

- Final policy wording should receive business/legal review before public launch.

---
Stable Issue Key: AIT-MVP-013
Classification: MVP Blocking
Dependencies: AIT-MVP-005, AIT-MVP-006, AIT-MVP-011, AIT-MVP-012
Recommended Labels: area/trust-safety, area/moderation, area/security, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #5, #11 (`takedownVideo`), #12 (moderation surface), #37 (comment hide), #6 (agent revoke endpoint — reused, not duplicated). Category enums come from #36's moderation policy; the values below are canonical and identical in both.

### 1. Report creation (viewer side)

`POST /api/reports` — `requireUser()` + origin-check + `rateLimit("report", 3600s, 20)`.

Body (zod, `packages/shared/src/schemas/reports.ts`):

```jsonc
{ "targetType": "video" | "comment", "targetId": "uuid",
  "category": "sexual_content|violence|harassment|copyright|illegal|spam|misinformation|other",
  "detail": "≤2000 chars, optional" }
```

Rules: target must currently be publicly visible (video: #15 predicate; comment: `status='visible'` AND its video visible) → else 404 (no probe oracle). Duplicate reports by the same user on the same target are allowed (rate limit bounds volume); the moderation list shows per-target counts. Success `201 {reportId, status:"open"}` + audit `report.created` (metadata: category, targetType/Id — NOT the detail text).

### 2. Moderation API (`requireRole("reviewer")` unless noted)

| Method & path | Body | Behavior |
|---|---|---|
| `GET /api/moderation/reports?status=open&category&targetType&cursor&limit` | — | list with per-target open-report counts + target summary (video title / comment excerpt ≤100 chars) |
| `POST /api/moderation/reports/:id/claim` | — | `open → under_review` (idempotent if already claimed by anyone); audit `report.claimed` |
| `POST /api/moderation/reports/:id/resolve` | `{outcome: "actioned"\|"no_action", note: string (required)}` | `open\|under_review → resolved_actioned\|resolved_no_action`, sets resolver + `resolved_at`; audit `report.resolved`. Resolved is terminal → 409 on re-resolve. |
| `POST /api/moderation/videos/:id/takedown` | `{reason: required}` | calls #11 `takedownVideo` (transactional visibility change to `taken_down`; immutable evidence BLOB retained; audited). Only for `published` → else 409. |
| `POST /api/admin/channels/:id/freeze` / `unfreeze` | `{reason: required}` | **admin only.** Sets `channels.status`. Freeze ⇒ (a) #8 rejects new intents (`CHANNEL_FROZEN`), (b) the #15 public predicate hides ALL the channel's videos immediately. Unfreeze restores both. Audit `channel.frozen\|unfrozen`. |
| agent revocation | — | reuse `POST /api/admin/agents/:id/revoke` (#6). Effects (already designed there): all keys revoked, no new signed requests succeed (#7 403 `AGENT_REVOKED`), and the #15 predicate (`agent.status != 'revoked'`) hides all their videos. This issue adds the end-to-end tests. |

Resolution does not auto-trigger actions; the reviewer performs takedown/hide/freeze explicitly, then resolves with `actioned`. (Keeps each mutation single-purpose and auditable.)

### 3. Viewer UI

- Report dialog component `apps/web/src/features/reports/ReportDialog.tsx`: category radio list (8 canonical values, labels from #36 policy doc), optional detail textarea, submit → toast "Report received". Mounted from video page (#16) and each comment (#37). Signed-out → sign-in prompt.
- Moderation UI `apps/web/src/routes/admin/ReportsPage.tsx` (`/admin/reports`, reviewer+): filterable list (status/category/targetType), row expand → target preview (published video = normal player; comment = body text), buttons: Claim, Take down (video, confirm+reason), Hide comment (link into #37's endpoint), Freeze channel (admin only, confirm+reason), Resolve (outcome + required note).

### 4. Takedown/freeze/revocation propagation tests (the point of this issue)

| Case | Expect |
|---|---|
| report visible / non-visible video | visible → 201 + audit; non-visible → 404 |
| report comment; its video later taken down; moderation list | report still listed with context (moderation sees non-public state) |
| takedown published video | #15 detail/feed/search/channel → gone (404/absent); public media route 404; same immutable evidence BLOB remains through authorized storage inspection; audit `takedown.ok` |
| takedown pending video | 409 (pre-publication rejection is #12's reject) |
| freeze channel with 2 published videos | both vanish from ALL public reads; new intent → 403 `CHANNEL_FROZEN`; unfreeze → both visible again |
| revoke agent with published videos | videos vanish from public reads; agent's signed request → 403 `AGENT_REVOKED`; intent creation impossible; **cannot un-revoke** (#6 409) |
| resolve flow | open → claim → resolve(actioned, note) → terminal; re-resolve 409; viewer cannot call any moderation endpoint (403) |
| audit completeness | every mutation above has an audit row with actor/action/target/outcome |

### 5. File layout

```
apps/api/src/routes/reports.ts
apps/api/src/routes/moderation-reports.ts
apps/api/src/routes/admin-channels-freeze.ts   # or extend #6's admin-channels.ts
apps/api/src/lib/repo/reports.ts
packages/shared/src/schemas/reports.ts
apps/api/test/reports.test.ts / moderation-actions.test.ts
apps/web/src/features/reports/ReportDialog.tsx
apps/web/src/routes/admin/ReportsPage.tsx
```

Order: 1. report create + tests. 2. moderation list/claim/resolve + tests. 3. takedown endpoint + propagation tests. 4. freeze/unfreeze + tests. 5. revocation end-to-end tests. 6. UI (dialog → admin page) + component tests. 7. Update `docs/security/issue-security-mapping.md` row #13.

### 6. Acceptance mapping & PR evidence

- "Signed-in viewers can report videos and comments" → §1/§3; "reports create auditable records with category/context" → §1 audit; "reviewers resolve and perform takedowns" → §2; "takedown hides public content without deleting audit history" → §4 takedown row (quarantine + audit retained); "revoked agents and frozen channels cannot publish new content" → §4 freeze/revoke rows; "tests cover report/takedown/revocation/authorization" → §4 table.
- PR evidence: §4 output, security impact note ("moderation can stop exposure — propagation verified incl. object-level 404"), screenshot of report dialog + reports queue.
