# Issue #35: Build reference agent client CLI and signing test vectors

GitHub issue: https://github.com/Saber5656/Vynema/issues/35

This file is the canonical implementation design for issue #35. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Build a reference agent client CLI (`tools/agent-cli`) that exercises the full agent publication flow — key generation, request signing, upload intent, direct R2 upload, and finalize — plus deterministic signing test vectors.

Split out of #18: #18 keeps documentation and the admin status view; this issue owns the executable reference client. The CLI is also a dependency of #20 (E2E agent-flow tests) and #24 (seeding launch content), and it validates that #7's signing spec is implementable by external parties.

## Scope

- Node.js CLI under `tools/agent-cli` with commands: `keygen`, `sign`, `upload`, `status`, `test-vectors`.
- Deterministic signing test-vector generator + committed vectors file shared with #7's verifier tests.
- Documentation of CLI usage in `docs/agents/reference-client.md`.

## Out Of Scope

- Video generation (agents bring their own MP4).
- Publishing docs for the HTTP API themselves (#18).
- Server-side verification (#7) and endpoints (#8, #10).

## Acceptance Criteria

- [ ] `keygen` produces an Ed25519 keypair; private key saved locally with 0600 perms and never printed; public key printed for registry onboarding.
- [ ] `upload` performs intent → PUT → finalize against a configurable base URL and prints the submission state.
- [ ] `sign` signs an arbitrary request and prints headers, for debugging.
- [ ] `test-vectors` subcommand regenerates `docs/agents/signing-test-vectors.json` deterministically from fixed inputs; #7 verifier tests consume the same file.
- [ ] CLI never sends the private key anywhere; only signatures leave the machine.
- [ ] Works against `wrangler dev` locally end-to-end once #8–#10 exist.

## Dependencies

- #34 (skeleton), #7 (signing spec — the canonical string defined there is normative), #8, #10 (endpoints to call; CLI can be built against the spec before they land, using mocked responses in tests).

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
    client.ts             # HTTP flows: createIntent, putObject, finalize, getStatus
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

### 4. Upload flow (`client.ts`, command `upload`)

```
vynema-agent upload --base-url http://127.0.0.1:8787 --allow-insecure-http --agent-id <id> --key ~/.vynema/agent-key.pem \
  --channel <channelId> --file ./video.mp4 [--thumbnail ./thumb.jpg] \
  --title "..." --description "..." --model "gen-model-name" --prompt-summary "..."
```

1. Compute `sha256` + byte size of the MP4 (and thumbnail if given).
2. `POST /api/agent/upload-intents` (signed) with the JSON body defined in #8 §API contract.
3. Receive `{intentId, video: {uploadUrl, key, requiredHeaders}, thumbnail?: {uploadUrl, key, requiredHeaders}, expiresAt}`.
4. `PUT` the file bytes to `uploadUrl` with EXACTLY the returned `requiredHeaders` map for that object, including signed `content-type`, `content-length`, and checksum headers. No Vynema signing headers are sent on the R2 PUT (the URL itself is the capability). Retry once on network failure; abort if HTTP status ≥ 400.
5. `POST /api/agent/upload-intents/{intentId}/finalize` (signed, empty JSON body `{}`).
6. Print resulting state (`pending_review`) and video id.
7. `status --video <id>` calls `GET /api/agent/videos/{id}` (signed) and prints status.

All HTTP via global `fetch` (Node 22). Print the request id from `x-request-id` response header on errors.

### 5. Test vectors (`vectors.ts`)

- Fixed inputs (hardcoded): deterministic public test vector seed stored as non-secret bytes in `vectors.ts`; `vectors.ts` derives or mocks an Ed25519 test key at generation time and never commits a PKCS8 private key file. Use agentId `agt_testvector01`, timestamp `1750000000`, nonce `00000000-0000-4000-8000-000000000001`, and three request cases: empty body GET, JSON body POST, and finalize POST.
- Output `docs/agents/signing-test-vectors.json`: array of `{name, method, path, body, timestamp, nonce, agentId, keyId, bodySha256, canonicalString, signature, publicKeySpkiBase64}`. The committed JSON must contain no private key material.
- `test/signing.test.ts` regenerates and deep-equals against the committed file. Issue #7's verifier test imports the same JSON and must verify every vector.

### 6. Step-by-step order

1. `signing.ts` + unit tests (pure, no network). 2. `keys.ts` + keygen command. 3. `vectors.ts` + committed vectors generated without any private-key fixture file. 4. `client.ts` against mocked `fetch` (vitest `vi.stubGlobal`). 5. `cli.ts` wiring + `docs/agents/reference-client.md`. Checkpoint after each step: `pnpm --filter @vynema/agent-cli test`.

### 7. Security guardrails

- Do not commit private keys, including test-only PKCS8 PEM fixtures. Generate or mock signing keys during test/vector generation so `scripts/security/scan-secrets.py` does not need an allowlist exception.
- CLI refuses to run `upload` against a non-`https` base URL unless `--allow-insecure-http` is passed (local dev).

### 8. PR / evidence checklist

- [ ] Vector regeneration test green; #7 cross-verification test green (or explicitly noted as pending until #7 merges).
- [ ] Demo transcript of `upload` against local dev (once #8/#10 exist) or against mock.
- [ ] Security note: vectors contain no private key material and require no secret-scanner allowlist entry.

---
Stable Issue Key: AIT-MVP-027
Classification: MVP Blocking
Dependencies: #34, #7, #8, #10
Labels: area/agent-api, area/testing, type/implementation, priority/p0, mvp-blocking
