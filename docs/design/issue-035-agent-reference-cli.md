# Issue #35 (#35S): Build reference agent keygen, signing, and deterministic vectors

GitHub issue: https://github.com/Saber5656/Vynema/issues/35

This file is the canonical implementation design for issue #35. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Build the foundational reference-agent key generation, canonical request
signing, and deterministic public test vectors consumed by #7 and #46. The
networked upload/finalize/status CLI is the split child #56 (#35U).

## Scope

- Provide `keygen`, `sign`, and `test-vectors` commands under `tools/agent-cli`.
- Implement reusable Ed25519 key handling and canonical signed-header generation.
- Generate committed deterministic vectors consumed by #7 verifier tests.
- Document local private-key handling, public-key registration, and vector regeneration.

## Out Of Scope

- Upload-intent, capability PUT, finalize, and status network flows (#56).
- Video generation.
- HTTP API documentation (#18).
- Server-side verification (#7) or API endpoints (#8/#10/#18).

## Acceptance Criteria

- [ ] `keygen` creates an Ed25519 keypair with private mode 0600 and never prints private material.
- [ ] `sign` produces canonical headers byte-for-byte compatible with #7.
- [ ] `test-vectors` deterministically regenerates `docs/agents/signing-test-vectors.json`.
- [ ] #7 verifier tests consume and verify every committed vector.
- [ ] No private-key fixture or secret-scanner allowlist exception is committed.
- [ ] Security review confirms only public vector material leaves the process/repository.

## Dependencies

- #34.
- #7's frozen canonical-string design contract. #7 merge is not required;
  #7's vector-consumption integration and ready PR consume #35S.

[#56](https://github.com/Saber5656/Vynema/issues/56) owns upload/finalize/status
and depends on #8, #10, and #18.

---

## Implementation Plan & Design (2026-07-02)

> Normative. The signing algorithm MUST byte-for-byte match issue #7 §Canonical string. If the two designs ever disagree, #7 wins — comment on both issues instead of guessing.

### 1. Package layout

```
tools/agent-cli/
  package.json            # name: @vynema/agent-cli, bin: { "vynema-agent": "./dist/cli.js" }
  tsconfig.json
  src/
    cli.ts                # command dispatch (use `commander` ^12)
    keys.ts               # keygen/load/save (Ed25519 via node:crypto)
    signing.ts            # canonical string + signature (pure functions, no I/O)
    vectors.ts            # test vector generation
  test/
    signing.test.ts       # asserts vectors file matches regenerated output
```

### 2. Key handling (`keys.ts`)

- `keygen --out <dir>` (default `~/.vynema/`): `crypto.generateKeyPairSync("ed25519")`.
  - Write `agent-key.pem` (PKCS8 PEM, mode 0o600) and `agent-key.pub.pem` (SPKI PEM).
  - Print: SPKI public key as base64 (single line, no PEM armor) and its `keyId` = first 16 hex chars of SHA-256 of the raw 32-byte public key. This exact `keyId` derivation is normative and shared with #6.
- Never log or transmit the private key. Add an explicit unit test asserting `sign` output contains no key material.

### 3. Signing (`signing.ts`) — mirror of #7

```
canonical = "VYNEMA1\n" + METHOD + "\n" + PATH_WITH_QUERY + "\n" + TIMESTAMP + "\n"
          + NONCE + "\n" + BODY_SHA256_HEX + "\n" + AGENT_ID + "\n" + KEY_ID
signature = base64(ed25519_sign(privateKey, utf8(canonical)))
```

- `METHOD` uppercase; `PATH_WITH_QUERY` starts with `/api/...`, no origin; `TIMESTAMP` = seconds since epoch, decimal string; `NONCE` = `crypto.randomUUID()`; `BODY_SHA256_HEX` = lowercase hex SHA-256 of the exact request body bytes (empty body = hash of empty string).
- Headers emitted: `x-vynema-agent-id`, `x-vynema-key-id`, `x-vynema-timestamp`, `x-vynema-nonce`, `x-vynema-content-sha256`, `x-vynema-signature`.
- Export pure function `buildSignedHeaders(input: {method, path, body, agentId, keyId, privateKey, now?, nonce?}): Record<string,string>` — `now`/`nonce` injectable for deterministic tests.

### Split child: #56 / #35U upload, finalize, and status CLI

The following networked flow is canonical for
[#56](https://github.com/Saber5656/Vynema/issues/56), not part of the #35S PR.
#56 adds `client.ts`, upload/status command wiring, mocked contracts, and the
live local transcript after #8, #10, and #18 merge.

#### 4. Upload flow (`client.ts`, command `upload`)

```
vynema-agent upload --base-url http://127.0.0.1:8787 --allow-insecure-http --agent-id <id> --key ~/.vynema/agent-key.pem \
  --channel <channelId> --file ./video.mp4 [--thumbnail ./thumb.jpg] \
  --title "..." --description "..." --model "gen-model-name" --prompt-summary "..."
```

1. Compute `sha256` + byte size of the MP4 (and thumbnail if given).
2. `POST /api/agent/upload-intents` (signed) with the JSON body defined in #8 §API contract.
3. Receive the shared `UploadIntentCreatedDto`: `{intentId, video: {uploadUrl, requiredHeaders}, thumbnail?: {uploadUrl, requiredHeaders}, expiresAt}`. The schema is exported by #8 and contains no storage key/BLOB id.
4. `PUT` file bytes to `uploadUrl` with exactly the returned `requiredHeaders`, including content type/length and the one-time upload token. No agent-signing headers are sent on this media PUT because the intent/kind-scoped token is the capability. Retry once only on a network failure before a response; on ambiguous completion, query intent state rather than blindly reusing the token.
5. `POST /api/agent/upload-intents/{intentId}/finalize` (signed, empty JSON body `{}`).
6. Print resulting state (`pending_review`) and video id.
7. `status --video <id>` calls `GET /api/agent/videos/{id}` (signed) and prints status.

All HTTP via global `fetch` (Node 22). Print the request id from `x-request-id` response header on errors.

### 5. Test vectors (`vectors.ts`)

- Fixed inputs (hardcoded): deterministic public test vector seed stored as non-secret bytes in `vectors.ts`; `vectors.ts` derives or mocks an Ed25519 test key at generation time and never commits a PKCS8 private key file. Use agentId `agt_testvector01`, timestamp `1750000000`, nonce `00000000-0000-4000-8000-000000000001`, and three request cases: empty body GET, JSON body POST, and finalize POST.
- Output `docs/agents/signing-test-vectors.json`: array of `{name, method, path, body, timestamp, nonce, agentId, keyId, bodySha256, canonicalString, signature, publicKeySpkiBase64}`. The committed JSON must contain no private key material.
- `test/signing.test.ts` regenerates and deep-equals against the committed file. Issue #7's verifier test imports the same JSON and must verify every vector.

### 6. Step-by-step order

#35S: 1. `signing.ts` + pure tests. 2. `keys.ts` + keygen. 3. `vectors.ts` + committed public vectors. 4. `sign`/`test-vectors` command wiring and signing docs. Checkpoint after each step: `pnpm --filter @vynema/agent-cli test`.

#56 then adds `client.ts`, upload/status command wiring, mocked contracts, and the live local transcript after #8, #10, and #18 merge.

### 7. Security guardrails

- Do not commit private keys, including test-only PKCS8 PEM fixtures. Generate or mock signing keys during test/vector generation so `scripts/security/scan-secrets.py` does not need an allowlist exception.
- #56's CLI refuses to run `upload` against a non-`https` base URL unless `--allow-insecure-http` is passed (local dev).

### 8. PR / evidence checklist

- [ ] Vector regeneration test green; #7 cross-verification test green (or explicitly noted as pending until #7 merges).
- [ ] #35S security note: vectors contain no private key material and require no secret-scanner allowlist entry.
- [ ] #56 evidence (not #35S): mocked command contracts, secret-safe output scan, and a live upload/finalize/status transcript after #8/#10/#18.

---
Stable Issue Key: AIT-MVP-035
Classification: MVP Blocking
Dependencies: #34, #7 design contract
Labels: area/agent-api, area/testing, type/implementation, priority/p0, mvp-blocking
