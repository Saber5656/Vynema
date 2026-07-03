# Issue #21: Implement CI/CD and Cloudflare deployment pipeline

GitHub issue: https://github.com/Saber5656/Vynema/issues/21

This file is the canonical implementation design for issue #21. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the build, test, migration, preview, and production deployment workflow for the selected v2 stack.

## Scope

- Add CI jobs for install, lint, typecheck, tests, and build.
- Wire the test commands produced by AIT-MVP-020 into CI when available; CI scaffolding must not wait for AIT-MVP-020 to close.
- Add deployment configuration for Cloudflare Pages and Workers or selected equivalent.
- Add D1 migration deployment process.
- Add R2 bucket binding and environment variable management.
- Define preview and production deployment gates.
- Document rollback and emergency disable steps.

## Out Of Scope

- Paid production infrastructure.
- PR creation automation.

## Acceptance Criteria

- [ ] CI blocks merge on failing lint/type/build steps and any available test steps.
- [ ] After AIT-MVP-020 lands, the automated test suite runs in CI and failing tests block merge.
- [ ] Preview deployments can run with preview database/storage bindings.
- [ ] Production deployment instructions are documented and repeatable.
- [ ] Secrets and bindings are not committed to the repository.
- [ ] Migration order and rollback/recovery steps are documented.
- [ ] Infra review confirms no automatic paid spend is introduced.

## Dependencies

- AIT-MVP-002.
- AIT-MVP-004.
- AIT-MVP-019.

## Notes

- Deployment must be compatible with the free-tier guardrails.

---
Stable Issue Key: AIT-MVP-021
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-004, AIT-MVP-019
Recommended Labels: area/devops, area/infra, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Implements ADR-010. MUST comply with `docs/security/security-contract.md` §Repository Automation — that section is the review checklist for this issue's PRs. Prerequisites: #34 (scripts exist), #2 approved. CI scaffolding lands immediately; deploy workflow lands with the first preview environment.

### 1. Workflows

#### `.github/workflows/ci.yml`

- Triggers: `pull_request` (all branches), `push` to `main`. NEVER `pull_request_target`.
- Top level: `permissions: { contents: read }`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- Single job `checks` on `ubuntu-latest` (GitHub-hosted ONLY): checkout → pnpm setup → node 22 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Add `pnpm test:coverage` artifact upload once #20 lands.
- Job `e2e` (added when #20 lands): same setup + `npx playwright install --with-deps chromium` + `pnpm test:e2e`; artifacts: playwright report on failure.
- **Action pinning rule (normative)**: every third-party action pinned to a full 40-char commit SHA with a trailing version comment. Resolve SHAs at implementation time: `gh api repos/<owner>/<repo>/git/ref/tags/<vX.Y.Z> --jq .object.sha` (dereference annotated tags via `git/tags/<sha>` if type=tag). Actions used: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`. Dependabot (already configured) keeps them updated.

#### `.github/workflows/deploy.yml`

- Trigger: `workflow_dispatch` with `inputs.environment: choice [preview, production]`. **No push/PR/schedule trigger. Merging to `main` never deploys** (explicit release gate).
- `permissions: { contents: read }`. Job `deploy` with `environment: ${{ inputs.environment }}` — the GitHub Environment supplies secrets and, for `production`, a required-reviewer approval gate (owner). Setting up the environments (names `preview`, `production`; production: required reviewer = owner; both: secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) is an owner console step — document exact clicks in `docs/deployment.md`.
- Steps: checkout (pinned) → pnpm/node setup → install → `pnpm build` → `pnpm --filter @vynema/api exec wrangler d1 migrations apply vynema-db --env ${{ inputs.environment }} --remote` → `pnpm --filter @vynema/api exec wrangler deploy --env ${{ inputs.environment }}`.
- Cloudflare API token scope (least privilege): Account → Workers Scripts:Edit, D1:Edit, Workers R2 Storage: none (buckets pre-provisioned per #9/#29). No account-wide admin token. Document creation steps.
- No `id-token: write`, no package publishing, no marketplace, no token-writing steps anywhere. Adding any of those requires the release-readiness review per the security contract.

#### Existing `secret-scan.yml`

Keep; verify it also runs on `pull_request` and pin its actions to SHAs while touching CI (same PR).

### 2. `wrangler.toml` environments (extends #34's file)

```toml
# default env = local dev only; database_id stays a placeholder so a bare
# `wrangler deploy` (no --env) fails validation — accidental-deploy failsafe.

[env.preview]
name = "vynema-preview"
vars = { ENVIRONMENT = "preview", PUBLIC_MEDIA_BASE_URL = "https://<preview-r2-dev-url>" }
d1_databases = [{ binding = "DB", database_name = "vynema-db-preview", database_id = "<set-after-create>" }]
r2_buckets = [
  { binding = "MEDIA_PENDING", bucket_name = "vynema-media-pending-preview" },
  { binding = "MEDIA_PUBLIC",  bucket_name = "vynema-media-public-preview" },
]

[env.production]
name = "vynema"
# same shape with production names/ids
```

Provisioning commands (run once by owner, recorded in `docs/deployment.md`; #29 defines the longer-term IaC posture): `wrangler d1 create vynema-db-preview` / `vynema-db`, bucket creation per #9 §5, `wrangler secret put <NAME> --env <env>` for the #34 `env.ts` secret list. Secret VALUES never appear in repo, CI logs, or issue comments.

### 3. `docs/deployment.md` (new)

Sections: environment model table (#2 ADR); one-time provisioning; how to deploy (Actions → deploy.yml → choose env → production waits for owner approval); verifying a deploy (`/api/health` shows environment, smoke per #20 §3); **rollback**: `wrangler deployments list` → `wrangler rollback [--message]` (workers versions), D1 = forward-only (fix-forward or Time Travel restore per #4 — WARNING: restores lose writes since timestamp; runbook #22 covers decision); **emergency disable**: kill switches first (#14 — no deploy needed), full stop = `wrangler versions deploy` of a maintenance version or Cloudflare dashboard disable; branch protection: after first CI run, add required status checks `checks` (+`e2e` later) — `gh api -X PUT repos/Saber5656/Vynema/branches/main/protection/required_status_checks` or console; owner performs.

### 4. Tests / verification

- CI proves itself: open a scratch PR with a failing test → CI red; fix → green. Record run links in this issue.
- Deploy workflow first run targets `preview`; verify health endpoint + preview smoke (#20 §3); production deploy deferred to #24 go/no-go.
- Workflow-lint step: add `zizmor` or manual checklist? MVP: manual checklist in PR description = the security-contract §Repository Automation bullets, each checked with a line of evidence (grep output: `grep -rn "pull_request_target\|self-hosted\|id-token" .github/workflows/` → empty).

### 5. Acceptance mapping & PR evidence

- "CI blocks merge on failing steps" → §1 ci.yml + branch protection note; "test suite runs in CI once #20 lands" → e2e job clause; "preview deployments with preview bindings" → §2; "production instructions documented/repeatable" → §3; "secrets not committed" → secret flow (§2) + scan workflow; "migration order and rollback documented" → §3; "no automatic paid spend" → free-tier stack (ADR-001/002/003) + no paid add-ons in workflows (state in PR).
- PR evidence: security impact note ("repository automation — least-privilege reviewed"), the grep outputs above, CI run links (red→green demo), pinned-SHA table (action → SHA → version).

