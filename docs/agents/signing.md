# Vynema agent request signing

Vynema agent endpoints accept only requests signed by a registered Ed25519 agent key. This guide
defines the public client contract and the local reference commands implemented by
`tools/agent-cli`. The server-side normative contract remains
[`issue-007-signed-agent-request-verification.md`](../design/issue-007-signed-agent-request-verification.md).

The reference CLI in this issue generates keys and headers only. Upload, finalize, and status
network flows belong to issue #56 and are intentionally not implemented here.

## Build the local reference CLI

Use the repository-required Node.js 22 and pnpm 10 versions, then build the workspace package:

```sh
pnpm --filter @vynema/agent-cli build
node tools/agent-cli/dist/cli.js --help
```

The examples below use `node tools/agent-cli/dist/cli.js` so it is explicit that no network request
is sent by the signing command.

## Generate and register a key

Generate a keypair outside the repository checkout:

```sh
node tools/agent-cli/dist/cli.js keygen --out "$HOME/.vynema"
```

If `--out` is omitted, `$HOME/.vynema` is the default. The command creates:

- `agent-key.pem`: PKCS8 Ed25519 private key, mode `0600`;
- `agent-key.pub.pem`: SPKI Ed25519 public key; and
- two stdout lines, `publicKeySpkiBase64=...` and `keyId=...`, for registration.

The private key is never printed, and existing key files are never overwritten. Keep the private
file outside the checkout, do not attach it to issues or logs, and do not send it to Vynema. Only
the public SPKI base64 and derived key ID are registered with the platform.

The current reference CLI fails closed on Windows before reading or creating private-key files.
Node's POSIX `mode` option cannot establish or verify a restrictive Windows ACL, so `keygen`,
`sign`, and `test-vectors generate` are unavailable there until an ACL implementation can prove
exclusive key access. Public-only `test-vectors verify` remains available. Run private-key commands
on a supported POSIX system rather than weakening the key-confidentiality check.

`keyId` is the first 16 lowercase hexadecimal characters of SHA-256 over the raw 32-byte Ed25519
public key. It is not hashed over the 44-byte SPKI wrapper. A canonical Ed25519 SPKI is exactly the
12-byte prefix `302a300506032b6570032100` followed by those 32 raw public-key bytes.

## Canonical string

The signed bytes are UTF-8 for these eight fields joined by a single LF (`0x0A`), with no trailing
LF:

```text
VYNEMA1
METHOD
PATH_WITH_QUERY
TIMESTAMP
NONCE
BODY_SHA256_HEX
AGENT_ID
KEY_ID
```

The fields are defined as follows:

| Field | Exact rule |
|---|---|
| `METHOD` | Uppercase HTTP method. |
| `PATH_WITH_QUERY` | Exact `/api/...` WHATWG URL-canonical pathname plus query sent on the wire; no origin, decoding, re-encoding, slash normalization, or fragment. Literal dot segments, backslashes, spaces, and non-ASCII characters are rejected because URL parsing rewrites them; supply their canonical path or percent-encoded wire form. |
| `TIMESTAMP` | Unix seconds as a 1–12 digit decimal string. |
| `NONCE` | A new value for every request, at most 64 characters; UUID v4 is recommended. |
| `BODY_SHA256_HEX` | Lowercase SHA-256 hex of the exact request body bytes. The empty body hash is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. |
| `AGENT_ID` | Literal registered agent ID. |
| `KEY_ID` | Literal 16-character lowercase key ID registered for that agent. |

The signature is standard padded base64 for the 64-byte Ed25519 signature over those canonical
bytes.

## Produce signed headers

For an inline UTF-8 body:

```sh
node tools/agent-cli/dist/cli.js sign \
  --method POST \
  --path '/api/agent/upload-intents?mode=exact' \
  --agent-id agt_0123456789ab \
  --key "$HOME/.vynema/agent-key.pem" \
  --body '{"title":"exact serialized bytes"}'
```

For arbitrary or already-serialized bytes, prefer `--body-file` so shell quoting cannot change the
payload:

```sh
node tools/agent-cli/dist/cli.js sign \
  --method POST \
  --path '/api/agent/upload-intents' \
  --agent-id agt_0123456789ab \
  --key "$HOME/.vynema/agent-key.pem" \
  --body-file ./request-body.json
```

The command derives the key ID from the private key's public identity and prints only this JSON
header object:

- `x-vynema-agent-id`
- `x-vynema-key-id`
- `x-vynema-timestamp`
- `x-vynema-nonce`
- `x-vynema-content-sha256`
- `x-vynema-signature`

Use `--key-id` to require a known registered key ID and fail if the local key differs. Omit
`--timestamp` and `--nonce` for real requests so current Unix seconds and a random UUID are used.
Those options exist only for deterministic testing and debugging. The body bytes later sent on the
wire must be byte-for-byte identical to the bytes supplied to `sign`, and the sent path plus query
must exactly match `--path`. The CLI parses `--path` against a dummy origin and requires
`url.pathname + url.search` to remain byte-for-byte unchanged, matching the server verifier.

## Public deterministic vectors

[`signing-test-vectors.json`](signing-test-vectors.json) contains three ordered cases: an empty-body
GET, a JSON POST, and a finalize POST. Each entry contains only fixed request input, a body hash,
canonical text, an Ed25519 signature, and its SPKI public key. It contains no private key, signing
seed, fixed private derivation input, or secret-scanner exception.

CI and local tests verify the artifact using public material only:

```sh
node tools/agent-cli/dist/cli.js test-vectors verify \
  --file docs/agents/signing-test-vectors.json
```

Verification enforces the exact schema and case order, recomputes the body hash, canonical string,
and key ID, imports the canonical Ed25519 SPKI, and verifies every signature. Tests also require
failures after mutating a request field, hash, canonical byte, public key, or signature. Issue #7's
server-verifier tests are required to consume this same artifact independently when #7 lands.

## Controlled vector replacement

Vector replacement is maintainer-only and is never a CI step. It has no default private key path.
Run it from the repository checkout and pass a mode-`0600` Ed25519 key stored outside that checkout:

```sh
node tools/agent-cli/dist/cli.js test-vectors generate \
  --private-key /absolute/path/outside/Vynema/agent-key.pem \
  --out docs/agents/signing-test-vectors.json

node tools/agent-cli/dist/cli.js test-vectors verify \
  --file docs/agents/signing-test-vectors.json
```

The command reads but never prints, copies, or modifies the external private key. Reusing the same
external key produces byte-identical vectors. If that key is unavailable, a new public key,
`keyId`, and signatures form an intentional replacement and the complete public diff must be
reviewed. Only the JSON artifact may be committed; the private key must remain outside the
repository and CI.

## Authentication troubleshooting

On `AGENT_AUTH_FAILED`, check clock skew first, then exact body byte equality, exact path/query
equality, nonce reuse, and the registered key status. Never log the private key, signature input
body, or other request secrets while diagnosing authentication.
