# Deployment and CI status

Vynema currently provides checks-only continuous integration. Deployment is
blocked on [issue #42](https://github.com/Saber5656/Vynema/issues/42), which
must select and approve the production provider, database and media migration,
environment separation, credentials, rollback, and boundary tests.

## Local checks

Run the same commands used by CI from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @vynema/shared build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The shared-package build prepares its exported types for type-aware linting.
The root `package.json` remains the check command contract. Add new checks to
the root scripts before wiring them into CI so local and hosted verification
stay aligned.

## Checks-only CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. Its
single `checks` job uses a GitHub-hosted runner, sets up Node, installs fixed
Corepack `0.34.7` from its official GitHub asset after verifying SHA-256
`7f7f581a5fae7946dce393c3ebd957e7449e73bb9b5bb219c566fa83d23412f4`,
then enables the exact `pnpm@10.34.5` declared by the repository. It executes
the local commands above. GitHub-owned actions are pinned to reviewed full
commit SHAs; checkout does not persist credentials, and the workflow has only
`contents: read` permission. No third-party package-manager action or disabled
package signature check is needed.

The existing `.github/workflows/secret-scan.yml` supplies the separate
`high-confidence-secret-scan` check for pull requests. It also uses
least-privilege permissions and a full-SHA action pin.

## Deployment remains blocked

This repository intentionally has no deployment workflow. Until #42 is
approved and implemented, do not add:

- preview or production environments;
- provider bindings, resource identifiers, domains, or credentials;
- production database or media migrations;
- release, package-publish, marketplace-publish, or token-writing commands;
- `id-token: write` or another repository/workflow write permission.

Merging to `main` runs checks only. It does not deploy or release Vynema.

## Evidence and merge gate

Issue #21's ready pull request must show a successful `checks` run and the
existing `high-confidence-secret-scan` result. The canonical red-to-green CI
demonstration remains pending unless the owner separately approves a scratch PR
or an intentional failing push.

Because repository automation is security-sensitive, merge also requires the
owner's exact comment:

`Owner security sign-off: accepted for this phase`
