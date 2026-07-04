# Issue #29: Define Terraform-based IaC for cloud resources and environment separation

GitHub issue: https://github.com/Saber5656/Vynema/issues/29

This file is the canonical implementation design for issue #29. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Define how Vynema cloud resources should be managed with Terraform-based Infrastructure as Code before the deployment pipeline is implemented.

This issue exists now as a planning placeholder because the product implementation is not ready yet, but cloud resource ownership and drift prevention should be decided before real infrastructure is created manually.

## Scope

- Decide which cloud resources are managed by Terraform and which are managed outside Terraform.
- Define environment separation for local, preview, staging if needed, and production.
- Define Terraform state backend, state locking, workspace or directory strategy, and access policy.
- Define secret handling boundaries: secrets must not be stored in Terraform state unless explicitly accepted.
- Define resource naming conventions, tags/metadata, and cost/free-tier guardrails.
- Define drift detection and change review workflow.
- Align with the deployment pipeline issue for the selected Cloudflare Worker + Static Assets stack, D1, R2, DNS, and environment bindings.

## Out Of Scope

- Implementing application features.
- Creating real cloud resources before provider and architecture decisions are approved.
- Storing production secrets in the repository.
- Applying Terraform from CI without an explicit deployment/release gate.

## Acceptance Criteria

- [ ] Terraform/IaC ownership policy is documented.
- [ ] Provider-specific resource list is defined after architecture/provider choices are made.
- [ ] State backend and access model are documented.
- [ ] Secret handling policy is documented.
- [ ] Preview and production environment separation is documented.
- [ ] Drift detection and manual-change policy are documented.
- [ ] Follow-up implementation tasks are created if Terraform modules or CI plan/apply workflows are needed.

## Dependencies

- AIT-MVP-002: Finalize v2 architecture and provider quota choices.
- AIT-MVP-021: Implement CI/CD and Cloudflare deployment pipeline.
- AIT-MVP-023: Security hardening and threat model review.

## Notes

- This issue should remain planning-oriented until the product stack and provider choices are settled.
- Terraform should not become a hidden release path. Plan/apply must follow the same explicit gate policy as deployment.

---
Stable Issue Key: AIT-MVP-025
Classification: MVP Planning
Recommended Labels: area/infra, area/devops, type/design, priority/p1
Source: Side conversation request for Terraform/IaC cloud resource management.

---

## Implementation Plan & Design (added 2026-07-02)

> Normative for IaC posture. Prerequisites: #2 ADRs approved (stack: Workers/D1/R2). This issue stays design+skeleton until #21 provisions the first real environment; apply happens only after that, via import.

### 1. Ownership split (the core policy)

| Resource | Managed by | Rationale |
|---|---|---|
| R2 buckets (+ lifecycle rules, public-access/custom-domain config) | **Terraform** | Long-lived, security-posture-bearing (#9); drift here breaks the private/public boundary |
| D1 databases (existence only, NOT schema) | **Terraform** | Schema/migrations stay with wrangler (#4/#21) |
| Custom domains / DNS (when added) | **Terraform** | |
| Worker script + versions + secrets + bindings | **wrangler** (deploy.yml, #21) | Deploys are release-gated; TF must not become a hidden deploy path (issue note requirement) |
| GitHub repo settings | **manual/gh** (existing hardening PRs) | Out of IaC scope for MVP |

### 2. Layout & state backend

```
infra/
  modules/vynema-env/        # buckets ×2, lifecycle, d1 database, outputs (ids for wrangler.toml)
    main.tf variables.tf outputs.tf
  envs/preview/main.tf       # module instance, backend config
  envs/production/main.tf
  README.md                  # this policy + how to plan/apply/import
```

- Backend: S3-compatible on a dedicated R2 bucket `vynema-tfstate` (created manually, once), `use_lockfile = true` (TF ≥ 1.10 native lockfile; R2 conditional writes support it), one state key per env (`preview.tfstate`, `production.tfstate`). Backend credentials: R2 S3 token scoped to `vynema-tfstate` only, held by owner, exported as env vars — **never committed**.
- Provider: `cloudflare/cloudflare` pinned (`~> 5.0` + `.terraform.lock.hcl` committed). Provider token via `CLOUDFLARE_API_TOKEN` env var, scoped: R2:Edit + D1:Edit only.

### 3. Secrets policy (normative)

No secret values in `.tf`, `.tfvars`, or state: TF creates resources whose configuration is non-secret; Worker secrets flow exclusively through `wrangler secret put` (#21). The known exception class (provider tokens) lives in the operator's environment. If a future resource unavoidably places a secret in state, it requires explicit owner risk acceptance recorded on this issue (per `security-contract.md` acceptance rules).

### 4. Change & drift workflow

- All `.tf` changes via PR (normal review; security-sensitive when touching bucket public access, lifecycle, or domains).
- Apply: manual, owner-run, from the PR's merged commit: `terraform plan -out` → read plan → `apply` the saved plan. **No CI plan/apply in MVP** — mirrors the deploy release gate; revisit only with the same environment-approval gating as deploy.yml.
- Drift detection: owner runs `terraform plan` per env before any infra change and monthly (calendar note in `infra/README.md`); non-empty unexpected plan = investigate, then either import/align or revert console change. Manual console changes to TF-owned resources are forbidden except during incidents (then: run plan + reconcile within a week, note on this issue).
- Bootstrap/import order (because #21 creates resources with wrangler first): write module → `terraform import` existing buckets/D1 → `plan` until empty → from then on TF is authoritative for §1 rows.

### 5. Naming & guardrails

Names exactly as in #2's environment table (`vynema-media-pending[-preview]`, etc.). Module hardcodes `public_access = false` on the pending bucket — a plan flipping it must never apply (add a `lifecycle { precondition }` or validation guarding it). Free-tier guardrail: module contains NO paid-tier resources (no Workers paid plan toggles, no R2 storage-class extras); adding any paid resource requires the #14/#24 spend review.

### 6. Step-by-step order

1. `infra/README.md` with §1–§5 (policy first — this closes most acceptance boxes). 2. Module + env instances compiling against placeholder account id (`terraform validate` in CI later; keep out of ci.yml for MVP to avoid token needs — validate locally). 3. After #21 provisions preview: import, empty-plan proof (paste into this issue). 4. Production import at launch window (#24). 5. File follow-up issue for CI `terraform plan` (comment-only) if wanted post-MVP.

### 7. Acceptance mapping

Ownership policy → §1; resource list → §2 module (per approved providers); state backend/access → §2; secrets → §3; env separation → §2 env dirs; drift/manual-change policy → §4; follow-up tasks → §6.5.
