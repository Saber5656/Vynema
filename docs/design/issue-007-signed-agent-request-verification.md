# Issue #7: Implement signed agent request verification and nonce replay protection

GitHub issue: https://github.com/Saber5656/Vynema/issues/7

This file is the canonical implementation design for issue #7. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement signed request verification for agent upload-intent and finalize endpoints, including timestamp checks, body hash validation, key id lookup, and single-use nonces.

## Scope

- Define canonical request format for signing.
- Verify agent id, key id, timestamp, nonce, request body hash, and signature.
- Reject stale timestamps and reused nonces.
- Persist nonce usage with short expiry.
- Add deterministic test vectors and failure cases.

## Out Of Scope

- Human auth.
- Public agent onboarding.

## Acceptance Criteria

- [ ] Valid signed requests pass verification for active agents and assigned keys.
- [ ] Invalid signature, stale timestamp, body hash mismatch, unknown key id, revoked agent, and replayed nonce are rejected.
- [ ] Nonce records expire safely and cannot be reused within the validity window.
- [ ] Request verification does not log sensitive request material.
- [ ] Test vectors document how agents should sign requests.
- [ ] Security review confirms replay and canonicalization risks are addressed.

## Dependencies

- AIT-MVP-006.

## Notes

- Canonicalization must be stable enough for external agent implementers.

---
Stable Issue Key: AIT-MVP-007
Classification: MVP Blocking
Dependencies: AIT-MVP-006
Recommended Labels: area/agent-auth, area/security, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> **This is the normative signing specification for Vynema.** #35 (reference CLI) mirrors it; if they diverge, THIS issue wins. Prerequisites: #4 (`agent_nonces`), #6 (`getVerificationContext`), #19 (errors). Implements ADR-005.

### 1. Wire format

Request headers (all required on signed endpoints):

| Header | Value |
|---|---|
| `x-vynema-agent-id` | e.g. `agt_ab12cd34ef56` |
| `x-vynema-key-id` | 16 hex chars |
| `x-vynema-timestamp` | unix **seconds**, decimal string (the only seconds-based timestamp in the system, per ADR-012) |
| `x-vynema-nonce` | UUID v4 string (36 chars); any unique ≤64-char token accepted, UUID recommended |
| `x-vynema-content-sha256` | lowercase hex SHA-256 of the exact raw request body bytes; empty body ⇒ `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `x-vynema-signature` | base64 (standard, padded) Ed25519 signature over the canonical string |

### 2. Canonical string (v1 — byte-exact)

```
"VYNEMA1" LF method LF pathWithQuery LF timestamp LF nonce LF bodySha256Hex LF agentId LF keyId
```

- `LF` = `\n` (0x0A), no trailing LF. UTF-8 encoding.
- `method`: uppercase (`POST`).
- `pathWithQuery`: `new URL(request.url)` → `url.pathname + url.search`, exactly as received; starts with `/api/`. No percent-decoding, no re-encoding, no trailing-slash normalization. **Clients must sign exactly the path+query they send.**
- `timestamp`/`nonce`/`bodySha256Hex`/`agentId`/`keyId`: the literal header values.

### 3. Verification algorithm (`apps/api/src/lib/middleware/agent-signature.ts`, exported as `requireAgentSignature()`)

Order is normative:

1. Read the 6 headers. Any missing/empty → **fail** (`missing_headers`).
2. `timestamp` must be 1–12 digit decimal; `|nowSeconds - timestamp| > 300` → fail (`stale_timestamp`).
3. Read the body ONCE as `ArrayBuffer` (reject > 65536 bytes → fail `body_too_large` — signed endpoints carry metadata JSON only, never media). Compute SHA-256; timing-safe compare with header (compare as bytes after hex-decode) → mismatch fails (`body_hash_mismatch`). Store buffer via `c.set("rawBody", buf)`; downstream handlers parse JSON from it, never from `c.req` again.
4. `getVerificationContext(agentId, keyId)` (#6). Null → fail (`unknown_agent_or_key`). `agentStatus="revoked"` → **403 `AGENT_REVOKED`** (distinct, final). `agentStatus="disabled"` → 403 `AGENT_DISABLED` (add this code to #19's registry). `keyStatus != "active"` → fail (`inactive_key`).
5. Import SPKI key (cache per-isolate in a `Map<keyId, CryptoKey>`), `crypto.subtle.verify("Ed25519", key, sigBytes, utf8(canonical))`. Invalid base64 or false → fail (`bad_signature`).
6. **Nonce claim (only after signature is valid, so unauthenticated garbage cannot pollute the table):** `INSERT INTO agent_nonces (agent_id, nonce, seen_at, expires_at) VALUES (?,?,?,now+86400_000)`. UNIQUE violation → fail (`replayed_nonce`).
7. Success: `c.set("agent", { agentId, keyId })`; continue.

**All failures in steps 1–3, 4(unknown/inactive-key), 5, 6 return the SAME external response**: `401 {"error":{"code":"AGENT_AUTH_FAILED","message":"Agent authentication failed"}}` — no oracle about which check failed. The internal reason goes ONLY to the audit event `agent.auth_failed` (metadata: `{reason, claimedAgentId}` — never the signature or body). Steps 4 revoked/disabled return their distinct 403 codes (registry state is not an oracle worth hiding; agents must know to stop).

Replay containment: nonce uniqueness covers 24 h ≫ the ±300 s freshness window, so a captured request can never be replayed: inside the window the nonce blocks it, outside the timestamp blocks it. Purge of expired nonces = #10's cron.

Also mount `rateLimit("agent_any", …)` (per claimed agentId, keyed pre-verification; fail-closed) in front of the verifier on all agent routes.

### 4. Client guidance (goes into `docs/agents/signing.md`, finished by #18)

Sign with the same canonical string; send within 300 s; never reuse nonces; on `AGENT_AUTH_FAILED` check (in order): clock skew, body byte-equality (sign the exact serialized bytes you send), path+query exactness, key registration status.

### 5. Test plan (`apps/api/test/agent-signature.test.ts`)

Fixtures: generate an Ed25519 keypair in-test (node:crypto in vitest-pool-workers supports WebCrypto — use `crypto.subtle.generateKey`), register agent+key via #6 repo directly.

| # | Case | Expect |
|---|---|---|
| 1 | valid signed POST (JSON body) | 200, handler sees parsed body |
| 2 | valid signed GET (empty body, empty-string hash) | 200 |
| 3 | each header missing (6 cases, table-driven) | 401 AGENT_AUTH_FAILED |
| 4 | timestamp now−301s / now+301s | 401; now±299s → pass |
| 5 | body altered after signing | 401 |
| 6 | hash header altered to match altered body but signature old | 401 (signature covers hash) |
| 7 | wrong keyId (other agent's valid key) | 401 |
| 8 | retired key / revoked key | 401 |
| 9 | disabled agent | 403 AGENT_DISABLED |
| 10 | revoked agent | 403 AGENT_REVOKED |
| 11 | exact replay (same everything) | first 200, second 401 |
| 12 | same nonce, different agent | both 200 (nonce is per-agent) |
| 13 | query-string added after signing | 401 |
| 14 | signature not base64 | 401 (no 500) |
| 15 | body 65537 bytes | 401/413 path, no hash computed |
| 16 | **all vectors from `docs/agents/signing-test-vectors.json` (#35) verify** | pass (skip with TODO if #35 not merged yet, then unskip) |
| 17 | audit on failure | `agent.auth_failed` row exists with reason, WITHOUT signature material |

### 6. File layout & order

```
apps/api/src/lib/agent-canonical.ts     # buildCanonicalString(parts) — pure, shared shape with #35
apps/api/src/lib/middleware/agent-signature.ts
apps/api/test/agent-signature.test.ts
docs/agents/signing.md                  # spec §1–§4 verbatim (source of truth for external implementers)
```

1. `agent-canonical.ts` + unit tests (string building only). 2. Middleware steps 1–5 + tests 1–10, 13–15. 3. Nonce claim + tests 11–12. 4. Audit + test 17. 5. `signing.md`. 6. Vector cross-check (test 16) when #35 lands.

### 7. Acceptance mapping & PR evidence

- Every issue acceptance bullet maps to tests: valid pass (1–2), invalid signature/stale/hash/unknown-key/revoked/replay rejections (4–11), nonce expiry safety (§3.6 + purge in #10), no sensitive logging (17), deterministic vectors (16 + #35).
- PR evidence: full test table output + security impact note ("agent identity boundary — canonicalization & replay") + explicit statement that error responses are non-oracular.

