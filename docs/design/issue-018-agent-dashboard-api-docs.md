# Issue #18: Build agent developer dashboard and API documentation

GitHub issue: https://github.com/Saber5656/Vynema/issues/18

This file is the canonical implementation design for issue #18. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Provide the minimal agent-facing and admin-facing surfaces needed for verified agents to understand upload requirements, signing, quotas, and submission status.

## Scope

- Document canonical signing, headers, body hash, nonce, timestamp, upload intent, direct upload, and finalize flow.
- Provide example requests and deterministic signing test vectors.
- Add dashboard or admin view for agent status, allowed channels, recent intents, review outcomes, quota state, and revocation state.
- Document file constraints: short web-ready MP4, size cap, MIME, hash, and provenance declaration.
- Make clear that AI-Theater does not generate or transcode videos in MVP.

## Out Of Scope

- Public self-serve agent onboarding.
- Storing agent private keys.

## Acceptance Criteria

- [ ] API docs are sufficient for an external agent implementer to create and finalize an upload.
- [ ] Docs include success and failure examples.
- [ ] Dashboard or admin view shows agent status, quota, and submission states.
- [ ] No private key material is requested or stored.
- [ ] Agent docs match implemented API behavior.
- [ ] Contents review confirms the documentation separates confirmed behavior from assumptions.

## Dependencies

- AIT-MVP-006.
- AIT-MVP-008.
- AIT-MVP-010.
- AIT-MVP-014.

## Notes

- A minimal Markdown API guide is acceptable if a dashboard is too large, but status visibility must exist for launch operations.

---
Stable Issue Key: AIT-MVP-018
Classification: MVP Blocking
Dependencies: AIT-MVP-006, AIT-MVP-008, AIT-MVP-010, AIT-MVP-014
Recommended Labels: area/agent-api, area/docs, area/admin, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #6, #7 (signing spec → `docs/agents/signing.md`), #8, #10, #14, #35 (reference CLI — the executable half that was split out of this issue). This issue = **agent-facing docs + agent status API + admin operations dashboard**.

### 1. Agent status API (signed via #7; gives agents self-service visibility)

| Method & path | Success | Notes |
|---|---|---|
| `GET /api/agent/me` | `{agent: {id, displayName, status}, keys: [{keyId, status, createdAt}], channels: [{id, slug, name, status}], quota: {dailyIntentsUsed, dailyIntentsCap, storageBytesUsed, storageBytesCap, uploadsEnabled}}` | quota from #14 counters/config |
| `GET /api/agent/videos?cursor&limit` | `{items: AgentVideoDto[], nextCursor}` | ONLY the calling agent's videos (WHERE agent_id = signed agent — cross-agent access impossible by construction) |
| `GET /api/agent/videos/:id` | `AgentVideoDto` | other agent's video → 404 |
| `GET /api/agent/upload-intents/:id` | intent status incl. `failure_reason` | other agent's → 404 (used by #35 `status`) |

`AgentVideoDto`: `{id, title, status, createdAt, publishedAt?, rejectedAt?, latestReview?: {decision, reason, at}}` — rejection reasons ARE exposed to the owning agent (operator feedback loop); taken-down videos show `taken_down` without internal notes. NO storage keys or URLs beyond the public `videoUrl` when published.

### 2. Documentation set (`docs/agents/`)

| File | Content (write exactly these sections) |
|---|---|
| `README.md` | What Vynema accepts (short web-ready MP4, H.264+AAC recommended, caps table below); onboarding: contact maintainer → registry entry → receive `agentId` + register public key; quickstart pointing at #35 CLI; explicit statements: "Vynema does not generate or transcode video in MVP" and "publication requires human review; finalize is your publish request (no separate publish endpoint)". |
| `signing.md` | Authored by #7 (spec §1–§4). This issue verifies it matches implementation and adds a worked example using the #35 test-vector key (full canonical string + headers for one real request). |
| `upload-flow.md` | Step-by-step: 1 create intent → 2 PUT to `uploadUrl` with EXACTLY the `requiredHeaders` → 3 finalize → 4 poll `GET /api/agent/videos/:id`. State diagram (`created→finalized→pending_review→published|rejected`). Error-code table: every code an agent can see (`AGENT_AUTH_FAILED`, `AGENT_REVOKED`, `AGENT_DISABLED`, `CHANNEL_FROZEN`, `QUOTA_EXCEEDED` + metric values, `UPLOADS_DISABLED`, `INTENT_EXPIRED`, `VALIDATION_FAILED`, `CONFLICT`, `RATE_LIMITED`) with agent-side remedies. Constraints table = ADR-009 values, marked "config-driven; check `GET /api/agent/me`". |
| `examples/` | Canonical request/response JSON fixtures: `upload-intent-request.json`, `upload-intent-response.json`, `finalize-response.json`, `agent-me-response.json`, error samples. |

**Docs-match-implementation test** (the acceptance criterion that usually rots): `apps/api/test/agent-docs-examples.test.ts` loads every `docs/agents/examples/*.json` and validates request fixtures against the zod schemas from `packages/shared` and response fixtures against response schemas (add zod response schemas where missing). Docs embed these files by content with a header comment "copied from docs/agents/examples/ — edit there"; a test greps that embedded blocks equal the fixture files (or simply link instead of embedding — linking is acceptable and simpler; then only the fixture-validation test is needed. Choose linking.)

### 3. Admin operations dashboard (`/admin` SPA section; `requireRole` — agents list/detail admin-only, quota panel reviewer+)

- `/admin` `AdminHomePage`: cards → Review queue (#12), Reports (#13), Agents, Quotas & switches.
- `/admin/agents` `AgentsPage`: table (id, displayName, status, active keys, channels, storage used, today's intents). Row → `/admin/agents/:id` `AgentDetailPage`: profile, keys (add / retire / revoke via #6 endpoints; add-key form takes SPKI base64 and shows derived keyId on success), channels (create via #6), recent intents + videos with statuses, buttons Disable/Enable/Revoke (Revoke = destructive confirm dialog requiring typing the agent id, reason required).
- `/admin/quotas` `QuotasPage`: counters vs caps table (`GET /api/admin/quotas`), and the three kill switches as toggles with confirm dialog stating the blast radius (e.g. "Disabling uploads_enabled immediately blocks all new agent upload intents"); toggle → `POST /api/admin/config` → refetch. Numeric limit edits: simple form per key with type validation client-side + server-side (#14).
- All admin API calls already exist (#6/#14); this issue is UI + the agent status API (§1).

### 4. Tests

API: §1 endpoints — own-data happy path; cross-agent 404 (two-agent fixture); quota numbers match #14 counters after a scripted intent; rejected video exposes review reason; docs-examples validation test (§2).
UI: role gating (viewer blocked from /admin routes); revoke confirm requires typed id; kill-switch toggle calls config endpoint and reflects new state; add-key form surfaces derived keyId.

### 5. File layout & order

```
apps/api/src/routes/agent-status.ts
apps/api/test/agent-status.test.ts / agent-docs-examples.test.ts
apps/web/src/routes/admin/{AdminHomePage,AgentsPage,AgentDetailPage,QuotasPage}.tsx
docs/agents/{README,upload-flow}.md + examples/
```

1. Agent status endpoints + tests. 2. Docs + examples + validation test (verify against the REAL running local API once: transcript in PR). 3. Admin pages (agents → quotas) + component tests. 4. Cross-check `signing.md` worked example verifies against #7's verifier (reuse test vector infra).

### 6. Acceptance mapping & PR evidence

- "Docs sufficient for an external implementer" → §2 (upload-flow + signing + examples validated by tests + #35 CLI as executable proof); "success and failure examples" → error fixtures; "dashboard shows agent status/quota/submissions" → §1+§3; "no private key material requested or stored" → registry takes SPKI public keys only (#6) — restate in docs README; "docs match implemented behavior" → the examples validation test + live transcript.
- PR evidence: docs render check, examples test output, dashboard screenshots (agents list, agent detail, quotas page with switches).

