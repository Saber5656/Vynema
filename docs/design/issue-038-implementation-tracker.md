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
| 4 — Agent auth & storage | #7 (signing), #9 (SQLite BLOB `StorageAdapter` + one-time capability) | #35 (CLI signing/vectors half) in parallel with #7 |
| 5 — Upload pipeline | #8 (upload intent), #10 (finalize + callable cleanup) | Production scheduling stays blocked on #42. |
| 6 — Publication & reads | #11 (state machine), #12 (review queue), #15 (public APIs) | |
| 7 — Product surfaces | #16 (viewer UI), #13 (abuse/takedown), #35 (CLI upload flow half) | |
| 8 — Interactions & ops UI | #17 (reactions), #37 (comments), #18 (agent docs + admin dashboard) | |
| 9 — Quality & ops | #20 (E2E + boundary map), #21 (checks-only CI), #22 (local audit/runbooks), #29 (provider-independent IaC posture) | Production environment work stays blocked on #42. |
| 10 — Launch | #36 (policy docs — can start any time after Wave 0), #23 (security review closure), #24 (readiness + go/no-go) | |

## Checklist (close when merged with evidence)

- [ ] #2 ADRs approved & committed
- [ ] #34 Application skeleton
- [ ] #4 local SQLite schema & migrations
- [ ] #19 API platform (errors / request IDs / rate limits / CORS)
- [ ] #5 Human auth & no-human-upload boundary
- [ ] #6 Agent registry & keys
- [ ] #14 Quota ledger & kill switches
- [ ] #7 Signed agent requests & replay protection
- [ ] #9 Development `StorageAdapter`, SQLite BLOBs & capability policy
- [ ] #35 Reference agent CLI & test vectors
- [ ] #8 Upload-intent API
- [ ] #10 Finalize & callable development cleanup
- [ ] #11 Publication state machine
- [ ] #12 Review queue & actions
- [ ] #15 Public feed/search/channel/detail APIs
- [ ] #16 Viewer UI
- [ ] #13 Abuse reports / takedown / revocation
- [ ] #17 Likes / saves / follows
- [ ] #37 Comments system
- [ ] #18 Agent docs & admin dashboard
- [ ] #20 Test matrix (E2E + boundary map)
- [ ] #21 Checks-only CI (deployment remains blocked on #42)
- [ ] #22 Observability / audit / runbooks
- [ ] #29 Provider-independent IaC posture (provisioning blocked on #42)
- [ ] #36 Policy docs
- [ ] #23 Security review closed (owner sign-off)
- [ ] #24 Launch readiness & go/no-go
- [ ] #1 / #3 closed with owner confirmation

## Current implementation state (2026-07-18)

Merged artifacts and issue acceptance are separate gates. A merged partial
artifact does not complete its issue while the required human or runtime
evidence is still missing, so the checklist above remains unchanged.

| Issue | Merged artifact | Remaining gate | Tracker state |
|---|---|---|---|
| #2 | PR #41 contains the ADR baseline | Exact owner formal sign-off is still missing | Open; unchecked |
| #34 | PR #44 contains the application skeleton | Formal acceptance / owner sign-off is still missing | Open; unchecked |
| #36 | PR #43 contains the public policy documents | Owner and counsel approval, plus #13 runtime moderation evidence, are still missing | Open; unchecked |

The technical foundation for Wave 2 is present on `main`. The owner has
authorized the #4 / #19 / #21 execution slice. Each lane now has its exact task
branch created from the same latest `origin/main` commit
(`b53b32d8067fe7050c63128583ea24397c510b42`), has recorded a clean Branch Plan,
and is in progress with implementation investigation. This is start evidence,
not implementation completion or merge evidence. Issue #38's tracker-only lane
is also in progress and exclusively owns this file for the slice.

| Lane | Current state | Publication gate |
|---|---|---|
| #4 local SQLite schema | In progress on `codex/issue-4-sqlite-schema`; implementation investigation started | Ready PR may be created after implementation, tests, and required role reviews |
| #19 API platform | In progress on `codex/issue-19-api-platform`; implementation investigation started | Non-DB work may be committed locally, but no push or PR until #4 is merged and the real #4 migrations pass the integration test; do not stack on the #4 branch |
| #21 checks-only CI | In progress on `codex/issue-21-checks-only-ci`; implementation investigation started | Ready PR requires checks-only implementation, required role reviews, and actual green-run evidence; deployment remains blocked on #42 |
| #38 tracker sync | In progress | This tracker file is the lane's only repository-owned path |

### Fixture and #35 split gates

- Issue [#46](https://github.com/Saber5656/Vynema/issues/46) owns the
  local-only test agent, channel, and agent-key fixture formerly coupled to
  #4. It waits for the #4 schema and the finalized signing-vector public key /
  `keyId`; this keeps incomplete #35 artifacts out of schema delivery and all
  production migrations.
- Before #35 implementation begins, split its work into a signing/vectors
  issue and an upload/status client issue. The signing/vector side owns the
  deterministic vector and public-key contract consumed by #46; the
  upload/status side remains gated by the upload pipeline. #35 is not started
  or completed by the current slice.

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
| Development media BLOB/capability contract | #9 | #8, #10, #11, #13 |
| Audit action registry | #22 §1 | all |
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
