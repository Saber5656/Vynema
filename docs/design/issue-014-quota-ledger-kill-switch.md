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
- AIT-MVP-005; admin-route integration, push, and ready-PR publication wait for its canonical `requireRole("admin")` contract and unauthorized/forbidden boundary tests, but quota-core preparation does not.
- AIT-MVP-019; feature-local quota preparation starts only after AIT-MVP-004 and AIT-MVP-019.
- AIT-MVP-022; typed audit-writer integration, push, and ready-PR publication wait for this gate, but quota-core preparation does not.

## Notes

- Free operation means bounded operation, not unlimited service.

---
Stable Issue Key: AIT-MVP-014
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-004 + AIT-MVP-019 (quota-core preparation gate), AIT-MVP-022 (audit-integration/push/ready-PR gate), AIT-MVP-005 (admin-route integration/push/ready-PR gate)
Recommended Labels: area/quotas, area/infra, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. #4 (`platform_config`, `quota_ledger`, `quota_counters`) and #19 permit feature-local quota-core preparation. #22A/#22 (typed audit writer, action registry, metadata redaction) MUST merge before audit-emitting integration. #5 MUST merge before admin-route integration and provide the canonical `requireRole("admin")` contract plus unauthorized/forbidden boundary tests. Push and ready-PR publication require both gates; neither #5 nor #22A is a quota-core preparation prerequisite. Implements ADR-009. Quota is a **security boundary** (threat model): every check fails closed.

### 1. Config keys & defaults

Exactly the ADR-009 table (repo file [`docs/architecture/adr/ADR-009-quota-defaults.md`](../architecture/adr/ADR-009-quota-defaults.md); 13 keys: 3 kill switches + 10 numeric/string limits, including `per_agent_daily_publications` = 5), seeded by #4's `0002_seed_config.sql`. `getConfig()` (#4) throws `ConfigUnavailableError` when any key is missing → callers translate to 503 deny on capability paths. Config is read fresh per request (no cross-request caching in MVP — correctness over micro-optimization).

### 2. Quota service (`apps/api/src/lib/quota.ts`) — exact API

```ts
type QuotaDecision = { allowed: true } | { allowed: false; code: "QUOTA_EXCEEDED" | "UPLOADS_DISABLED" | "PUBLICATION_DISABLED"; metric?: string };

checkIntentAllowed(db, cfg, args: {agentId, declaredVideoBytes, declaredThumbnailBytes}): Promise<QuotaDecision>
reserveIntentWithinCaps(tx, cfg, args): Promise<QuotaDecision> // conditional agent/global intent + storage guards; ledger in same tx
releaseReservation(tx, args: {agentId, declaredBytes, refId, reason}): Promise<boolean> // conditional storage decrement + same-period ledger; exactly-once ref guard
checkPublishAllowed(db, cfg, agentId): Promise<QuotaDecision>   // per-agent AND global daily publication caps
reservePublicationWithinCaps(tx, cfg, args): Promise<QuotaDecision> // publication guards + ledger in #11 tx
getQuotaStatus(db, cfg): Promise<QuotaStatusDto>            // all counters vs caps, for admin
```

Counter semantics (`quota_counters`): daily metrics (`intents`, `publications`)
use `period_start` = UTC midnight (ms); gauges (`storage_bytes`) use
`period_start = 0`. Each increment is a conditional INSERT/UPDATE whose
predicate proves `value + delta <= cap`; the caller must check exactly one
affected row. Every counter change writes a matching `quota_ledger` row in the
same SQLite transaction (ledger = audit trail, counters = enforcement).
Release updates require `value >= delta` and an unused lifecycle reference;
zero affected rows aborts the transaction. This prevents negative counters and
double-decrement on retry. The quota ledger is domain accounting evidence, not
a substitute for #22A's platform security audit stream.

`checkIntentAllowed` evaluates in order (first failure wins):
1. `uploads_enabled` false → `UPLOADS_DISABLED`.
2. agent daily intents ≥ `per_agent_daily_intents` → `QUOTA_EXCEEDED` (`metric:"per_agent_daily_intents"`).
3. global daily intents ≥ `global_daily_intents`.
4. agent storage gauge + declared bytes > `per_agent_active_storage_bytes`.
5. global storage gauge + declared bytes > `global_active_storage_bytes`.

### 3. Concurrency: conditional cap guards in one transaction

Two concurrent intents may both pass the optional load-time hint, so it is not
the enforcement boundary. The normative development pattern for #8 is one
SQLite transaction that:

1. conditionally increments the agent/global daily-intent counters and the
   agent/global storage gauges only when each resulting value is `<= cap`;
2. checks every affected-row count;
3. inserts the matching ledger entries, intent, capability hashes/expected
   metadata, and success audit;
4. rolls everything back if any guard returns zero or any later statement fails.

There is no commit-then-verify window and no compensation API. At cap−1, a
barrier race yields exactly one successful reservation. Injecting failure after
each statement leaves no intent, capability, counter, ledger, or audit residue.
#11 uses the same pattern for publication counters inside its status-CAS
transaction.

### 4. Kill switches & degraded modes (wired in the owning issues, defined here)

| Switch | Effect when false | Enforced in |
|---|---|---|
| `uploads_enabled` | intent creation → 503 `UPLOADS_DISABLED`; finalize of EXISTING intents still allowed (they hold storage already) | #8 |
| `publication_enabled` | review approval returns 503 `PUBLICATION_DISABLED`; queue/reject still work | #11/#12 |
| `public_read_enabled` | public discovery APIs and the development media route → 503 `SERVICE_DEGRADED`; UI shows a static "temporarily read-limited" notice; admin+agent endpoints unaffected | #15 discovery, #54 media routes, #16 UI |

Switch flips are config updates (§5) — **no deploy, no code change**, satisfying "kill switch without redeploying".

### 4a. Provider read/spend boundary and QT-004

Development stores media as SQLite BLOBs behind `StorageAdapter`. The application
serves development media through #54's visibility-checked anonymous route, so
`public_read_enabled=false` gates both discovery and media bytes. #14 proves the
config lookup and switch policy fail closed; #15 proves discovery 503 behavior;
#54 proves media-route 503/no-store behavior. These development tests need no
cloud account or provider credential.

This does **not** claim that QT-004 is mitigated for release. A production media
provider, delivery path, pricing model, measurable operation/byte boundary, and
provider-side hard stop have not been selected. Launch-blocking issue #42 owns
that decision and the migration rehearsal. Before release it MUST:

- select current provider/pricing limits from official sources;
- define a measurable pre-limit threshold and an automatic or provider-enforced
  stop that does not rely only on an operator noticing a dashboard;
- prove cached/direct URLs cannot bypass the stop and takedown boundary;
- update #22 with exact provider commands, verification, rollback, and owner
  sign-off.

Until #42 is resolved, QT-004 remains **open / not mitigated for production**.
Manual provider dashboard observation is not accepted as fail-closed evidence
and no Cloudflare/R2-specific risk is accepted by this design.

### 5. Admin API

| Method & path | Auth | Behavior |
|---|---|---|
| `GET /api/admin/quotas` | admin | `getQuotaStatus`: `{switches: {...}, counters: [{scope, scopeId, metric, value, cap, periodStart}], updatedAt}` |
| `POST /api/admin/config` | admin | body `{key, value}`; key MUST be in the 13-key allowlist; value validated by per-key zod type (boolean/int/string); writes `platform_config` and emits registered action `config.updated` (metadata: key, old, new) through #22A's typed writer in the same transaction. Direct audit-table insertion is forbidden. Unknown key → 422. |

Quota services, counter/ledger helpers, and `QuotaStatusDto` may be prepared before
#5. Route registration and request handling MUST wait for #5 and reuse its
canonical `requireRole("admin")` middleware; a local auth stub, parallel role
checker, or route-local admin test is forbidden. Boundary tests prove an
unauthenticated request returns 401 and an authenticated non-admin request
returns 403, with no config, counter, ledger, or audit mutation in either case.
The authorized config-update case additionally proves that the config row and
#22A `config.updated` event commit or roll back together.

### 6. Ledger lifecycle coverage (must reconcile)

> Amended 2026-07-02: storage accounting is **reservation-at-intent** (closes the uncounted-storage gap between upload and finalize). The canonical table lives in #10 "Storage accounting"; summary:

| Event | Statements |
|---|---|
| intent created (#8) | agent+global `intents` +1 (daily); agent+global `storage_bytes` += declared bytes (**reservation**); ledger `intent_created` + `reserved` |
| finalize ok (#10) | no counter change (object size verified equal to declaration; reservation already covers it) |
| finalize failure / intent expired (#10) | `storage_bytes` -= declared (release); ledger `reservation_released` |
| rejected video purged after 7 d (#10 cleanup job) | `storage_bytes` -= declared; ledger `rejected_purged` |
| published (#11) | agent+global `publications` +1; ledger `published` (storage net 0: visibility change over the same BLOB) |
| takedown (#13) | storage net 0 (visibility change; evidence BLOB retained); ledger `taken_down` |

Reconciliation test: after a scripted lifecycle (2 intents → 1 finalized →
published → taken down; 1 expired+cleaned), `SUM(quota_ledger.delta)` per
`(scope, scope_id, metric, period_start)` equals the matching
`quota_counters.value`. UTC-day rollover creates a new daily period; storage
gauges use period `0`.

### 7. Tests (`apps/api/test/quota.test.ts`)

Table-driven boundaries: each §2 check at cap−1 (allow) and at cap (deny,
correct `metric`); barrier race at cap−1 gives one commit and never exposes a
committed counter over cap; fault injection after every §3 statement rolls back
all state; UTC-day rollover reconciles separately; double release and
insufficient-gauge release affect zero rows and roll back; switches off →
correct fail-closed policy result; #15 owns discovery HTTP 503 tests and #54
owns media-route 503/no-store tests; `ConfigUnavailableError` → deny;
§5 unauthenticated 401 and non-admin 403 with no state/audit side effect via
#5's canonical middleware; config update happy/unknown-key/bad-type + #22A
typed-writer/redaction evidence for `config.updated`; §6 reconciliation.
Production provider-spend tests are blocked on #42 and must not be marked
passing in this issue.

### 8. File layout & order

```
apps/api/src/lib/quota.ts
apps/api/src/routes/admin-quotas.ts
packages/shared/src/schemas/admin-config.ts
apps/api/test/quota.test.ts
```

1. Counter/ledger helpers + reconciliation test. 2. `checkIntentAllowed` +
boundary tests. 3. §3 conditional transaction + race/fault-injection tests. 4.
Switches, publish check, and quota-status service preparation. 5. After #22A
merges, integrate `config.updated` through its typed writer at the service
transaction boundary and run audit/redaction tests without registering the
admin routes. 6. After #5 merges, register both admin routes through its
canonical `requireRole("admin")`, run the 401/403 no-side-effect tests, then push
and publish the ready PR. 7. Update
`docs/architecture/vynema-architecture.md` Free-Tier Control Points table to
reference the config keys.

### 9. Acceptance mapping & PR evidence

- "Fails closed when quota exhausted" → §2/§3 tests; "kill switch without redeploy" → §4/§5; "ledger updates on intent/finalize/cleanup/publication/takedown" → §6 reconciliation test; "public APIs degrade safely" → fail-closed switch policy here, #15 discovery HTTP evidence, and #54 anonymous media-route evidence; "admins see quota state" → §5.
- PR evidence: boundary test table output + reconciliation test output + #22A
  typed-writer/redaction evidence for `config.updated` + #5 canonical-admin
  middleware evidence (401/403 with no state/audit side effect) + security
  impact note ("quota/cost boundary — fail-closed verified").
