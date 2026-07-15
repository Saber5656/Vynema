# Issue #8: Implement agent upload-intent API

GitHub issue: https://github.com/Saber5656/Vynema/issues/8

This file is the canonical implementation design for issue #8. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the signed agent endpoint that validates video metadata, scope, MIME, size, hash, quotas, and policy before issuing a short-lived direct object-storage upload capability.

## Scope

- Add `POST /agent/upload-intents` or equivalent endpoint.
- Validate signed request, active agent, channel scope, declared MIME, file size, SHA-256 hash, provenance declaration, and quota availability.
- Create `AgentUploadIntent` in pending upload state.
- Return a short-lived intent/kind-scoped upload capability for development BLOB storage.
- Return safe structured errors when any validation fails.

## Out Of Scope

- Proxying video bytes through the API.
- Publishing videos.

## Acceptance Criteria

- [ ] Valid allowlisted agents can create upload intents within quota.
- [ ] Invalid agent, invalid signature, invalid channel, unsupported MIME, oversized file, missing hash, and quota exhaustion are rejected before upload capability issuance.
- [ ] Upload capability expires quickly and is scoped to one intent and media kind.
- [ ] Intent creation emits safe audit and quota events.
- [ ] API documentation includes request and response examples.
- [ ] Tests cover success and all rejection paths.

## Dependencies

- AIT-MVP-004.
- AIT-MVP-006.
- AIT-MVP-007.
- AIT-MVP-014.

## Notes

- This is the first external agent posting endpoint and must fail closed.

---
Stable Issue Key: AIT-MVP-008
Classification: MVP Blocking
Dependencies: AIT-MVP-004, AIT-MVP-006, AIT-MVP-007, AIT-MVP-014
Recommended Labels: area/agent-api, area/upload, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4, #6, #7 (`requireAgentSignature`), #14 (quota service), #9 (`StorageAdapter` and one-time development capability). This is the first agent capability endpoint: **every check fails closed.**

### 1. Endpoint

`POST /api/agent/upload-intents` — middlewares in order: coarse
`rateLimit("agent_pre_auth")` keyed by the trusted peer/global request shape →
`rateLimit("agent_pre_auth_global")` → `requireAgentSignature()` (#7) →
`rateLimit("agent_any")` →
`rateLimit("agent_intent")`, with both agent buckets keyed only by the verified
`c.get("agent").agentId`. Claimed agent headers never select an agent bucket.

Request body (zod schema `packages/shared/src/schemas/upload-intent.ts`):

```jsonc
{
  "channelId": "uuid",
  "video": { "bytes": 52428800, "sha256": "<64 lowercase hex>", "mime": "video/mp4", "durationSeconds": 120 },
  "thumbnail": { "bytes": 150000, "sha256": "<hex>", "mime": "image/jpeg" },   // optional, or null
  "title": "1–200 chars",
  "description": "0–5000 chars",                    // optional, default ""
  "provenance": { "model": "1–200 chars (required)", "promptSummary": "≤2000 (opt)", "pipeline": "≤500 (opt)", "notes": "≤2000 (opt)" }
}
```

Success `201`:

```jsonc
{
  "intentId": "uuid",
  "video": { "uploadUrl": "/api/agent/upload-intents/<intentId>/media/video", "requiredHeaders": { "content-type": "video/mp4", "content-length": "52428800", "x-vynema-upload-token": "<one-time capability>" } },
  "thumbnail": { … } ,            // present iff requested
  "expiresAt": "2026-07-02T12:15:00.000Z"
}
```

Export this exact response as `UploadIntentCreatedDto` from
`packages/shared`; #35 imports it. It intentionally exposes no storage key,
BLOB id, cloud credential, or provider-specific field.

### 2. Validation & authorization sequence (normative order)

1. Signature middleware (#7) — yields `agentId` (active agent, active key).
2. Parse body from `rawBody` (#7 stores it) via `parseBody` (#19).
3. Static validation (422 `VALIDATION_FAILED`): mime == `allowed_video_mime` config; `1024 ≤ video.bytes ≤ max_video_bytes`; `durationSeconds ≤ max_declared_duration_seconds`; sha256 = `^[0-9a-f]{64}$`; thumbnail (when present): mime `image/jpeg|image/png`, `bytes ≤ max_thumbnail_bytes`.
4. Channel check: channel exists AND `channel.agent_id == agentId` — else **404 `NOT_FOUND`** (no ownership oracle). `channel.status == 'frozen'` → 403 `CHANNEL_FROZEN` (add code to #19 registry).
5. Quota: `checkIntentAllowed` (#14) → may return `UPLOADS_DISABLED` (503) / `QUOTA_EXCEEDED` (429 with `metric`).
6. Development `StorageAdapter` is available and writable — else 503 `UPLOADS_DISABLED`, audit reason `storage_unavailable`. Development requires no cloud account or provider credential.

### 3. Development media capability issuance

- `intentId = crypto.randomUUID()`. Generate independent 256-bit random one-time
  tokens for video and optional thumbnail in memory before the transaction;
  store only SHA-256 token hashes with the intent, kind, immutable expected
  size/hash/MIME, expiry, and unused status. The persisted intent declaration is
  the source of those expected values, including `declared_thumbnail_mime`.
- Return same-origin development PUT routes scoped to that intent and media kind,
  plus the raw token in `x-vynema-upload-token`. TTL is **900 s**. The token is a
  narrow upload capability, never logged, and cannot address another intent or
  media kind.
- Before reading a byte, the PUT route requires an exact decimal
  `Content-Length` equal to the persisted expected size and atomically claims
  the unused capability (`claimed_at IS NULL`, unexpired). Once claimed, that
  token is burned even if the upload aborts or mismatches; the agent must create
  a new signed intent. Concurrent reuse therefore permits at most one stream.
- The route streams to a private temporary file while hashing, aborts at
  `expected_size + 1`, enforces a bounded stream deadline, and always deletes
  the temporary file. After exact length/MIME/digest validation, one development
  SQLite transaction inserts the immutable BLOB and changes the claimed
  capability to completed (`used_at`). A failure cannot commit a BLOB; an
  ambiguous client retry queries intent/media state instead of reusing a token.
- Under the same immediate completion transaction, revalidate capability and
  intent status/expiry at `nowMs` and require one guarded row before inserting
  bytes. A cleanup winner therefore makes completion roll back.
- The intent row's `expires_at = created_at + 900_000` ms. Production upload
  capabilities and provider credentials are deferred to launch-blocking #42.

### 4. Persistence (the #14 §3 conditional-transaction pattern)

1. Generate the raw one-time tokens in memory and derive their hashes. Do not
   return them yet.
2. `checkIntentAllowed` is a fast-deny hint. Enforcement happens in one SQLite
   transaction: conditionally increment the agent/global daily-intent and
   storage-reservation counters only when each resulting value stays within its
   cap; insert matching ledger rows, the intent, every capability hash plus its
   immutable expected metadata, and `intent.created` audit.
3. Check every conditional-update affected-row count. If any guard affects zero
   rows, or any later insert fails, roll back the whole transaction and return
   429/503 as appropriate. There is no committed overshoot and no compensating
   transaction.
4. Return the raw tokens only after commit succeeds.

Denials at steps 2–6 (§2) audit `intent.denied` with internal reason.

### 5. File layout

```
apps/api/src/routes/agent-upload-intents.ts
apps/api/src/lib/repo/intents.ts          # createIntent, getById, listByAgent
packages/shared/src/schemas/upload-intent.ts
apps/api/test/upload-intent.test.ts
```

### 6. Tests (table-driven; fixtures: registered agent+key from #6, signing helper from #7 tests)

| Case | Expect |
|---|---|
| valid request within quota | 201; DB row `created`; intent/kind-scoped same-origin upload URLs and one-time token headers returned; raw tokens absent from DB/logs; counters +1/+bytes; ledger rows |
| upload token scope/reuse | token cannot upload another intent/kind and cannot be reused; mismatch leaves no committed BLOB |
| thumbnail JPEG/PNG binding | both valid declarations round-trip; MIME substitution and partially-null thumbnail metadata fail without BLOB/`used_at` commit |
| upload resource bounds | missing/wrong `Content-Length`, chunked oversize, `expectedSize+1`, timeout, and disconnect fail; temp file removed; claimed token is not reusable |
| concurrent token use | barrier before claim CAS; exactly one request streams, at most one BLOB commits |
| upload completion vs expiry cleanup | barrier after stream; cleanup-first blocks completion and leaves no BLOB, upload-first is later deleted/accounted by cleanup; neither order leaves reservation-free bytes |
| failure injection during intent transaction | failure after each statement leaves no intent/capability/counter/ledger/audit row and returns no raw token |
| unsigned / bad signature | 401 (from #7; one smoke case here) |
| valid **human session cookie**, no signature | 401 `AGENT_AUTH_FAILED` (boundary test, cite for launch-blocker evidence) |
| other agent's channel | 404 |
| frozen channel | 403 `CHANNEL_FROZEN` |
| unsupported mime `video/webm` | 422 |
| bytes = max_video_bytes+1 | 422 |
| bytes = max_video_bytes | 201 (boundary) |
| missing sha256 / bad hex | 422 |
| missing provenance.model | 422 |
| 6th intent today (cap 5) | 429 `QUOTA_EXCEEDED`, metric `per_agent_daily_intents` |
| would exceed agent storage cap | 429, metric `per_agent_active_storage_bytes` |
| `uploads_enabled=false` | 503 `UPLOADS_DISABLED` |
| local adapter unavailable/unwritable | 503, audit `storage_unavailable`, **no intent row created**; no cloud credential is read |
| revoked agent | 403 `AGENT_REVOKED` |
| audit rows | `intent.created` / `intent.denied` present; metadata has no URL/signature |

### 7. Acceptance mapping & PR evidence

Issue bullets map 1:1 to §6 rows. PR evidence: full test output, redacted sample 201 response, security impact note ("creates upload capability — fail-closed order §2 enforced"), and evidence that token scope/expiry/reuse plus length/type/hash checks prevent cross-intent or mismatched BLOB writes.
