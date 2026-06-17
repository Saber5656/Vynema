# Contributing

vynema is pre-alpha.
Contributions are welcome after the repository is made public, but the project is still defining its initial architecture and security boundaries.

## Development Flow

Use GitHub Flow:

1. fork or create a branch from `main`;
2. make a focused change;
3. open a pull request to `main`;
4. wait for checks and review;
5. merge only after the protected-branch requirements pass.

Do not create a long-lived `developer` branch by default.
`main` is the integration branch.
Deployment and release must be triggered separately by tags, GitHub Releases, or protected environment approvals.

## Pull Request Rules

Before opening a PR:

- keep the change focused;
- update documentation when behavior or policy changes;
- do not commit secrets, tokens, `.env` files, private keys, credentials, or personal data;
- clearly describe dependency changes;
- clearly describe changes to `.github/workflows/**`;
- avoid `pull_request_target` unless a threat review explicitly approves it;
- avoid self-hosted runners for public fork PRs.

## Dependency Changes

Dependency manifest and lock file changes require extra care.
Explain why the dependency is needed, whether it affects runtime or development only, and whether it introduces new network, build, or supply-chain risk.

## Security Reports

Do not put exploit details or secrets in public issues.
Follow `SECURITY.md`.

## Release Policy

No release or package publication should be added before the explicit `v0.1.0` readiness gate.
Publish tokens should not be stored in the repository.
