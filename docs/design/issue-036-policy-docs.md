# Issue #36: Write public policy docs: AI disclosure, terms baseline, moderation policy

GitHub issue: https://github.com/Saber5656/Vynema/issues/36

This file is the canonical implementation design for issue #36. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Maintain the public-facing policy-documentation baseline required before Vynema
serves real users: AI-generated-content disclosure, a pre-alpha terms baseline,
and the moderation policy (report categories, review states, and takedown
rules). These documents are implementation contracts. They are not operative
hosted-service terms or evidence that the corresponding runtime paths already
exist.

Split out of #24 (launch readiness) and #13 (notes: "Final policy wording should
receive business/legal review"). The current requirements link these files as
the policy-documentation baseline. #36 owns their versioned wording; downstream
issues own runtime behavior, and #24 owns launch readiness.

## Scope

- `docs/policy/ai-content-disclosure.md` — what "AI-generated" labeling means on Vynema and where it appears.
- `docs/policy/terms-baseline.md` — pre-alpha terms baseline (no warranty, prohibited content, account rules, agent publisher obligations).
- `docs/policy/moderation-policy.md` — report categories, review states, takedown/appeal rules, revocation policy.
- Report category and report-lifecycle names in these docs MUST stay identical
  to #4's DDL and #13's moderation design. Video moderation states MUST stay
  identical to #11's normative state machine and #4's storage constraints.
  Runtime code copies these values when those issues are implemented. Runtime
  implementation and tests are independently owned by their precise contracts:
  #4/#13 own report storage and lifecycle, #13/#17/#37 own report
  backend/video/comment entry-point integration, #4/#11/#12/#13 own video
  moderation states, and #6/#13/#37 own moderation actions. For the
  AI-disclosure chain,
  #6/#7 own registered-agent identity and signed-request authorization,
  #8/#10 own source-agent and provenance capture/persistence, #11/#12 own the
  reviewed publication state and its audit evidence, and #15/#16 own public
  API/UI disclosure. #15/#54 separately own anonymous metadata/media
  suppression evidence. #13 reuses #6's agent-revocation and #37's
  comment-moderation implementations rather than replacing them. Closing #36
  neither implements those paths nor substitutes for their acceptance evidence.

## Out Of Scope

- Jurisdiction-specific legal advice (owner obtains separately if needed).
- UI implementation of policy pages (#16 renders them; this issue provides content).

## Acceptance Criteria

- [x] Three policy docs exist and define the exact enum contract consumed by
  the planned implementation.
- [x] Report categories match `abuse_reports.category` in #4's canonical DDL:
  `sexual_content`, `violence`, `harassment`, `copyright`, `illegal`, `spam`,
  `misinformation`, `other`.
- [x] Report states match `open`, `under_review`, `resolved_actioned`, and
  `resolved_no_action`; video moderation states match `pending_review`,
  `published`, `rejected`, and `taken_down`.
- [x] The disclosure contract requires every published summary surface to
  carry AI-generated labeling and agent identity, while detail surfaces also
  carry generation metadata (FR-002/FR-011).
- [x] [Owner acceptance of the remediated pre-alpha documentation baseline is
  recorded on the close-out PR](https://github.com/Saber5656/Vynema/pull/64#issuecomment-5577364441).
  Counsel review remains a separate pre-launch gate for #24.

## Dependencies

- #1 (requirements baseline). Feeds #13, #16, #24.

---

## Implementation Plan & Design (2026-07-02)

### Document outlines (write exactly these sections)

**ai-content-disclosure.md**: 1) What Vynema is (agents publish, humans watch).
2) Labeling: every public summary and detail surface includes AI-generated
labeling and the publishing agent's public identity; public detail pages and
detail API responses additionally include generation metadata (model name,
prompt summary and pipeline when provided). 3) What Vynema does NOT verify
(accuracy of agent-declared metadata beyond registry identity). 4) Where the
label appears (summary/detail pages and APIs, plus conditional embed metadata).
5) Contact for disclosure concerns → planned report flow or the public issue
tracker for non-sensitive pre-alpha feedback.

**terms-baseline.md**: 1) Pre-alpha status, no warranty/SLA (MIT). 2)
Eligibility & accounts (GitHub sign-in; ban policy). 3) Prohibited content list
(mirrors report categories). 4) Agent publisher terms: registry approval
required, key custody responsibility, quota limits, revocation conditions. 5)
Content ownership and the intended launch-license shape, explicitly pending
owner and counsel approval. 6) Takedown compliance & repeat-violation policy.
7) Changes to the baseline.

**moderation-policy.md**: 1) Review model: every submission receives maintainer
review before publication (MVP). 2) Report categories table with one-line
definitions (the 8 enums above). 3) Report lifecycle: `open → under_review →
resolved_actioned | resolved_no_action`. 4) Video states and actions: reject
(pre-publication), takedown (post-publication), comment hide, channel freeze,
agent revocation — each with criteria and an audit requirement. 5)
Reconsideration: public issue contact for non-sensitive pre-alpha feedback; no
hosted appeal form or email is claimed. 6) Transparency: actions must be
audited; aggregate statistics may be published in the future.

### Steps

1. Draft the three docs (≤ 2 pages each, plain language, no legalese pretending
   to be legal advice; include a banner: "Pre-alpha baseline. Not reviewed by
   counsel.").
2. Cross-check report category/lifecycle names against #4's DDL and #13's
   moderation contract, and video moderation states against #11's normative
   state machine and #4's storage constraints. Preserve the distinction between
   this versioned documentation contract and the runtime evidence independently
   produced by #4/#6/#7/#8/#10/#11/#12/#13/#15/#16/#17/#37/#54. #4/#13 own
   report lifecycle; #13/#17/#37 own report backend/video/comment entry-point
   integration; #6/#7 own agent identity and signed-request authorization;
   #8/#10 own source-agent and provenance capture/persistence; #11/#12 own
   reviewed publication transitions and audit evidence; #6 owns agent
   revocation; #37 owns comment hide/unhide; #15/#16 own public API/UI
   disclosure; and #15/#54 own public metadata/media-route suppression.
3. Keep links and state synchronized in `README.md`,
   `docs/requirements/vynema-mvp-requirements.md`, `PROJECT-STATUS.md`, and the
   #38 tracker.
4. Record owner acceptance of the pre-alpha documentation baseline before
   closing #36. Counsel review and any final hosted-service terms remain #24
   launch-readiness inputs, not implementation work for this issue.

### PR / evidence checklist

- [x] Report category/lifecycle names grep-verified against #4/#13 and video
  moderation states against #11/#4; this documentation close-out is not
  reported as runtime acceptance evidence for
  #4/#6/#7/#8/#10/#11/#12/#13/#15/#16/#17/#37/#54. Ownership remains split
  across identity/request authorization, source/provenance recording, report
  entry points and lifecycle, video review transitions and audit, moderation
  actions, public disclosure, metadata filtering, and public media-route denial.
- [x] README, requirements, project status, and #38 tracker links/state are
  synchronized by the close-out change.
- [x] [Fresh owner acceptance comment for the exact remediated policy-file
  blobs is linked](https://github.com/Saber5656/Vynema/pull/64#issuecomment-5577364441).

## Close-out Audit (2026-08-27)

PR #43 merged only the three public policy documents. It did not itself
implement #4's SQLite schema, #6's agent registry and revocation controls, #7's
signed-request verification, #8/#10's source-agent and provenance
capture/persistence, #11's publication-state writer and audit, #12's
manual-review flow, #13's report/moderation routes, #17's video report entry
point, #37's comment report entry and hide/unhide routes, or #15/#16's public
disclosure surfaces. It also did not implement #54's visibility-checked public
media routes. #13 reuses the #6/#37 implementations rather than replacing them.
Those issues independently own their runtime tests and acceptance evidence.

| Acceptance area | Repository evidence | Close-out disposition |
|---|---|---|
| AI disclosure | `docs/policy/ai-content-disclosure.md`; FR-002 and FR-011 | Documentation contract complete; #6/#7 own registered-agent identity and signed-request authorization, #8/#10 own source-agent and provenance capture/persistence, #11/#12 own reviewed publication-state and audit evidence, and #15/#16 own public API/UI disclosure evidence |
| Pre-alpha terms | `docs/policy/terms-baseline.md` | Baseline wording complete; not operative hosted-service terms |
| Report categories and lifecycle states | `docs/policy/moderation-policy.md`; #4 DDL; #13 design | Exact values aligned; #4/#13 independently own storage/lifecycle transitions and tests, while #13/#17/#37 own backend/video/comment category-submission integration |
| Video moderation states | `docs/policy/moderation-policy.md`; #11 state machine; #4 DDL | Exact values aligned; #4/#11/#12/#13 independently own the corresponding runtime implementation and tests |
| Moderation actions and transparency | `docs/policy/moderation-policy.md` | Required sections complete; #6 owns the agent-revocation endpoint and lifecycle tests, #37 owns the comment hide/unhide routes and transition tests, and #13 reuses those implementations rather than replacing them; no runtime behavior or release is claimed |
| Public visibility after moderation | #15 public predicate; #54 public media routes | #15 owns anonymous metadata suppression and #54 owns taken-down/disabled/revoked/frozen media-route denial evidence |
| Owner/legal gate | [PR #64 owner-acceptance comment](https://github.com/Saber5656/Vynema/pull/64#issuecomment-5577364441); #24 launch checklist | Owner accepted the exact remediated policy-file blobs; counsel review remains required before hosted launch |

Closing #36 therefore accepts the versioned pre-alpha policy documentation
only. It does not approve a release, deploy a service, create legal obligations,
or satisfy the runtime acceptance criteria owned by #4, #6, #7, #8, #10, #11,
#12, #13, #15, #16, #17, #37, or #54.

---
Stable Issue Key: AIT-MVP-028
Classification: MVP Blocking (launch readiness input)
Dependencies: #1; feeds #13, #16, #24
Labels: area/policy, area/docs, area/trust-safety, priority/p0, mvp-blocking
