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

## Dependency-ordered delivery stages

This is the canonical execution order approved in planning issue
[#53](https://github.com/Saber5656/Vynema/issues/53). A stage may prepare one
dependency edge ahead only in feature-local paths. Shared-surface integration,
push, and ready-PR publication wait for every hard predecessor to merge.

| Stage | Parallel delivery units | Exit gate |
|---|---|---|
| S0 — Control | Read-only #1/#2/#3/#34/#36 disposition, #21/PR #52 ownership, and this planning sync | #53 planning PR merged; no implementation writer before this gate |
| S1 — Foundation | #4, #19 feature-local shadow, #35 signing/keygen/vectors (#35S); optional #3 or #21 follow-up | #4 merged before #19 integration; #35S is independently publishable |
| S2 — Shared foundations | #22 audit core (#22A); #5 feature-local preparation; #14 quota-core preparation; #9 storage-write (#9A) one-edge shadow; #46 after #4+#35S | #22A merges before #5/#14 audit integration; #5 merges before #14 admin-route integration, push, and ready PR; shared-surface token serializes integration; #9A integrates only after #4+#14+#19 |
| S3 — Identity/upload chain | #6→#7, #9A, #46/#21 sidecars, then #8→#10 | #8 waits for #6+#7+#14+#9A; #10 waits for #7+#8+#9A+#14 |
| S4 — Publication/agent ops | #11 and #18 | #11 and #18 merged; #11 precedes #12 |
| S5 — Reads/review/CLI | #15, #12, #56 upload/finalize/status CLI (#35U) | #56 waits for #8+#10+#18; shared integration for #15/#12 is serialized |
| S6 — Product fan-out | #16 UI/mock preparation, #54 public media reads (#9B), #37 backend | #54 waits for #9A+#15; #16 integration and ready PR wait for #54; #37 full UI integration waits for #16 |
| S7 — Moderation/interactions | #13, #55 admin audit/observability/runbooks (#22B) prep, #20 prep, then #17 | #13 precedes #17; #55 stays preparatory until emitters/#18/#20 exist |
| S8 — Quality/security | #20 final, then #55 final; #23 local-core security closure | #20 final waits for #54/#56 and implemented product surfaces; #55 final then consumes #20 final plus implemented audit emitters |
| S9 — Release branch | #42 final decision, then #29 + production implementation Issues, #23 final addendum, #24 | Merge, release, provisioning, and deploy remain separate human gates |

### Canonical hard dependency DAG

The aliases in parentheses identify the retained parent Issue numbers.

```text
#4 + #19                         -> #22A (#22)
#4 + #19 + #22A                 -> #5 ready PR
#4 + #19 + #22A + #5            -> #14 admin routes/push/ready PR
#4 + #14 + #19                  -> #9A (#9)
#4 + #19 + #5                   -> #6
#6 + #35S (#35)                 -> #7 ready PR
#6 + #7 + #14 + #9A             -> #8
#7 + #8 + #9A + #14             -> #10
#4 + #9A + #10 + #14            -> #11
#4 + #5 + #9A + #11 + #14       -> #12
#4 + #9A + #11 + #14 + #19      -> #15
#6 + #7 + #8 + #10 + #14 + #35S -> #18
#8 + #10 + #18                  -> #35U (#56)
#9A + #15                       -> #9B (#54)
#9B (#54)                        -> #16 integration/ready PR
#5 + #15 + #16 + #19            -> #37 full integration
#5 + #6 + #11 + #12 + #15 + #36 + #37 -> #13
#5 + #13 + #15 + #16 + #19      -> #17
#4 + #5 + #6 + #7 + #8 + #9A + #10 + #11 + #12 + #13 + #14 + #15 + #16 + #17 + #18 + #19 + #34 + #35S + #36 + #37 + #9B (#54) + #35U (#56) -> #20 final
#22A + #18 + #20 final + #9B (#54) + implemented feature audit emitters -> #22B (#55) final
#20 final + #22B (#55) final + fresh pricing/limits evidence -> #42 final decision
#42 -> #29 + production implementation Issues -> #23 final addendum -> #24
```

#7 may prepare feature-local canonicalization/verifier work after #6's
contract is fixed, but its vector-consumption integration and ready PR require
#35S. This is a design-input/ready-PR gate, not a cyclic merge dependency.

## Checklist (close when merged with evidence)

- [ ] #2 ADRs approved & committed
- [ ] #34 Application skeleton accepted
- [ ] #4 local SQLite schema & migrations
- [ ] #19 API platform (errors / request IDs / rate limits / CORS)
- [ ] #22 Audit writer, action registry, and metadata redaction (#22A)
- [ ] #5 Human auth & no-human-upload boundary
- [ ] #6 Agent registry & keys
- [ ] #14 Quota ledger & kill switches
- [ ] #35 Keygen, signing, and deterministic vectors (#35S)
- [ ] #7 Signed agent requests & replay protection
- [ ] #9 Development `StorageAdapter`, SQLite BLOB writes, and one-time capabilities (#9A)
- [ ] #8 Upload-intent API
- [ ] #10 Finalize & callable development cleanup
- [ ] #11 Publication state machine
- [ ] #18 Agent docs, status API, and admin dashboard
- [ ] #15 Public feed/search/channel/detail APIs
- [ ] #12 Review queue & actions
- [ ] #56 Reference upload/finalize/status CLI (#35U)
- [ ] #16 Viewer UI
- [ ] #54 Development public media reads and policy evidence (#9B)
- [ ] #37 Comments system
- [ ] #13 Abuse reports / takedown / revocation
- [ ] #17 Likes / saves / follows
- [ ] #20 Test matrix (E2E + boundary map)
- [ ] #21 Checks-only CI (deployment remains blocked on #42)
- [ ] #55 Admin audit, observability docs, runbooks, and ops status (#22B)
- [ ] #29 Provider-independent IaC posture (provisioning blocked on #42)
- [ ] #36 Policy docs accepted
- [ ] #23 Security review closed (owner sign-off)
- [ ] #24 Launch readiness & go/no-go
- [ ] #1 / #3 closed with owner confirmation

## Current implementation state (2026-07-17)

Merged artifacts and issue acceptance are separate gates. A merged partial
artifact does not complete its issue while the required human or runtime
evidence is still missing, so the checklist above remains unchanged.

| Issue | Merged artifact | Remaining gate | Tracker state |
|---|---|---|---|
| #2 | PR #41 contains the ADR baseline | Exact owner formal sign-off is still missing | Open; unchecked |
| #34 | PR #44 contains the application skeleton | Formal acceptance / owner sign-off is still missing | Open; unchecked |
| #36 | PR #43 contains the public policy documents | Owner and counsel approval, plus #13 runtime moderation evidence, are still missing | Open; unchecked |

The technical foundation for Wave 2 is present on `main`. The owner has
authorized the #4 / #19 / #21 execution slice. Each lane now has its exact local
task branch created from the same latest `origin/main` commit
(`b53b32d8067fe7050c63128583ea24397c510b42`), has recorded a clean Branch Plan,
and is in progress with implementation investigation. The #4 and #19 branches
are local-only planning evidence and are not published for review; the #21
branch is published as PR #48. These branch names are start evidence, not
implementation completion or merge evidence. Issue #38's tracker-only lane is
also in progress and exclusively owns this file for the slice.

| Lane | Current state | Publication gate |
|---|---|---|
| #4 local SQLite schema | In progress on local-only branch `codex/issue-4-sqlite-schema`; implementation investigation started | Ready PR may be created after implementation, tests, and required role reviews |
| #19 API platform | In progress on local-only branch `codex/issue-19-api-platform`; implementation investigation started | Non-DB work may be committed locally, but no push or PR until #4 is merged and the real #4 migrations pass the integration test; do not stack on the #4 branch |
| #21 checks-only CI | Published as PR #48 from `codex/issue-21-checks-only-ci`; implementation and hosted check evidence are available for review | Ready PR requires checks-only implementation, required role reviews, and actual green-run evidence; deployment remains blocked on #42 |
| #38 tracker sync | In progress | This tracker file is the lane's only repository-owned path |

### Approved split gates

- Stage 1 of [#53](https://github.com/Saber5656/Vynema/issues/53)
  created [#54](https://github.com/Saber5656/Vynema/issues/54) (#9B),
  [#55](https://github.com/Saber5656/Vynema/issues/55) (#22B), and
  [#56](https://github.com/Saber5656/Vynema/issues/56) (#35U). The retained
  parents are #9A/#9, #22A/#22, and #35S/#35.
- [#46](https://github.com/Saber5656/Vynema/issues/46) waits for the #4 schema
  and #35S's finalized signing-vector public key/`keyId`; it never stores a
  private-key fixture and remains local-development-only.
- #9A integrates only after #4, #14, and #19 merge. #54 starts only after #9A
  and #15 merge.
- #5's feature-local code and #14's quota core can prepare after #4+#19, but
  their audit integration waits for #22A. #14 admin-route integration, push, and
  ready-PR publication additionally wait for #5's canonical
  `requireRole("admin")` and unauthorized/forbidden boundary tests; #14 must not
  introduce a local auth stub or parallel role checker. All later feature
  emitters consume the same typed writer, action registry, and redaction
  contract. #20 can prepare feature-local tests, but its final gate waits for
  implemented product surfaces, #54, and #56. #55 can prepare feature-local
  docs, but its final gate waits for #22A, #18, #20 final, #54, and implemented
  feature audit emitters.
- #35S owns keygen/signing/vectors. #56 owns upload/finalize/status and starts
  only after #8, #10, and #18 merge.
- #31 remains post-MVP. Merged #34/#36/#38 artifacts are not reimplemented;
  their remaining acceptance gates stay explicit.

## Cross-issue contracts (quick index)

| Contract | Defined in | Consumed by |
|---|---|---|
| ADRs (stack, conventions, quota defaults) | #2 | all |
| DDL & enums | #4 | all backend |
| Error codes & envelope | #19 | all APIs + web |
| Signing canonical string and vectors | #7 normative + #35S/#35 vectors | #8, #10, #18, #56 |
| keyId derivation | #6 §1 = #35S/#35 | #7, #46 |
| Public visibility predicate | #15 §1 | #12, #13, #17, #37, #16, #54 |
| Storage accounting (reservation model) | #10 (canonical) = #14 (amended) | #8, #11 |
| Video status transitions (single writer) | #11 §1 | #12, #13 |
| Development media write/capability contract | #9A/#9 | #8, #10, #11, #12 preview, #54 |
| Development public media-read boundary | #9B/#54 + #15 predicate | #13, #16 integration/ready PR, #20 final, #55 runbooks |
| Audit action registry and metadata redaction | #22A/#22 | #5, #14, all later feature emitters, #55 |
| Whole-product E2E and boundary evidence | #20 | #55, #23, #24, #42 |
| Admin audit/runbook evidence | #22B/#55 | #23, #24, #42 |
| Report/moderation enums | #36 = #4 DDL | #13, #37 |

Post-MVP (not in the waves): #31 automated review layer.


## Update 2026-07-03: ADR baseline in repo + requirements renumbering

1. **Historical note, superseded 2026-07-15:** PR #39 recorded an earlier single-Worker / GitHub OAuth / public-bucket baseline. The current development authority is the amended ADR set: local same-origin runtime, local SQLite metadata/media BLOBs, and transactional visibility. Production hosting/runtime/storage/deployment is undecided and launch-blocked by #42.
2. **Requirements were renumbered** by PR #32 (`docs/requirements/vynema-mvp-requirements.md`, 2026-06-28). Issue design sections written 2026-07-02 cite the OLD FR ids in a few places. Mapping for implementers:

| Old id (in issue designs) | New id (current requirements doc) |
|---|---|
| FR-007 (no human upload UI/API) | FR-006 (UI) + FR-007 (API) + SB-001 |
| FR-008 (AI-generated disclosure) | FR-002 + FR-011 |
| FR-009 (generation metadata / provenance) | FR-011 |
| NFR-002 (hard quotas) | QT-001..006 + SB-005 |
| NFR-006 (degrade safely) | QT-004 |

When an issue design cites an old id, treat the new ids above as the authoritative requirement text. The design content itself is unaffected.
