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
- Category and state names in these docs MUST stay identical to the shared
  contract in #4's DDL and #13's moderation design. Runtime code copies these
  values when those issues are implemented. Runtime implementation and tests
  are independently owned by #4/#11/#12/#13; closing #36 neither implements
  them nor substitutes for their acceptance evidence.

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
- [ ] Owner acceptance of this pre-alpha documentation baseline is recorded on
  the issue or close-out PR before #36 closes. Counsel review remains a
  separate pre-launch gate for #24.

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
2. Cross-check enum names against #4's DDL and #13's moderation contract.
   Preserve the distinction between this versioned documentation contract and
   the runtime evidence independently produced by #4/#11/#12/#13.
3. Keep links and state synchronized in `README.md`,
   `docs/requirements/vynema-mvp-requirements.md`, `PROJECT-STATUS.md`, and the
   #38 tracker.
4. Record owner acceptance of the pre-alpha documentation baseline before
   closing #36. Counsel review and any final hosted-service terms remain #24
   launch-readiness inputs, not implementation work for this issue.

### PR / evidence checklist

- [x] Enum names grep-verified against #4/#13's canonical design contracts;
  this documentation close-out is not reported as runtime acceptance evidence
  for #4/#11/#12/#13.
- [x] README, requirements, project status, and #38 tracker links/state are
  synchronized by the close-out change.
- [ ] Owner acceptance comment linked before issue closure.

## Close-out Audit (2026-08-27)

PR #43 merged only the three public policy documents. It did not itself
implement #4's SQLite schema, #11's publication-state writer, #12's
manual-review flow, #13's report/moderation routes, or #15/#16's public
disclosure surfaces. Those issues independently own their runtime tests and
acceptance evidence.

| Acceptance area | Repository evidence | Close-out disposition |
|---|---|---|
| AI disclosure | `docs/policy/ai-content-disclosure.md`; FR-002 and FR-011 | Documentation contract complete; #15/#16 runtime evidence remains downstream |
| Pre-alpha terms | `docs/policy/terms-baseline.md` | Baseline wording complete; not operative hosted-service terms |
| Report categories and states | `docs/policy/moderation-policy.md`; #4 DDL; #13 design | Exact values aligned; #4/#11/#12/#13 independently own runtime implementation and tests |
| Moderation actions and transparency | `docs/policy/moderation-policy.md` | Required sections complete; no runtime behavior or release is claimed |
| Owner/legal gate | Issue or close-out PR comment; #24 launch checklist | Owner accepts the documentation baseline before #36 closes; counsel review remains required before hosted launch |

Closing #36 therefore accepts the versioned pre-alpha policy documentation
only. It does not approve a release, deploy a service, create legal obligations,
or satisfy the runtime acceptance criteria owned by #4, #11, #12, #13, #15, or
#16.

---
Stable Issue Key: AIT-MVP-028
Classification: MVP Blocking (launch readiness input)
Dependencies: #1; feeds #13, #16, #24
Labels: area/policy, area/docs, area/trust-safety, priority/p0, mvp-blocking
