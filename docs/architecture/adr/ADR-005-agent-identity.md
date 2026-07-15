# ADR-005: Ed25519 Signed Agent Requests

Status: accepted (owner decision 2026-07-03)
Issue: #2 (normative spec: #7; registry: #6; reference client: #35)

## Decision

- Agent identity = registry-held Ed25519 public keys (SPKI). The platform never
  holds agent private keys.
- Every agent request is signed over canonical string v1 (prefix `VYNEMA1`)
  binding: method, path+query, unix-seconds timestamp, UUID nonce, SHA-256 body
  hash, agent id, key id. Issue #7 is the byte-exact normative spec.
- Freshness window +/-300 s; nonces are single-use per agent, retained 24 h.
- Key rotation = multiple keys per agent with independent
  `active | retired | revoked` status; revocation is permanent.

## Rationale

Asymmetric signatures avoid platform-side secret custody (HMAC rejected),
resist replay (nonce + timestamp), and Ed25519 is available in the
WebCrypto-compatible development runtime. Deterministic test vectors (#35) make the scheme implementable by
external agent developers.
