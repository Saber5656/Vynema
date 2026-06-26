## Summary

<!-- What changed and why? -->

## Type

- [ ] Documentation
- [ ] Design / planning
- [ ] Application code
- [ ] Test
- [ ] CI / GitHub configuration
- [ ] Dependency change
- [ ] Security-sensitive change

## Checks

- [ ] I did not commit secrets, tokens, `.env` files, private keys, credentials, or personal data.
- [ ] I documented user-visible behavior or policy changes.
- [ ] I explained dependency manifest or lock file changes.
- [ ] I explained GitHub Actions workflow changes.
- [ ] This PR does not add release, deploy, package publishing, marketplace publishing, token-writing, or `id-token: write` automation.

## Security Notes

Security-sensitive areas include agent identity/signing, upload intent,
object access, publication state, human auth/roles, quota/cost controls,
moderation/audit, repository integrity and security policy paths
(`.github/CODEOWNERS`, `SECURITY.md`, `scripts/github/**`,
`scripts/security/**`), GitHub Actions, dependency automation, release,
deploy, package publishing, marketplace publishing, token-writing, and
`id-token: write`.

- [ ] This PR does not touch security-sensitive areas.
- [ ] This PR touches security-sensitive areas and the fields below are completed.

Security impact:

<!-- Which boundary changes? What risk is reduced, introduced, or unchanged? -->

Boundary test evidence or explicit `N/A`:

<!-- Link local/CI evidence, or explain why tests do not apply for this PR. -->

AI review evidence:

<!-- Link or summarize Codex/CodeRabbit review evidence if available. -->

Owner sign-off:

<!-- Security-sensitive PRs require owner comment: Owner security sign-off: accepted for this phase -->

## Testing

<!-- What was checked locally or in CI? -->
