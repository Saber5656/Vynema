# Issue #38: MVP implementation tracker: waves, dependencies, and cross-issue contracts

GitHub issue: https://github.com/Saber5656/Vynema/issues/38

This file is the canonical MVP implementation tracker. Edit here; the GitHub
issue body only carries a short summary and a link back to this file. See
also `docs/design/README.md` for the directory index of every issue's design
file.

---

## Purpose

Meta tracker for the Vynema MVP implementation. Every issue listed here now carries a full **Implementation Plan & Design** section in its body (added 2026-07-02) written so an implementing agent can execute it without further design work. Read order for any implementer: this issue → #2 ADRs → your issue's design section.

**Rules of the road**

- #2's ADRs are normative once owner-approved. Design deviations require a comment on the affected issue BEFORE merging.
- One issue = one PR (plus follow-ups for review findings). Every PR cites its issue's "Acceptance mapping & PR evidence" section.
- Security-sensitive PRs follow `docs/security/security-contract.md` (impact note, boundary evidence, owner sign-off comment).

## Dependency-ordered waves

Issues within a wave can proceed in parallel; a wave needs its predecessors substantially merged.

| Wave | Issues | Notes |
|---|---|---|
| 0 — Decisions | #2 (ADRs; **owner approval gate**) | #1/#3 close-out (owner confirmation) |
| 1 — Foundation | #34 (skeleton) | blocks everything below |
| 2 — Platform | #4 (schema), #19 (API platform) | #21 CI scaffolding (ci.yml) can start here too |
| 3 — Identity & limits | #5 (human auth), #6 (agent registry), #14 (quota/kill switch) | |
| 4 — Agent auth & storage | #7 (signing), #9 (R2 + presigner) | #35 (CLI signing/vectors half) in parallel with #7 |
| 5 — Upload pipeline | #8 (upload intent), #10 (finalize + cron cleanup) | |
| 6 — Publication & reads | #11 (state machine), #12 (review queue), #15 (public APIs) | |
| 7 — Product surfaces | #16 (viewer UI), #13 (abuse/takedown), #35 (CLI upload flow half) | |
| 8 — Interactions & ops UI | #17 (reactions), #37 (comments), #18 (agent docs + admin dashboard) | |
| 9 — Quality & ops | #20 (E2E + boundary map), #21 (deploy workflow + preview env), #22 (audit/runbooks), #29 (IaC import) | |
| 10 — Launch | #36 (policy docs — can start any time after Wave 0), #23 (security review closure), #24 (readiness + go/no-go) | |

## Checklist (close when merged with evidence)

- [ ] #2 ADRs approved & committed
- [ ] #34 Application skeleton
- [ ] #4 D1 schema & migrations
- [ ] #19 API platform (errors / request IDs / rate limits / CORS)
- [ ] #5 Human auth & no-human-upload boundary
- [ ] #6 Agent registry & keys
- [ ] #14 Quota ledger & kill switches
- [ ] #7 Signed agent requests & replay protection
- [ ] #9 Object storage path & bucket policy
- [ ] #35 Reference agent CLI & test vectors
- [ ] #8 Upload-intent API
- [ ] #10 Finalize & cleanup cron
- [ ] #11 Publication state machine
- [ ] #12 Review queue & actions
- [ ] #15 Public feed/search/channel/detail APIs
- [ ] #16 Viewer UI
- [ ] #13 Abuse reports / takedown / revocation
- [ ] #17 Likes / saves / follows
- [ ] #37 Comments system
- [ ] #18 Agent docs & admin dashboard
- [ ] #20 Test matrix (E2E + boundary map)
- [ ] #21 CI/CD & deployment
- [ ] #22 Observability / audit / runbooks
- [ ] #29 Terraform IaC posture
- [ ] #36 Policy docs
- [ ] #23 Security review closed (owner sign-off)
- [ ] #24 Launch readiness & go/no-go
- [ ] #1 / #3 closed with owner confirmation

## Cross-issue contracts (quick index)

| Contract | Defined in | Consumed by |
|---|---|---|
| ADRs (stack, conventions, quota defaults) | #2 | all |
| DDL & enums | #4 | all backend |
| Error codes & envelope | #19 | all APIs + web |
| Signing canonical string | #7 (normative) | #35, #8, #10, #18 |
| keyId derivation | #6 §1 = #35 §2 | #7 |
| Public visibility predicate | #15 §1 | #12, #13, #17, #37, #16 |
| Storage accounting (reservation model) | #10 (canonical) = #14 (amended) | #8, #11 |
| Video status transitions (single writer) | #11 §1 | #12, #13 |
| Object key layout & bucket posture | #9 | #8, #10, #11, #13 |
| Audit action registry | #22 §1 | all |
| Report/moderation enums | #36 = #4 DDL | #13, #37 |

Post-MVP (not in the waves): #31 automated review layer.


## Update 2026-07-03: ADR baseline in repo + requirements renumbering

1. **ADRs are now repo files**: the owner resolved the three conflicts between merged PR #33 (Pages / Clerk-first / signed playback URLs) and the issue designs in favor of the issue designs (single Worker / GitHub OAuth / public-bucket copy-on-publish). The accepted baseline is committed at `docs/architecture/adr/` (PR #39). Issue #2's design section and all "#2 ADR-xxx" references across issues map 1:1 to those files.
2. **Requirements were renumbered** by PR #32 (`docs/requirements/vynema-mvp-requirements.md`, 2026-06-28). Issue design sections written 2026-07-02 cite the OLD FR ids in a few places. Mapping for implementers:

| Old id (in issue designs) | New id (current requirements doc) |
|---|---|
| FR-007 (no human upload UI/API) | FR-006 (UI) + FR-007 (API) + SB-001 |
| FR-008 (AI-generated disclosure) | FR-002 + FR-011 |
| FR-009 (generation metadata / provenance) | FR-011 |
| NFR-002 (hard quotas) | QT-001..006 + SB-005 |
| NFR-006 (degrade safely) | QT-004 |

When an issue design cites an old id, treat the new ids above as the authoritative requirement text. The design content itself is unaffected.

