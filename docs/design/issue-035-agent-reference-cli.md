# Issue #35 (#35S): Build reference agent keygen, signing, and deterministic vectors

GitHub issue: https://github.com/Saber5656/Vynema/issues/35

This file is the canonical implementation design for issue #35. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Build the foundational reference-agent key generation, canonical request
signing, and committed public test vectors consumed by #7 and #46. CI
deterministically validates the vectors from public material only. The networked
upload/finalize/status CLI is the split child #56 (#35U).

## Scope

- Provide `keygen`, `sign`, and `test-vectors` commands under `tools/agent-cli`.
- Implement reusable Ed25519 key handling and canonical signed-header generation.
- Maintain committed public vectors consumed by #7 verifier tests.
- Provide deterministic public-only vector validation and an explicit local vector
  replacement flow whose private key remains outside the repository and CI.
- Document local private-key handling, public-key registration, vector validation,
  and controlled vector replacement.

## Out Of Scope

- Upload-intent, capability PUT, finalize, and status network flows (#56).
- Video generation.
- HTTP API documentation (#18).
- Server-side verification (#7) or API endpoints (#8/#10/#18).

## Acceptance Criteria

- [ ] `keygen` creates an Ed25519 keypair with private mode 0600 and never prints private material.
- [ ] `sign` produces canonical headers byte-for-byte compatible with #7.
- [ ] `test-vectors verify` deterministically validates every field and signature in
      `docs/agents/signing-test-vectors.json` using public inputs and keys only.
- [ ] Signing tests use ephemeral Ed25519 keypairs; optional vector replacement
      requires an explicit private-key path outside the repository and is not run in CI.
- [ ] #7 verifier tests consume and verify every committed vector.
- [ ] No private-key fixture, fixed seed, private-key derivation material, or
      secret-scanner allowlist exception is committed.
- [ ] Security review confirms CI receives only public vector material and no private
      material is written to repository files, command output, or logs.

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
    vectors.ts            # public vector validation + explicit local replacement
  test/
    signing.test.ts       # ephemeral signing + public vector validation
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

- Fixed **public** inputs: agentId `agt_testvector01`, timestamp `1750000000`,
  nonce `00000000-0000-4000-8000-000000000001`, and three request cases:
  empty body GET, JSON body POST, and finalize POST. Do not embed a signing seed,
  private key, or any bytes from which a private key can be reconstructed.
- Committed artifact: `docs/agents/signing-test-vectors.json`, an array of
  `{name, method, path, body, timestamp, nonce, agentId, keyId, bodySha256,
  canonicalString, signature, publicKeySpkiBase64}`. Every field is public; the
  artifact contains no private-key material or derivation input.
- `test-vectors verify` and `test/signing.test.ts` must, using the committed public
  artifact only:
  1. enforce the schema, unique names, fixed case order, and base64/hex encodings;
  2. recompute `bodySha256`, `canonicalString`, and `keyId` from public inputs;
  3. import `publicKeySpkiBase64` and verify each Ed25519 `signature`; and
  4. fail mutation tests for a changed request field, hash, canonical byte,
     public key, or signature.
- Signing implementation tests generate an ephemeral Ed25519 keypair per test,
  sign the same injected `now`/`nonce` input twice, require byte-identical
  signatures, verify them with the ephemeral public key, and assert that private
  material never appears in output or logs. The ephemeral key is not serialized
  into a repository fixture.
- Optional maintainer-only replacement uses
  `test-vectors generate --private-key <external-path> --out <path>`. The private
  key has no default, must resolve outside the repository checkout, is never
  printed or copied, and is supplied manually from local storage. This command is
  not run in CI. With the same external key and fixed public inputs it produces the
  same public artifact; changing the vector key is an intentional reviewed
  replacement. Only the public JSON output may be committed.
- Issue #7's verifier test imports the same committed JSON and must verify every
  vector independently.

### 6. Step-by-step order

#35S: 1. `signing.ts` + ephemeral-key pure tests. 2. `keys.ts` + keygen. 3.
`vectors.ts` public-only validation + committed public vectors. 4.
`sign`/`test-vectors verify` command wiring, optional local replacement command,
and signing docs. Checkpoint after each step:
`pnpm --filter @vynema/agent-cli test`.

#56 then adds `client.ts`, upload/status command wiring, mocked contracts, and the live local transcript after #8, #10, and #18 merge.

### 7. Security guardrails

- Do not commit private keys, test-only PKCS8 PEM fixtures, fixed signing seeds,
  or any encoded/derived material sufficient to reconstruct a private key.
- CI and default tests validate vectors using public inputs, public keys, and
  signatures only. Signing tests use in-memory ephemeral keypairs. Vector
  replacement accepts only an explicit private-key path outside the checkout and
  must never print, copy, or persist that key.
- `scripts/security/scan-secrets.py` must pass without an allowlist exception. A
  passing scan complements but does not replace the no-private-material review.
- #56's CLI refuses to run `upload` against a non-`https` base URL unless `--allow-insecure-http` is passed (local dev).

### 8. PR / evidence checklist

- [ ] Public-only vector validation and mutation tests green; #7
      cross-verification test green (or explicitly noted as pending until #7 merges).
- [ ] Ephemeral signing tests prove deterministic signing and verify that output and
      logs contain no private material.
- [ ] #35S security note: repository and CI contain no signing seed, private-key
      fixture, or derivation material, and require no secret-scanner allowlist entry.
- [ ] #56 evidence (not #35S): mocked command contracts, secret-safe output scan, and a live upload/finalize/status transcript after #8/#10/#18.

---
Stable Issue Key: AIT-MVP-035
Classification: MVP Blocking
Dependencies: #34, #7 design contract
Labels: area/agent-api, area/testing, type/implementation, priority/p0, mvp-blocking
