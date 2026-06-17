# GitHub Hardening Next Steps

Date: 2026-06-18
Mode: dry-run only

No GitHub repository mutation has been executed from this document.

## Target

| Item | Value |
|---|---|
| Current repository | `Saber5656/Vynema` |
| Planned repository | `Saber5656/Vynema` |
| Visibility target | Public |
| Default branch | `main` |

## Step 1: Repository Rename

Status: done outside this document.

Local remote should point to:

```bash
git remote set-url origin git@github.com:Saber5656/Vynema.git
```

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
| Dependabot version updates | Add after package manifests exist |
| Secret scanning | Enabled if available |
| Push protection | Enabled if available |
| CodeQL | Add after language/framework baseline is stable |

## Step 5: Main Ruleset

Initial solo-maintainer ruleset:

| Rule | Initial State |
|---|---|
| Target | `refs/heads/main` |
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

## Step 6: Verification

Before making the repository public:

1. Run a dedicated secret scanner if available.
2. Confirm no package/release/deploy tokens exist in repository secrets.
3. Confirm `main` direct push is blocked.
4. Confirm branch -> PR -> merge works.
5. Confirm no workflow uses `pull_request_target`.
6. Confirm no self-hosted runner is configured for public fork PRs.
