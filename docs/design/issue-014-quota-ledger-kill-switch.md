# Issue #14: Implement free-tier quota ledger, kill switch, and degraded modes

GitHub issue: https://github.com/Saber5656/Vynema/issues/14

This file is the canonical implementation design for issue #14. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement free-tier budget enforcement so upload, publication, reads, and interaction features pause or degrade before the platform incurs paid usage.

## Scope

- Track per-agent, per-channel, and global upload counts and uploaded bytes.
- Track active storage bytes, object count, estimated reads, estimated writes, and quota periods.
- Add configurable hard caps for upload intent creation, publication, and high-risk read paths.
- Add global kill switch for agent upload and publication.
- Add degraded modes for comments/realtime/search/feed if traffic risks free-tier overrun.
- Add admin-visible quota status.

## Out Of Scope

- Billing integration.
- Automatic paid upgrade.

## Acceptance Criteria

- [ ] Upload intent creation fails closed when any relevant quota is exhausted.
- [ ] Global kill switch can pause uploads and publication without redeploying code if feasible.
- [ ] Quota ledger updates on intent creation, finalize, cleanup, publication, and takedown where relevant.
- [ ] Public APIs can degrade safely under read pressure.
- [ ] Admins can see quota state and freeze reason.
- [ ] Tests cover quota exhaustion and kill-switch behavior.

## Dependencies

- AIT-MVP-002.
- AIT-MVP-004.

## Notes

- Free operation means bounded operation, not unlimited service.

---
Stable Issue Key: AIT-MVP-014
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-004
Recommended Labels: area/quotas, area/infra, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4 (`platform_config`, `quota_ledger`, `quota_counters`), #19. Implements ADR-009. Quota is a **security boundary** (threat model): every check fails closed.

### 1. Config keys & defaults

Exactly the ADR-009 table (repo file [`docs/architecture/adr/ADR-009-quota-defaults.md`](../architecture/adr/ADR-009-quota-defaults.md); 13 keys: 3 kill switches + 10 numeric/string limits, including `per_agent_daily_publications` = 5), seeded by #4's `0002_seed_config.sql`. `getConfig()` (#4) throws `ConfigUnavailableError` when any key is missing → callers translate to 503 deny on capability paths. Config is read fresh per request (no cross-request caching in MVP — correctness over micro-optimization).

### 2. Quota service (`apps/api/src/lib/quota.ts`) — exact API

```ts
type QuotaDecision = { allowed: true } | { allowed: false; code: "QUOTA_EXCEEDED" | "UPLOADS_DISABLED" | "PUBLICATION_DISABLED"; metric?: string };

checkIntentAllowed(db, cfg, args: {agentId, declaredVideoBytes, declaredThumbnailBytes}): Promise<QuotaDecision>
buildIntentCreatedStatements(args): D1PreparedStatement[]   // intents +1 AND storage_bytes += declared (reservation) + ledger; caller batches with the intent INSERT
verifyCountersAfterIncrement(db, cfg, agentId): Promise<QuotaDecision>  // post-write overshoot check (see §3)
buildReleaseStatements(args: {agentId, declaredBytes, refId, reason}): D1PreparedStatement[]  // storage gauges -= declared (reservation release / rejected purge)
checkPublishAllowed(db, cfg, agentId): Promise<QuotaDecision>   // per-agent AND global daily publication caps
buildPublishedStatements(args): D1PreparedStatement[]       // publications daily +1 (agent + global), ledger
verifyPublicationCountersAfterIncrement(db, cfg, agentId): Promise<QuotaDecision>  // post-write overshoot check for #11
buildPublicationCompensationStatements(args): D1PreparedStatement[]  // reverse a reserved publication slot when #11 copy/commit fails
getQuotaStatus(db, cfg): Promise<QuotaStatusDto>            // all counters vs caps, for admin
```

Counter semantics (`quota_counters`): daily metrics (`intents`, `publications`) use `period_start` = UTC midnight (ms); gauges (`storage_bytes`) use `period_start = 0`. Upsert pattern: `INSERT … ON CONFLICT(scope,scope_id,metric,period_start) DO UPDATE SET value = value + ?, updated_at = ?`. Every counter change writes a matching `quota_ledger` row in the same batch (ledger = audit trail, counters = enforcement).

`checkIntentAllowed` evaluates in order (first failure wins):
1. `uploads_enabled` false → `UPLOADS_DISABLED`.
2. agent daily intents ≥ `per_agent_daily_intents` → `QUOTA_EXCEEDED` (`metric:"per_agent_daily_intents"`).
3. global daily intents ≥ `global_daily_intents`.
4. agent storage gauge + declared bytes > `per_agent_active_storage_bytes`.
5. global storage gauge + declared bytes > `global_active_storage_bytes`.

### 3. Concurrency: check → batch-increment → verify → compensate

D1 has no SELECT-FOR-UPDATE. Two concurrent intents could both pass §2 checks. Normative pattern for #8:

1. `checkIntentAllowed` (fast deny).
2. One `db.batch([...intentInsert, ...buildIntentCreatedStatements()])` — atomic.
3. `verifyCountersAfterIncrement`: re-read the two daily counters and two gauges; if any now EXCEEDS its cap, run the compensation batch (`mark intent failed` + `buildCleanupStatements` reversing the increments) and return `QUOTA_EXCEEDED`. Net effect: caps may be probed but never durably exceeded; failure mode is over-denial (fail closed), never over-grant.

Document this pattern in the code comment. #8 follows it for intent/storage reservations. #11 follows the same pattern for publication counters by reserving the publication slot before public copy, verifying, and compensating on cap overshoot or later publish failure.

### 4. Kill switches & degraded modes (wired in the owning issues, defined here)

| Switch | Effect when false | Enforced in |
|---|---|---|
| `uploads_enabled` | intent creation → 503 `UPLOADS_DISABLED`; finalize of EXISTING intents still allowed (they hold storage already) | #8 |
| `publication_enabled` | review approval returns 503 `PUBLICATION_DISABLED`; queue/reject still work | #11/#12 |
| `public_read_enabled` | public read APIs → 503 `SERVICE_DEGRADED`; UI shows a static "temporarily read-limited" notice; admin+agent endpoints unaffected. NOTE: stops discovery surfaces only — already-public media URLs keep serving from R2; the full media stop is the storage-level action in #22's emergency-pause runbook (no deploy) | #15/#16 |

Switch flips are config updates (§5) — **no deploy, no code change**, satisfying "kill switch without redeploying".

### 5. Admin API

| Method & path | Auth | Behavior |
|---|---|---|
| `GET /api/admin/quotas` | admin | `getQuotaStatus`: `{switches: {...}, counters: [{scope, scopeId, metric, value, cap, periodStart}], updatedAt}` |
| `POST /api/admin/config` | admin | body `{key, value}`; key MUST be in the 13-key allowlist; value validated by per-key zod type (boolean/int/string); writes `platform_config` + audit `config.updated` (metadata: key, old, new). Unknown key → 422. |

### 6. Ledger lifecycle coverage (must reconcile)

> Amended 2026-07-02: storage accounting is **reservation-at-intent** (closes the uncounted-storage gap between upload and finalize). The canonical table lives in #10 "Storage accounting"; summary:

| Event | Statements |
|---|---|
| intent created (#8) | agent+global `intents` +1 (daily); agent+global `storage_bytes` += declared bytes (**reservation**); ledger `intent_created` + `reserved` |
| finalize ok (#10) | no counter change (object size verified equal to declaration; reservation already covers it) |
| finalize failure / intent expired (#10) | `storage_bytes` -= declared (release); ledger `reservation_released` |
| rejected video purged after 7 d (#10 cron) | `storage_bytes` -= declared; ledger `rejected_purged` |
| published (#11) | agent+global `publications` +1; ledger `published` (storage net 0: public copy + pending delete) |
| takedown (#13) | storage net 0 (quarantine move); ledger `taken_down` |

Reconciliation test: after a scripted lifecycle (2 intents → 1 finalized → published → taken down; 1 expired+cleaned), `SUM(quota_ledger.delta)` per (scope,metric) == `quota_counters.value`.

### 7. Tests (`apps/api/test/quota.test.ts`)

Table-driven boundaries: each §2 check at cap−1 (allow) and at cap (deny, correct `metric`); switches off → correct 503 codes; `ConfigUnavailableError` → deny; §3 compensation (simulate by pre-incrementing counters between check and verify); §5 config update happy/unknown-key/bad-type + audit row; §6 reconciliation.

### 8. File layout & order

```
apps/api/src/lib/quota.ts
apps/api/src/routes/admin-quotas.ts
packages/shared/src/schemas/admin-config.ts
apps/api/test/quota.test.ts
```

1. Counter/ledger helpers + reconciliation test. 2. `checkIntentAllowed` + boundary tests. 3. §3 verify/compensate + race test. 4. Switches + publish check. 5. Admin endpoints + audit. 6. Update `docs/architecture/vynema-architecture.md` Free-Tier Control Points table to reference the config keys.

### 9. Acceptance mapping & PR evidence

- "Fails closed when quota exhausted" → §2/§3 tests; "kill switch without redeploy" → §4/§5; "ledger updates on intent/finalize/cleanup/publication/takedown" → §6 reconciliation test; "public APIs degrade safely" → `SERVICE_DEGRADED` wiring (#15 completes; state split in PR); "admins see quota state" → §5.
- PR evidence: boundary test table output + reconciliation test output + security impact note ("quota/cost boundary — fail-closed verified").

