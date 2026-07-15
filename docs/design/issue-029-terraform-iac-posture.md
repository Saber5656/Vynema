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
- Align with #42 and #21 only after a production provider and migration plan are approved.

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
- AIT-MVP-021: Implement checks-only CI and the later approved deployment gate.
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

## Implementation Plan & Design (amended 2026-07-15)

> No IaC provider, module, state backend, cloud resource, or provider credential
> may be selected or scaffolded before launch-blocking issue #42 completes its
> provider/pricing and migration decision. Historical Cloudflare-specific plans
> are superseded.

### Required output after #42

- Explicit ownership table for every selected production resource.
- State backend/access/locking and secret-state analysis.
- Preview/production isolation, naming, drift, import, rollback, and incident
  reconciliation policy.
- Private-before-public, takedown, quota hard-stop, and no-hidden-deploy guards.
- Manual owner-reviewed apply; no CI apply or token-writing automation without a
  separate security review.

### Current acceptance state

`blocked on #42` is the only valid result. The repository must contain no `.tf`
provider/resource scaffold that could imply an approved cloud or pricing model.
