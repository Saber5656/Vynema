# Issue #22: Implement observability, audit logs, and operational runbooks

GitHub issue: https://github.com/Saber5656/Vynema/issues/22

This file is the canonical implementation design for issue #22. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Add the minimum observability and runbook coverage needed to operate a free-tier-bounded MVP safely.

## Scope

- Log request IDs, action type, actor type, status, safe error code, and quota outcome for mutating operations.
- Add audit logs for agent registry changes, upload intents, finalize attempts, reviews, publication, reports, takedowns, quota freezes, and kill-switch changes.
- Add admin-visible operational status for quotas and freezes.
- Create runbooks for quota exhaustion, abuse report spike, object cleanup failure, revoked agent, deployment rollback, and emergency publication pause.
- Define what is intentionally not logged.

## Out Of Scope

- Paid observability platforms.
- Long-term analytics warehouse.

## Acceptance Criteria

- [ ] Critical operations create safe audit records.
- [ ] Operators can determine why upload or publication is paused.
- [ ] Logs do not contain private keys, raw tokens, signatures, or sensitive upload capabilities.
- [ ] Runbooks exist for launch-critical incidents.
- [ ] Manual verification steps are included for each runbook.
- [ ] Infra/security review confirms observability is sufficient for MVP operations.

## Dependencies

- AIT-MVP-011.
- AIT-MVP-013.
- AIT-MVP-014.
- AIT-MVP-019.

## Notes

- Free-tier constraints may require lightweight logging and short retention.

---
Stable Issue Key: AIT-MVP-022
Classification: MVP Blocking
Dependencies: AIT-MVP-011, AIT-MVP-013, AIT-MVP-014, AIT-MVP-019
Recommended Labels: area/observability, area/ops, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #19 (request logging exists), #4 (`audit_events`). Feature issues each emit their own audit events; THIS issue centralizes the writer, the action registry, the admin audit view, retention posture, and the runbooks.

### 1. Audit writer & action registry

- `packages/shared/src/audit-actions.ts`: `export const AUDIT_ACTIONS = [ … ] as const` — the COMPLETE list used across issues: `auth.login_success`, `auth.login_denied`, `auth.logout`, `registry.agent_created`, `registry.agent_disabled`, `registry.agent_enabled`, `registry.agent_revoked`, `registry.key_added`, `registry.key_retired`, `registry.key_revoked`, `registry.channel_created`, `registry.channel_updated`, `channel.frozen`, `channel.unfrozen`, `agent.auth_failed`, `intent.created`, `intent.denied`, `finalize.ok`, `finalize.failed`, `publish.ok`, `publish.rejected`, `publish.failed`, `takedown.ok`, `report.created`, `report.claimed`, `report.resolved`, `comment.created`, `comment.deleted_by_user`, `comment.hidden`, `comment.unhidden`, `moderation.preview_issued`, `config.updated`, `cleanup.run`. Type `AuditAction` = union; adding an event ⇒ add here first (type error otherwise).
- `apps/api/src/lib/audit.ts`: `writeAudit(db, {action: AuditAction, actorType, actorId, targetType?, targetId?, outcome, requestId?, metadata?})` → INSERT into `audit_events` (#4). Also `auditStatement(...)` returning a `D1PreparedStatement` for inclusion in `db.batch` (feature issues already assume batch-atomic audits — this is the helper they use).
- **Metadata redaction (normative, enforced by test)**: `metadata` passes through `assertSafeMetadata()` which throws if any value matches: ≥32-char base64/hex blobs, `-----BEGIN`, strings containing `X-Amz-`, keys named `token|secret|signature|cookie|url` — plus an allowlist of expected keys per action is NOT required (too rigid), the deny-heuristic is. Unit tests feed a signature, a presigned URL, and a PEM → all throw.
- Retention: audit_events kept indefinitely in MVP (low volume, D1 5 GB budget; revisit at launch readiness). Documented below.

### 2. Request logs (already emitted by #19) — operational posture

- Workers Logs enabled (`[observability]` in #34). Free plan facts to document with recheck date: sampled invocation logs, limited retention (~3 days) — sufficient for MVP debugging; the durable trail is `audit_events` in D1.
- `docs/observability.md` (new): the one-line-per-request JSON schema (#19 §3), where to view (dashboard → Workers → Logs), how to correlate `requestId` between a user report, logs, and audit rows, and the **intentionally-not-logged list**: request/response bodies, cookies, tokens, signatures, presigned URLs, pending/quarantine object keys, comment/report free text, email addresses. Any new log line must respect this list (review note for PRs).

### 3. Admin audit view

- API: `GET /api/admin/audit?cursor&limit&action&actorType&actorId&targetId&since&until` — admin only; keyset pagination on `(occurred_at, id)` DESC; filters map to the #4 indexes; response rows are the raw audit columns (metadata already safe by §1).
- UI: `/admin/audit` `AuditLogPage`: filter bar (action dropdown from `AUDIT_ACTIONS`, actor type, target id, date range), table (time, action, actor, target, outcome, requestId, metadata expandable `<pre>` as text), Load more. Linked from `/admin` home (#18).
- Test: admin-only 403s; filter correctness; a seeded `publish.ok` row round-trips.

### 4. Runbooks (`docs/runbooks/`, one file each — every runbook has: Symptoms / Immediate checks (exact commands) / Actions (exact commands or UI paths) / Verification / Escalation)

| File | Key contents |
|---|---|
| `emergency-pause.md` | Stop uploads/publication/public reads NOW: `/admin/quotas` toggles; fallback when UI is down: `wrangler d1 execute vynema-db --remote --env production --command "UPDATE platform_config SET value='false', updated_at=(strftime('%s','now') * 1000), updated_by='runbook' WHERE key='uploads_enabled'"` (same for the other switches). Full media stop: `public_read_enabled` stops discovery APIs only — to stop already-public media bytes, disable the public bucket's public access (custom domain / r2.dev toggle in the Cloudflare dashboard — no deploy) and/or purge cached URLs. Verify: intent → 503, `/api/feed` → 503, media URL → 404/blocked. |
| `quota-exhaustion.md` | Symptoms (`QUOTA_EXCEEDED` audits, 429s); check `/api/admin/quotas`; decide: raise cap (config, with reason) vs let it bite; reconcile counters vs ledger query (SQL from #14 §6); free space: purge rejected/quarantine objects. |
| `abuse-spike.md` | Check `/admin/reports` open count by category; batch actions: freeze channel (#13), revoke agent (#6), takedown; tighten caps via config; enable manual-review breathing room by `uploads_enabled=false`; communicate via repo announcement. |
| `cleanup-failure.md` | `cleanup.run` audit missing or step counts stuck: run steps manually (each cron step is an exported function — invoke via a temporary `wrangler dev` REPL or admin-triggered `POST /api/admin/cron/run` — ADD this admin endpoint in this issue, admin-only, audited `cleanup.run` with `trigger:"manual"`); orphan listing SQL provided. |
| `revoked-agent.md` | When/how to revoke (#6 endpoint), expected propagation (auth 403s, content hidden via predicate, #13 tests), evidence retention (quarantine), owner-contact notification template. |
| `deployment-rollback.md` | `wrangler deployments list` / `wrangler rollback`; D1 fix-forward vs Time Travel restore decision tree (restore loses writes — prefer fix-forward unless data corruption); post-rollback smoke (#20 §3 subset). |
| `admin-bootstrap.md` | First-admin promotion SQL (#5 §6), adding reviewers, recovering a locked-out admin. |
| `secret-rotation.md` | Immediate rotation on suspected leak, per secret: GitHub OAuth `client_secret` (regenerate in the GitHub OAuth app → `wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --env …` → verify login); R2 S3 token (create new token → put both `R2_S3_*` secrets → verify presign/copy → revoke old); `CLOUDFLARE_API_TOKEN` (roll in Cloudflare dash → update GitHub Environment secret → test preview deploy); `SESSION_SECRET`; plus bulk session invalidation (`DELETE FROM sessions`) when session compromise is suspected. Order: rotate → verify → revoke old → audit note (`config.updated` style comment on the incident issue). |

### 5. Ops status visibility

`/admin/quotas` (#18) already shows counters + switches. Add to it (this issue): last `cleanup.run` time + per-step counts (query latest audit row), and open-reports count (link to `/admin/reports`). Operators can answer "why is upload paused?" from `/admin/quotas` (switch state) + `/admin/audit` (`config.updated` rows show who/when/why — extend #14's `POST /api/admin/config` body with optional `reason: string ≤500` recorded in audit metadata; small additive change, coordinate with #14's implementer).

### 6. Step-by-step order

1. Action registry + `writeAudit`/`auditStatement` + redaction tests; refactor any already-landed ad-hoc audit inserts to use it. 2. Admin audit API + page + tests. 3. `docs/observability.md`. 4. Manual cron-trigger endpoint + test. 5. Runbooks (verify each command against local/preview while writing — record "verified <date>" per file). 6. Quotas-page additions.

### 7. Acceptance mapping & PR evidence

- "Critical operations create safe audit records" → §1 registry covers every mutation in the system + redaction tests; "operators can determine why paused" → §5; "logs contain no secrets" → §1 heuristics + #19 redaction test + §2 list; "runbooks for launch-critical incidents" → §4 (emergency pause, quota, abuse, cleanup, revocation, rollback); "manual verification steps per runbook" → Verification sections.
- PR evidence: redaction test output, audit page screenshot, runbook verification dates, security note ("observability — no new public surface; one admin-only cron trigger, audited").


