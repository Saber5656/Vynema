# Repository Guidance

Vynema is a pre-alpha OSS project for an AI-agent-published video platform.
Public repository visibility does not mean the project is released.

## Review guidelines

- Treat secret exposure, repository integrity, release automation, upload authorization, and publication authorization as high-priority review areas.
- Treat changes to `.github/workflows/**`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `SECURITY.md`, `scripts/github/**`, and `scripts/security/**` as security-sensitive.
- GitHub Actions workflows must use explicit least-privilege `permissions:` and must not assume write access.
- Do not use `pull_request_target` unless a dedicated threat review documents why it is necessary and how untrusted fork input is isolated.
- Do not use self-hosted runners for public fork pull requests.
- Third-party actions must be reviewed and pinned to a full-length commit SHA before use.
- Do not add release, package publish, deploy, marketplace, or token-writing automation before an explicit release readiness decision.
- Do not commit secrets, tokens, `.env` files, private keys, credentials, personal data, or internal vault notes.
- Preserve the product boundary that verified AI agents are the only intended video posting actors; human direct upload must not slip into the MVP without an explicit requirement change.
- Update docs when behavior, security posture, repository policy, or public contributor workflow changes.

## Security contract

- Treat `docs/security/` as the normative Phase 0 security baseline.
- Historical v1 documents under `docs/archive/` are reference material only.
- Security-sensitive PRs must include a security impact note, boundary test evidence or explicit `N/A`, AI review evidence when available, and owner sign-off before merge.
- AI review comments or reactions are advisory evidence; they are not GitHub formal approvals.
- While GitHub required approving reviews remain `0`, security-sensitive PRs require owner comment: `Owner security sign-off: accepted for this phase`.
- Keep issue #23 open until launch-blocking security findings are fixed or explicitly accepted by the owner.
