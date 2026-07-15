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

- `packages/shared/src/audit-actions.ts`: `export const AUDIT_ACTIONS = [ … ] as const` — the COMPLETE list used across issues: `auth.login_success`, `auth.login_denied`, `auth.logout`, `registry.agent_created`, `registry.agent_disabled`, `registry.agent_enabled`, `registry.agent_revoked`, `registry.key_added`, `registry.key_retired`, `registry.key_revoked`, `registry.channel_created`, `registry.channel_updated`, `channel.frozen`, `channel.unfrozen`, `agent.auth_failed`, `intent.created`, `intent.denied`, `intent.expired`, `finalize.ok`, `finalize.failed`, `publish.ok`, `publish.rejected`, `publish.failed`, `takedown.ok`, `report.created`, `report.claimed`, `report.resolved`, `comment.created`, `comment.deleted_by_user`, `comment.hidden`, `comment.unhidden`, `moderation.preview_issued`, `config.updated`, `cleanup.run`, `cleanup.media_orphan_removed`. Type `AuditAction` = union; adding an event ⇒ add here first (type error otherwise).
- `apps/api/src/lib/audit.ts`: `writeAudit(db, {action: AuditAction, actorType, actorId, targetType?, targetId?, outcome, requestId?, metadata?})` → INSERT into `audit_events` (#4). Also `auditStatement(...)` returning a prepared statement for inclusion in the same SQLite transaction as the feature mutation.
- **Metadata redaction (normative, enforced by test)**: `metadata` passes through `assertSafeMetadata()` which throws if any value matches: ≥32-char base64/hex blobs, `-----BEGIN`, strings containing signed-capability query material, keys named `token|secret|signature|cookie|url|blob` — plus an allowlist of expected keys per action is NOT required (too rigid), the deny-heuristic is. Unit tests feed an upload token, signature, capability URL, media BLOB/id, and PEM → all throw.
- Retention: audit events are retained in the development SQLite database; production retention/capacity is selected in #42.

### 2. Request logs (already emitted by #19) — operational posture

- Development emits structured JSON logs locally; durable events remain in SQLite. Production log provider/retention is deferred to #42.
- `docs/observability.md` (new): the one-line-per-request JSON schema (#19 §3), local viewing, requestId correlation, and the **intentionally-not-logged list**: request/response bodies, media bytes/blob ids, cookies, upload tokens, signatures, capability URLs, comment/report free text, and email addresses. Any new log line must respect this list.

### 3. Admin audit view

- API: `GET /api/admin/audit?cursor&limit&action&actorType&actorId&targetId&since&until` — admin only; keyset pagination on `(occurred_at, id)` DESC; filters map to the #4 indexes; response rows are the raw audit columns (metadata already safe by §1).
- UI: `/admin/audit` `AuditLogPage`: filter bar (action dropdown from `AUDIT_ACTIONS`, actor type, target id, date range), table (time, action, actor, target, outcome, requestId, metadata expandable `<pre>` as text), Load more. Linked from `/admin` home (#18).
- Test: admin-only 403s; filter correctness; a seeded `publish.ok` row round-trips.

### 4. Runbooks (`docs/runbooks/`, one file each — every runbook has: Symptoms / Immediate checks (exact commands) / Actions (exact commands or UI paths) / Verification / Escalation)

| File | Key contents |
|---|---|
| `emergency-pause.md` | Development: stop uploads/publication/public reads with `/admin/quotas`; if the UI is unavailable, run the documented local SQLite `UPDATE platform_config ...` command for each switch. `public_read_enabled=false` MUST stop both discovery and the development media route. Verify: intent → 503, `/api/feed` → 503, media route → 503/blocked. Production provider commands and thresholds are intentionally absent until launch-blocking issue #42 selects the database/media platform; #42 must add exact stop, cache invalidation, verification, rollback, and owner sign-off before release. |
| `quota-exhaustion.md` | Symptoms (`QUOTA_EXCEEDED` audits, 429s); check `/api/admin/quotas`; decide: raise cap (config, with reason) vs let it bite; reconcile counters vs ledger query (SQL from #14 §6); free space: run the ownership-checked rejected/expired BLOB purge. |
| `abuse-spike.md` | Check `/admin/reports` open count by category; batch actions: freeze channel (#13), revoke agent (#6), takedown; tighten caps via config; enable manual-review breathing room by `uploads_enabled=false`; communicate via repo announcement. |
| `cleanup-failure.md` | `cleanup.run` audit missing or counts stuck: invoke exported cleanup functions with the local admin script or admin-only `POST /api/admin/cleanup/run`, audited with `trigger:"manual"`; include orphan-BLOB listing SQL. Production scheduler invocation is deferred to #42. |
| `revoked-agent.md` | When/how to revoke (#6 endpoint), expected propagation (auth 403s, content hidden via predicate, #13 tests), evidence retention (quarantine), owner-contact notification template. |
| `deployment-rollback.md` | Development SQLite backup/fix-forward procedure now; production deploy/database rollback commands are blocked on #42 and must be added only after provider selection. |
| `admin-bootstrap.md` | First-admin promotion SQL (#5 §6), adding reviewers, recovering a locked-out admin. |
| `secret-rotation.md` | Development covers GitHub OAuth/client and session secrets only, plus bulk session invalidation (`DELETE FROM sessions`). Provider/deploy/media credentials do not exist before #42; #42 must add least-privilege rotation procedures after selection. Order: rotate → verify → revoke old → audit note. |

### 5. Ops status visibility

`/admin/quotas` (#18) already shows counters + switches. Add to it (this issue): last `cleanup.run` time + per-step counts (query latest audit row), and open-reports count (link to `/admin/reports`). Operators can answer "why is upload paused?" from `/admin/quotas` (switch state) + `/admin/audit` (`config.updated` rows show who/when/why — extend #14's `POST /api/admin/config` body with optional `reason: string ≤500` recorded in audit metadata; small additive change, coordinate with #14's implementer).

### 6. Step-by-step order

1. Action registry + `writeAudit`/`auditStatement` + redaction and registry-completeness tests (every action literal in active issue designs must exist); refactor any already-landed ad-hoc audit inserts to use it. 2. Admin audit API + page + tests. 3. `docs/observability.md`. 4. Manual development-cleanup trigger endpoint + test. 5. Runbooks (verify each current command locally while writing — record "verified <date>" per file; production commands wait for #42). 6. Quotas-page additions.

### 7. Acceptance mapping & PR evidence

- "Critical operations create safe audit records" → §1 registry covers every mutation in the system + redaction tests; "operators can determine why paused" → §5; "logs contain no secrets" → §1 heuristics + #19 redaction test + §2 list; "runbooks for launch-critical incidents" → §4 (emergency pause, quota, abuse, cleanup, revocation, rollback); "manual verification steps per runbook" → Verification sections.
- PR evidence: redaction test output, audit page screenshot, runbook verification dates, security note ("observability — no new public surface; one admin-only development-cleanup trigger, audited").
