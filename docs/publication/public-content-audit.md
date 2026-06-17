# Public Content Audit

This audit tracks repository content that must be reviewed before vynema is made public.

Public repository visibility is not a release, but public visibility still exposes all tracked files and history.
Do not change repository visibility until all `blocker` items are resolved.

## Current Decision

| Item | Decision |
|---|---|
| Public-first OSS | Yes, after cleanup |
| Default branch | `main` |
| Permanent `developer` branch | No |
| PR target | Protected `main` |
| Release trigger | Explicit tag, GitHub Release, protected environment approval, or release workflow |
| License | MIT |
| Product name | `vynema` |
| Repository name | `vynema` planned |

## Resolved Blockers

| Path | Previous Finding | Resolution |
|---|---|---|
| `AGENTS.md` | Active AI-DLC workflow instructions remained in the root project agent file. | Removed from public repository scope. Public contributor guidance now lives in `README.md`, `CONTRIBUTING.md`, and `SECURITY.md`. |
| `CLAUDE.md` | Duplicated active AI-DLC workflow instructions and Claude-specific workflow assumptions. | Removed from public repository scope. |
| `.aidlc-rule-details/` | Large AI-DLC workflow rule set remained as active tooling. | Removed from public repository scope. |
| `aidlc-docs/` | AI-DLC state and audit logs remained tracked. | Removed from public repository scope. |
| `docs/AI-DLC導入と設計不明点洗い出し.md` | Historical prompt transcript included local absolute path references and old AI-DLC onboarding context. | Removed from public repository scope. |
| `temporary/` | Temporary notes included local path references, old Claude/team workflow details, and unresolved personal planning notes. | Removed from public repository scope. |
| `team-config.md` | Contained old Claude/team role configuration, model IDs, local hook paths, and v1 cost/stack assumptions. | Removed from public repository scope. |
| `skills/` | Old project-local Claude/team role skill files remained and implied obsolete workflow. | Removed from public repository scope. |

## Remaining Public Readiness Risks

| Path | Finding | Recommended Action |
|---|---|---|
| Git history | Deleted files remain in repository history until history rewriting is deliberately performed. | Run git-history secret scan before public visibility. Rewrite history only if a real secret or unacceptable private content is found. |
| `docs/archive/v1/` | Historical v1 docs are preserved and may contain old assumptions, Claude/team workflow references, or paid-service assumptions. | Keep marked as historical. Review before adopting any v1 detail into current implementation. |
| `docs/archive/v1/scripts/generate-mockups.js` | Historical helper script is preserved under the v1 archive and may not run against current paths. | Keep as historical only; do not treat as current tooling. |

## OK To Keep

| Path | Reason |
|---|---|
| `README.md` | Public pre-alpha status, no release posture, branch policy, and MIT license reference are now explicit. |
| `LICENSE` | MIT License added. |
| `SECURITY.md` | Pre-alpha vulnerability reporting policy added. |
| `CONTRIBUTING.md` | GitHub Flow, no permanent `developer` branch, PR safety, and release policy added. |
| `.github/CODEOWNERS` | Protects `.github/`, workflow, dependency, and policy paths. |
| `.github/pull_request_template.md` | Adds PR safety checklist. |
| `.github/ISSUE_TEMPLATE/` | Adds structured public issue intake and points sensitive reports to security policy. |
| `.gitignore` | Blocks local secrets, keys, build outputs, logs, and temporary files from future commits. |
| `docs/publication/name-collision-check.md` | Records the initial `vynema` naming collision check. |
| `docs/publication/github-hardening-next-steps.md` | Records dry-run GitHub rename and hardening steps; no mutation executed. |
| `PROJECT-STATUS.md` | Rewritten as the current `vynema` pre-alpha status page. |
| `docs/requirements/vynema-mvp-requirements.md` | Current MVP requirements baseline. |
| `docs/architecture/vynema-architecture.md` | Current architecture baseline. |
| `docs/archive/v1/README.md` | Marks historical v1 docs as non-current reference material. |
| `docs/archive/v1/scripts/generate-mockups.js` | Preserves the v1 mockup helper outside active scripts. |

## Secret / PII Scan Notes

Initial targeted scans found no real secrets in the newly prepared baseline files.

Working-tree high-confidence secret regex scan found no likely real secret values.

Broad keyword scans do show placeholder environment variable examples such as `<API_KEY>`, `sk_test_xxx`, `whsec_xxx`, `xxx:xxx`, and `AXxx...` in historical v1 archive docs.
Those are placeholders, not real secrets.

Git history high-confidence secret regex scan found no likely real secret values.
History keyword scan found the same placeholder examples in commit `46bef21`.

Dedicated secret scanners such as `gitleaks`, `trufflehog`, and `detect-secrets` were not installed in the local environment.
Run one before public visibility if possible.

## Recommended Next Step

Continue cleanup in this order:

1. Run a dedicated secret scanner if available.
2. Apply GitHub-side hardening settings.
3. Rename the GitHub repository to `vynema` before public visibility if possible.
4. Commit baseline cleanup before any GitHub visibility change.
