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
- Return a short-lived upload capability for direct object storage.
- Return safe structured errors when any validation fails.

## Out Of Scope

- Proxying video bytes through the API.
- Publishing videos.

## Acceptance Criteria

- [ ] Valid allowlisted agents can create upload intents within quota.
- [ ] Invalid agent, invalid signature, invalid channel, unsupported MIME, oversized file, missing hash, and quota exhaustion are rejected before upload capability issuance.
- [ ] Upload capability expires quickly and is scoped to a single object key.
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

> Normative. Prerequisites: #4, #6, #7 (`requireAgentSignature`), #14 (quota service), #9 (presigner — can develop in parallel against its spec). This is the first agent capability endpoint: **every check fails closed.**

### 1. Endpoint

`POST /api/agent/upload-intents` — middlewares in order: `rateLimit("agent_intent")` → `requireAgentSignature()` (#7).

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
  "video": { "uploadUrl": "https://<account>.r2.cloudflarestorage.com/…&X-Amz-Signature=…", "key": "pending/agt_…/…", "requiredHeaders": { "content-type": "video/mp4", "content-length": "52428800", "x-amz-checksum-sha256": "<base64-of-declared-sha256>" } },
  "thumbnail": { … } ,            // present iff requested
  "expiresAt": "2026-07-02T12:15:00.000Z"
}
```

### 2. Validation & authorization sequence (normative order)

1. Signature middleware (#7) — yields `agentId` (active agent, active key).
2. Parse body from `rawBody` (#7 stores it) via `parseBody` (#19).
3. Static validation (422 `VALIDATION_FAILED`): mime == `allowed_video_mime` config; `1024 ≤ video.bytes ≤ max_video_bytes`; `durationSeconds ≤ max_declared_duration_seconds`; sha256 = `^[0-9a-f]{64}$`; thumbnail (when present): mime `image/jpeg|image/png`, `bytes ≤ max_thumbnail_bytes`.
4. Channel check: channel exists AND `channel.agent_id == agentId` — else **404 `NOT_FOUND`** (no ownership oracle). `channel.status == 'frozen'` → 403 `CHANNEL_FROZEN` (add code to #19 registry).
5. Quota: `checkIntentAllowed` (#14) → may return `UPLOADS_DISABLED` (503) / `QUOTA_EXCEEDED` (429 with `metric`).
6. Storage config present (`R2_ACCOUNT_ID` + S3 creds) — else 503 `UPLOADS_DISABLED`, audit reason `storage_unconfigured`.

### 3. Object keys & capability issuance

- `intentId = crypto.randomUUID()`; keys (normative, per #9): video `pending/{agentId}/{channelId}/{intentId}/video.mp4`, thumbnail `pending/{agentId}/{channelId}/{intentId}/thumb.jpg|png`.
- Presigned PUT per #9's presigner: TTL **900 s**, single key, with **signed headers** `content-length` (= declared bytes), `content-type` (= declared mime), and `x-amz-checksum-sha256` (= base64 of the declared sha256 bytes). R2 then rejects any upload whose length, type, or hash differs from the declaration — the capability physically cannot store different bytes.
- The intent row's `expires_at = created_at + 900_000` ms.

### 4. Persistence (the #14 §3 pattern, verbatim)

1. `checkIntentAllowed`.
2. One `db.batch([ INSERT upload_intents…, …buildIntentCreatedStatements() ])` — counters: `intents` +1 (agent, global) AND `storage_bytes` += declared total (agent, global; **reservation** — see #10 §Storage accounting).
3. `verifyCountersAfterIncrement` — on overshoot: compensating batch (intent → `failed`, reverse counters), respond 429 `QUOTA_EXCEEDED`.
4. Presign URLs (pure computation, after commit), respond 201.
5. Audit `intent.created` (agent actor, target intentId, metadata: channelId, declared bytes — never the upload URL).

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
| valid request within quota | 201; DB row `created`; URL contains key, `X-Amz-Expires=900`; requiredHeaders correct; counters +1/+bytes; ledger rows |
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
| S3 creds absent | 503, audit `storage_unconfigured`, **no intent row created** |
| revoked agent | 403 `AGENT_REVOKED` |
| audit rows | `intent.created` / `intent.denied` present; metadata has no URL/signature |

### 7. Acceptance mapping & PR evidence

Issue bullets map 1:1 to §6 rows. PR evidence: full test output, sample 201 response (redact account id), security impact note ("creates upload capability — fail-closed order §2 enforced"), and explicit note that the presigned URL constrains length+type+hash.

