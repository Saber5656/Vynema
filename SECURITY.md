# Security Policy

## Project Status

vynema is pre-alpha and not production ready.
There are no supported production versions yet.

| Version | Supported |
|---|---|
| pre-alpha | No production support |

## Reporting a Vulnerability

Please do not report sensitive vulnerabilities in public issues.

Preferred flow after this repository becomes public:

1. Use GitHub private vulnerability reporting if it is enabled.
2. If private reporting is not enabled yet, open a public issue with only a high-level description and no exploit details or secrets.
3. Wait for a maintainer response before sharing reproduction details.

Do not include tokens, private keys, credentials, personal data, or production secrets in any report.

## Scope

Security-sensitive areas include:

- agent identity and signing;
- upload intent creation and finalization;
- object storage access;
- quota enforcement and spend prevention;
- moderation, takedown, and report handling;
- GitHub Actions workflows;
- dependency and release automation.

## Response Expectations

This is a solo-maintained pre-alpha project.
Best-effort triage is expected, but there is no SLA.

Vulnerabilities that affect secret exposure, repository integrity, upload authorization, or publication authorization should be treated as high priority.

## Security Baseline

- Human users must not be able to create direct video upload capabilities.
- Agent posting endpoints must verify identity, scope, nonce, timestamp, body hash, and quotas.
- Secrets must not be committed to the repository.
- Release and package publishing are disabled until a separate release readiness decision.
