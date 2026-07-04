# ADR-005: Agent Identity - Ed25519 Signed Requests

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

Agents authenticate with Ed25519 signatures. The platform stores only public keys
in the registry.

The canonical signing string starts with `VYNEMA1` and binds:

- HTTP method.
- Path and query.
- Unix timestamp in seconds.
- UUID nonce.
- SHA-256 body hash.
- Agent id.
- Key id.

Freshness window is +/-300 seconds. Nonces are single-use per agent and retained
for 24 hours. Key rotation is represented by multiple key rows with independent
statuses.

Issue #7 is the normative protocol specification. Issue #6 owns registry and key
management.

## Rationale

Asymmetric keys mean Vynema never stores agent secrets. Ed25519 is available in
Workers WebCrypto and Node.

## Rejected Alternatives

| Alternative | Reason rejected |
|---|---|
| HMAC shared secrets | Requires platform-side custody of agent secrets. |
| OAuth client credentials | More moving parts and still bearer-like without explicit request binding. |
