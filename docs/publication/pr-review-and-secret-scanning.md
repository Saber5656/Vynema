# PR Review and Secret Scanning Baseline

Date: 2026-06-19

This document defines the first PR-time safeguards for Vynema.

The goal is to get fast feedback without introducing broad write tokens, publish paths, or unreviewed third-party Actions.

## Current Decision

| Area | Baseline |
|---|---|
| Codex PR review | Use Codex GitHub code review through Codex cloud and `@codex review` first |
| Codex as required CI gate | Defer until there is an explicit reason to store an OpenAI API key in GitHub Secrets |
| Secret scanning | Use GitHub native Secret scanning and push protection as primary control |
| PR secret check | Add lightweight high-confidence local/CI scanner with no third-party action |
| Third-party scanners | Defer until an action is reviewed, allowlisted, and pinned to a full-length SHA |

## Codex Review Flow

Codex can review GitHub pull requests when Codex cloud and repository code review are enabled.

Setup:

1. Set up Codex cloud for `Saber5656/Vynema`.
2. Open `https://chatgpt.com/codex/settings/code-review`.
3. Enable code review for the repository.
4. Keep a public-safe top-level `AGENTS.md` with repository review guidance.

Manual request:

```text
@codex review
```

Focused manual request:

```text
@codex review for security regressions in GitHub Actions, secret handling, and release automation
```

Automatic reviews can be enabled from the same Codex code review settings page after manual review behavior looks useful.

Do not make Codex review a required CI gate yet. The Codex GitHub Action can run Codex in CI, but it requires an `OPENAI_API_KEY` secret and therefore creates a new credential-management surface.

## GitHub Native Secret Protection

Public repositories receive GitHub secret scanning automatically.

Repository-level push protection should still be enabled in GitHub UI so bypasses and alerts are visible at repository level.

Recommended UI path:

```text
Repository -> Settings -> Security -> Advanced Security
```

Target settings:

| Setting | Target |
|---|---|
| Secret scanning | Enabled |
| Push protection | Enabled |
| Dependabot alerts | Enabled |
| Dependabot security updates | Enabled if available |
| CodeQL default setup | Enable after Actions baseline is confirmed |

Push protection blocks detected secrets before they enter repository history through command line pushes, GitHub UI commits, file uploads, REST API requests, and public-repository GitHub MCP interactions.

## PR Secret Check

The repository includes a lightweight CI check:

```text
.github/workflows/secret-scan.yml
```

It runs:

```bash
python3 scripts/security/scan-secrets.py
```

Properties:

| Property | Value |
|---|---|
| Event | `pull_request`, manual `workflow_dispatch` |
| Token permissions | `contents: read` |
| Checkout action | `actions/checkout` pinned to full-length commit SHA |
| Secrets used | None |
| Third-party Actions | None |
| Output behavior | Prints path and line only, not matched secret values |

Push-time protection is handled by GitHub native push protection and by running the local scanner before push:

```bash
python3 scripts/security/scan-secrets.py
```

After this workflow succeeds once on GitHub, add its check name to the main ruleset required status checks.

Expected check name:

```text
Secret Scan / high-confidence-secret-scan
```

## Dependabot

The repository includes:

```text
.github/dependabot.yml
```

Initial scope:

| Ecosystem | Schedule | Reason |
|---|---|---|
| `github-actions` | Weekly, Monday 09:00 JST | Track workflow action updates after workflows exist |

Package-manager ecosystems should be added only after real manifests exist.

## Required Status Check Order

Do not add required status checks before a check has completed successfully at least once.

Recommended order:

1. Merge the PR that adds the first workflow.
2. Confirm `Secret Scan / high-confidence-secret-scan` runs and passes.
3. Add that exact check name to the main ruleset.
4. Enable CodeQL default setup from GitHub UI.
5. Confirm CodeQL runs at least once.
6. Add CodeQL/code scanning gates only after alert behavior is understood.

## Sources

- GitHub Docs: Secret scanning
  `https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning`
- GitHub Docs: Push protection
  `https://docs.github.com/en/code-security/concepts/secret-security/push-protection`
- GitHub Docs: Code scanning default setup
  `https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning`
- GitHub Docs: Secure use of GitHub Actions
  `https://docs.github.com/en/actions/reference/security/secure-use`
- OpenAI Codex manual: Codex code review in GitHub
  `https://developers.openai.com/codex/codex-manual.md`
