# GitHub Ruleset Automation

Date: 2026-06-18

This document defines the reusable default-branch ruleset automation for public-first OSS repositories.

No repository mutation is performed by this document.

## Script

Use:

```bash
python3 scripts/github/apply-default-branch-ruleset.py --repo OWNER/REPO
```

The default mode is `dry-run`.
It generates a JSON payload, discovers whether a ruleset with the configured name already exists, and prints the planned GitHub REST API mutation.

Apply mode requires both:

- `GH_TOKEN` set to a temporary fine-grained PAT for the selected repository
- `--yes`

```bash
GH_TOKEN=<temporary-fine-grained-pat> \
  python3 scripts/github/apply-default-branch-ruleset.py \
  --repo OWNER/REPO \
  --mode apply \
  --yes
```

Required token permission:

| Permission | Value |
|---|---|
| Repository selection | Only the target repository |
| Repository permissions | `Administration: write` |
| Expiration | Short-lived |

Do not print, commit, store, or paste token values into logs, docs, issues, PRs, or shell transcripts.

## Baseline Settings

| GitHub UI item | Script / API value | Baseline decision | Reason |
|---|---|---|---|
| Ruleset name | `protect-main-branch-of-OSS` | Enabled | Stable reusable name for OSS default-branch protection |
| Enforcement status | `active` | Enabled | The script provides dry-run; apply should enforce protection immediately |
| Bypass list | `[]` | Empty | Avoid routine bypass of the protection rules |
| Target branches | `~DEFAULT_BRANCH` | Default branch only | Reusable across repositories and avoids over-restricting feature branches |
| Restrict creations | Omitted | Disabled | Default branch already exists; little benefit for initial solo OSS |
| Restrict updates | Omitted | Disabled | Would risk freezing the default branch when bypass is empty |
| Require linear history | `required_linear_history` | Enabled | Keeps main history compatible with squash/rebase workflows |
| Require deployments to succeed | Omitted | Disabled | No deployment environments or workflows exist yet |
| Require signed commits | Omitted by default | Disabled | Enable only after local, bot, and GitHub merge signing behavior is verified |
| Require a pull request before merging | `pull_request` | Enabled | Blocks direct pushes to the default branch |
| Allowed merge methods | `["squash", "rebase"]` | Enabled | Compatible with linear history; avoids merge commits |
| Required approvals | `0` | No approval count initially | Solo OSS can still merge while PR workflow is enforced |
| Require conversation resolution | `required_review_thread_resolution: true` | Enabled | Prevents merging unresolved review threads |
| Dismiss stale approvals on push | `dismiss_stale_reviews_on_push: true` | Enabled | Keeps future review-required workflows safe |
| Require Code Owner review | `require_code_owner_review: false` | Disabled | CODEOWNERS is useful as routing/docs, not as a solo merge blocker |
| Require approval of most recent push | `require_last_push_approval: false` | Disabled | Solo maintainer is normally the last pusher |
| Require status checks to pass | Omitted by default | Disabled | Add after CI exists and check names have passed once |
| Block force pushes | `non_fast_forward` | Enabled | Prevents default-branch history rewrites |
| Restrict deletions | `deletion` | Enabled | Prevents accidental or malicious default-branch deletion |
| Require code scanning results | Omitted by default | Future option | Add after CodeQL or another scanner is installed and stable |
| Require code quality results | Not implemented in baseline | Future option | Add after the target quality tool and API shape are verified |
| Automatically request Copilot code review | Omitted by default | Disabled | Depends on Copilot access, quota, and review noise characteristics |

## Future Options

The script has opt-in arguments for settings that should not be part of the initial baseline:

| Option | Adds |
|---|---|
| `--require-signed-commits` | `required_signatures` |
| `--required-check <context>` | `required_status_checks` |
| `--code-scanning-tool <tool>` | `code_scanning` |
| `--enable-copilot-review` | `copilot_code_review` |

Use these only after the corresponding local and GitHub-side workflow is proven stable.

## Vynema Dry Run

For the current repository:

```bash
python3 scripts/github/apply-default-branch-ruleset.py --repo Saber5656/Vynema
```

Expected mutation:

| Item | Value |
|---|---|
| Operation | Update existing ruleset |
| Existing ruleset id | `17653754` |
| Endpoint | `PUT /repos/Saber5656/Vynema/rulesets/17653754` |

Apply only after reviewing the printed manifest and using a temporary fine-grained token.
