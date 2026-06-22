# GitHub Hardening Next Steps

Date: 2026-06-18
Mode: dry-run only

No GitHub repository mutation has been executed from this document.

## Target

| Item | Value |
|---|---|
| Current repository | `Saber5656/AI-Theater` |
| Planned repository | `Saber5656/vynema` |
| Visibility target | Public-first after cleanup and protection |
| Default branch | `main` |

## Step 1: Rename Repository

Preferred manual UI path:

1. Open repository settings on GitHub.
2. Rename `AI-Theater` to `vynema`.
3. Confirm GitHub redirect behavior.
4. Update the local remote.

Equivalent `gh` command, if explicitly approved later:

```bash
gh repo rename -R Saber5656/AI-Theater vynema
git remote set-url origin https://github.com/Saber5656/vynema.git
```

Do not run with `--yes` unless the target repository and rollback plan are confirmed.

## Step 2: Baseline Repository Settings

Manual UI is preferred for these initial settings:

| Setting | Desired State |
|---|---|
| Default branch | `main` |
| Issues | Enabled |
| Wiki | Disabled unless needed |
| Projects | Disabled unless needed |
| Discussions | Disabled until community workflow is ready |
| Pages | Disabled unless docs site is intentionally launched |
| Packages | No package publication before release gate |

## Step 3: Actions Defaults

| Setting | Desired State |
|---|---|
| Workflow permissions | Read repository contents permission by default |
| Allow GitHub Actions to create/approve PRs | Disabled |
| Fork pull request workflows | Require maintainer approval for external contributors |
| Self-hosted runners | Not used for public fork PRs |

## Step 4: Security Features

| Feature | Desired State |
|---|---|
| Dependency graph | Enabled |
| Dependabot alerts | Enabled |
| Dependabot security updates | Enabled if available |
| Dependabot version updates | GitHub Actions now; package managers after manifests exist |
| Secret scanning | Enabled if available |
| Push protection | Enabled if available |
| CodeQL | Add after language/framework baseline is stable |

See `docs/publication/pr-review-and-secret-scanning.md` for the PR review and secret scanning baseline.

Initial repository files:

| File | Purpose |
|---|---|
| `.github/workflows/secret-scan.yml` | PR high-confidence secret pattern check without third-party Actions |
| `scripts/security/scan-secrets.py` | Local and CI secret pattern scanner |
| `.github/dependabot.yml` | Weekly GitHub Actions update monitoring |
| `AGENTS.md` | Public-safe Codex review guidance |

## Step 5: Main Ruleset

Initial solo-maintainer ruleset:

| Rule | Initial State |
|---|---|
| Target | `~DEFAULT_BRANCH` |
| Direct push | Blocked by requiring PR |
| Required approvals | `0` initially for solo maintainer |
| Code owner review | Off initially unless another maintainer can approve |
| Review thread resolution | On |
| Force push | Blocked |
| Branch deletion | Blocked |
| Linear history | On if using squash/rebase merge |
| Required checks | Add after CI exists and has stable check names |
| Required signatures | Add after commit signing is verified locally |
| Bypass actors | Empty unless a documented temporary exception exists |

Ruleset baseline management:

- Keep reusable ruleset import/export templates in `github-oss-repo-hardening` under `skills-repo`.
- Do not keep repository-administration mutation scripts or ruleset import templates in this application repository.
- Apply Vynema rulesets through GitHub UI import, or from the maintained skills-repo baseline after explicit approval.

## Step 6: Verification

Before making the repository public:

1. Run a dedicated secret scanner if available.
2. Confirm no package/release/deploy tokens exist in repository secrets.
3. Confirm `main` direct push is blocked.
4. Confirm branch -> PR -> merge works.
5. Confirm no workflow uses `pull_request_target`.
6. Confirm no self-hosted runner is configured for public fork PRs.
