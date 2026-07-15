# Issue #21: Implement checks-only CI; defer deployment pipeline to #42

GitHub issue: https://github.com/Saber5656/Vynema/issues/21

This file is the canonical implementation design for issue #21. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement checks-only CI now; leave preview/production deployment, migrations, and rollback blocked until #42 selects the production stack.

## Scope

- Add CI jobs for install, lint, typecheck, tests, and build.
- Wire the test commands produced by AIT-MVP-020 into CI when available; CI scaffolding must not wait for AIT-MVP-020 to close.
- Add provider-independent build/test CI.
- Keep deployment, production migrations, media bindings, and provider secrets blocked until #42.
- Reserve requirements for a future main-only, owner-approved deployment gate after #42.

## Out Of Scope

- Paid production infrastructure.
- PR creation automation.

## Acceptance Criteria

- [ ] CI blocks merge on failing lint/type/build steps and any available test steps.
- [ ] After AIT-MVP-020 lands, the automated test suite runs in CI and failing tests block merge.
- [ ] No deploy workflow, cloud binding, or provider secret exists before #42.
- [ ] Deployment/migration/rollback acceptance remains explicitly blocked on #42.
- [ ] Secrets and bindings are not committed to the repository.
- [ ] Local SQLite migration order, backup restore, and fix-forward recovery are documented; production migration/rollback acceptance remains owned by #42.
- [ ] Infra review confirms no automatic paid spend is introduced.

## Dependencies

- AIT-MVP-002.
- AIT-MVP-004.
- AIT-MVP-019.

## Notes

- Future deployment must use the provider/pricing guardrails approved in #42.

---
Stable Issue Key: AIT-MVP-021
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-004, AIT-MVP-019
Recommended Labels: area/devops, area/infra, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (amended 2026-07-15)

> Normative. Implements ADR-010. MUST comply with the repository automation security contract. Checks-only CI may land now. No deploy workflow, cloud environment, provider token, production migration, or release command may be added before #42 selects the stack and receives owner approval.

### 1. Workflows

#### `.github/workflows/ci.yml`

- Triggers: `pull_request` (all branches), `push` to `main`. NEVER `pull_request_target`.
- Top level: `permissions: { contents: read }`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- Single job `checks` on `ubuntu-latest` (GitHub-hosted ONLY): checkout → pnpm setup → node 22 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Add `pnpm test:coverage` artifact upload once #20 lands.
- Job `e2e` (added when #20 lands): same setup + `npx playwright install --with-deps chromium` + `pnpm test:e2e`; artifacts: playwright report on failure.
- **Action pinning rule (normative)**: every third-party action pinned to a full 40-char commit SHA with a trailing version comment. Resolve SHAs at implementation time: `gh api repos/<owner>/<repo>/git/ref/tags/<vX.Y.Z> --jq .object.sha` (dereference annotated tags via `git/tags/<sha>` if type=tag). Actions used: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`. Dependabot (already configured) keeps them updated.

#### Deployment workflow

**Intentionally absent.** #42 must define the selected provider, current pricing,
database/media migration, preview/production separation, least-privilege secrets,
main-ref guard, owner approval, rollback, and boundary tests before a manual
deploy workflow can be proposed. No `id-token: write`, package publishing,
marketplace, token-writing, or provider write credential is allowed meanwhile.

#### Existing `secret-scan.yml`

Keep; verify it also runs on `pull_request` and pin its actions to SHAs while touching CI (same PR). Include its `high-confidence-secret-scan` check in required branch-protection checks alongside `checks` and `e2e` once branch protection is configured.

### 2. Environment posture

Only local development exists. There is no preview/production config, cloud
resource id, provider domain, or deployment secret. #42 creates these only after
migration and security-boundary rehearsal.

### 3. `docs/deployment.md` (new)

For now, document local CI commands and state that deployment is blocked on #42.
After #42, extend this document with provisioning, main-only manual deploy,
owner approval, migration/rollback, emergency disable, and smoke evidence.
Branch protection may require `checks`, `high-confidence-secret-scan`, and later
`e2e`; it must not require a nonexistent deploy check.

### 4. Tests / verification

- CI proves itself: open a scratch PR with a failing test → CI red; fix → green. Record run links in this issue.
- Verify no deploy workflow or provider secret exists. Provider deployment tests are `N/A — blocked on #42`.
- Workflow-lint step: add `zizmor` or manual checklist? MVP: manual checklist in PR description = the security-contract §Repository Automation bullets, each checked with a line of evidence (grep output: `grep -rn "pull_request_target\|self-hosted\|id-token" .github/workflows/` → empty).

### 5. Acceptance mapping & PR evidence

- "CI blocks merge on failing steps" → §1 ci.yml + branch protection note; "test suite runs in CI once #20 lands" → e2e job clause; deployment/provider requirements remain unchecked and explicitly delegated to #42; "no automatic paid spend" → no deploy workflow or provider secret.
- PR evidence: security impact note ("repository automation — least-privilege reviewed"), the grep outputs above, CI run links (red→green demo), pinned-SHA table (action → SHA → version).
