# Issue #22 (#22A): Implement audit writer, action registry, and metadata redaction

GitHub issue: https://github.com/Saber5656/Vynema/issues/22

This file is the canonical implementation design for issue #22. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the shared audit core early so every feature emits typed,
transaction-compatible, secret-safe audit records. Admin audit operations,
observability documentation, runbooks, and ops status are the split child #55
(#22B).

## Scope

- Define the complete typed audit action registry used by feature Issues.
- Implement `writeAudit` and transaction-compatible `auditStatement`.
- Enforce metadata redaction and secret/capability rejection before persistence.
- Define development retention posture and registry-completeness tests.
- Give feature implementers one canonical audit contract before they add emitters.

## Out Of Scope

- Admin audit API/UI, observability docs, runbooks, and ops-status additions (#55).
- Paid observability platforms, production retention/provider choices, or deployment commands (#42).
- Long-term analytics warehouse.

## Acceptance Criteria

- [ ] Every active audit action is represented by the typed registry.
- [ ] Feature mutations can include an audit statement in the same SQLite transaction.
- [ ] Metadata validation rejects private keys, raw tokens, signatures, cookies, capabilities, URLs, and media BLOB identifiers.
- [ ] Registry-completeness tests detect unregistered action literals.
- [ ] Development retention posture is documented without selecting a production provider.
- [ ] Backend/security review confirms the core is reusable and secret-safe.

## Dependencies

- #4.
- #19.

## Notes

- [#55](https://github.com/Saber5656/Vynema/issues/55) owns #22B after #22A,
  #18, #20, and the implemented feature audit emitters exist.

---
Stable Issue Key: AIT-MVP-022
Classification: MVP Blocking
Dependencies: #4, #19
Recommended Labels: area/observability, area/ops, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative for #22A. Prerequisites: #4 (`audit_events`) and #19 (request logging conventions). #22A owns the writer, action registry, metadata redaction, and development retention posture. Feature Issues consume this core; #55 owns the later operations-facing surfaces.

### 1. Audit writer & action registry

- `packages/shared/src/audit-actions.ts`: `export const AUDIT_ACTIONS = [ … ] as const` — the COMPLETE list used across issues: `auth.login_success`, `auth.login_denied`, `auth.logout`, `registry.agent_created`, `registry.agent_disabled`, `registry.agent_enabled`, `registry.agent_revoked`, `registry.key_added`, `registry.key_retired`, `registry.key_revoked`, `registry.channel_created`, `registry.channel_updated`, `channel.frozen`, `channel.unfrozen`, `agent.auth_failed`, `intent.created`, `intent.denied`, `intent.expired`, `finalize.ok`, `finalize.failed`, `publish.ok`, `publish.rejected`, `publish.failed`, `takedown.ok`, `report.created`, `report.claimed`, `report.resolved`, `comment.created`, `comment.deleted_by_user`, `comment.hidden`, `comment.unhidden`, `moderation.preview_issued`, `config.updated`, `cleanup.run`, `cleanup.media_orphan_removed`. Type `AuditAction` = union; adding an event ⇒ add here first (type error otherwise).
- `apps/api/src/lib/audit.ts`: `writeAudit(db, {action: AuditAction, actorType, actorId, targetType?, targetId?, outcome, requestId?, metadata?})` → INSERT into `audit_events` (#4). Also `auditStatement(...)` returning a prepared statement for inclusion in the same SQLite transaction as the feature mutation.
- **Metadata redaction (normative, enforced by test)**: `metadata` passes through `assertSafeMetadata()` which throws if any value matches: ≥32-char base64/hex blobs, `-----BEGIN`, strings containing signed-capability query material, keys named `token|secret|signature|cookie|url|blob` — plus an allowlist of expected keys per action is NOT required (too rigid), the deny-heuristic is. Unit tests feed an upload token, signature, capability URL, media BLOB/id, and PEM → all throw.
- Retention: audit events are retained in the development SQLite database; production retention/capacity is selected in #42.

### Split child: #55 / #22B admin audit, observability, and runbooks

The following §§2–5 are canonical for
[#55](https://github.com/Saber5656/Vynema/issues/55), not part of the #22A PR.
They must use implemented routes/actions and #22A's redaction contract.

#### 2. Request logs (already emitted by #19) — operational posture

- Development emits structured JSON logs locally; durable events remain in SQLite. Production log provider/retention is deferred to #42.
- `docs/observability.md` (new): the one-line-per-request JSON schema (#19 §3), local viewing, requestId correlation, and the **intentionally-not-logged list**: request/response bodies, media bytes/blob ids, cookies, upload tokens, signatures, capability URLs, comment/report free text, and email addresses. Any new log line must respect this list.

#### 3. Admin audit view

- API: `GET /api/admin/audit?cursor&limit&action&actorType&actorId&targetId&since&until` — admin only; keyset pagination on `(occurred_at, id)` DESC; filters map to the #4 indexes; response rows are the raw audit columns (metadata already safe by §1).
- UI: `/admin/audit` `AuditLogPage`: filter bar (action dropdown from `AUDIT_ACTIONS`, actor type, target id, date range), table (time, action, actor, target, outcome, requestId, metadata expandable `<pre>` as text), Load more. Linked from `/admin` home (#18).
- Test: admin-only 403s; filter correctness; a seeded `publish.ok` row round-trips.

#### 4. Runbooks (`docs/runbooks/`, one file each — every runbook has: Symptoms / Immediate checks (exact commands) / Actions (exact commands or UI paths) / Verification / Escalation)

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

#### 5. Ops status visibility

`/admin/quotas` (#18) already shows counters + switches. Add to it in the #55 child issue: last `cleanup.run` time + per-step counts (query latest audit row), and open-reports count (link to `/admin/reports`). Operators can answer "why is upload paused?" from `/admin/quotas` (switch state) + `/admin/audit` (`config.updated` rows show who/when/why — extend #14's `POST /api/admin/config` body with optional `reason: string ≤500` recorded in audit metadata; small additive change, coordinate with #14's implementer).

### 6. Step-by-step order

#22A: 1. Action registry. 2. `writeAudit`/`auditStatement`. 3. Metadata-redaction and registry-completeness tests. 4. Refactor only already-landed ad-hoc inserts that are inside the #22A PR's approved scope.

#55, after its dependencies: 1. Admin audit API/page and authorization tests. 2. `docs/observability.md`. 3. Manual development-cleanup trigger. 4. Runbooks verified against implemented commands with dates. 5. Quotas-page additions. Production commands remain blocked on #42.

### 7. Acceptance mapping & PR evidence

- #22A: typed registry/writer and secret-safe metadata → §1 tests; PR evidence is registry-completeness/redaction output plus a security impact note.
- #55: operator diagnosis → child §5; transient-log posture → child §2; admin authorization → child §3; verified runbooks → child §4. PR evidence includes authorization tests, audit-page screenshots, runbook verification dates, and a security impact note.
