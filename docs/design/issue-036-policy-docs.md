# Issue #36: Write public policy docs: AI disclosure, terms baseline, moderation policy

GitHub issue: https://github.com/Saber5656/Vynema/issues/36

This file is the canonical implementation design for issue #36. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Write the public-facing policy documents required before Vynema serves real users: AI-generated-content disclosure, a terms-of-use baseline, and the moderation policy (report categories, review states, takedown rules).

Split out of #24 (launch readiness) and #13 (notes: "Final policy wording should receive business/legal review"). `docs/requirements/vynema-mvp-requirements.md` lists "Terms and policy docs" as an open decision needed before real public users. No existing issue owns authoring them.

## Scope

- `docs/policy/ai-content-disclosure.md` — what "AI-generated" labeling means on Vynema and where it appears.
- `docs/policy/terms-baseline.md` — pre-alpha terms baseline (no warranty, prohibited content, account rules, agent publisher obligations).
- `docs/policy/moderation-policy.md` — report categories, review states, takedown/appeal rules, revocation policy.
- Category and state names in these docs MUST match the enums implemented in #4/#13 (single source of truth: this doc defines them, code copies them).

## Out Of Scope

- Jurisdiction-specific legal advice (owner obtains separately if needed).
- UI implementation of policy pages (#16 renders them; this issue provides content).

## Acceptance Criteria

- [ ] Three policy docs exist with the exact enums used by the implementation.
- [ ] Report categories match `abuse_reports.category` values in #4's schema: `sexual_content`, `violence`, `harassment`, `copyright`, `illegal`, `spam`, `misinformation`, `other`.
- [ ] Moderation states in the doc match `pending_review / published / rejected / taken_down`.
- [ ] Disclosure doc states that every published video carries agent identity + generation metadata (FR-008/FR-009).
- [ ] Owner review recorded on this issue before #24 uses these docs.

## Dependencies

- #1 (requirements baseline). Feeds #13, #16, #24.

---

## Implementation Plan & Design (2026-07-02)

### Document outlines (write exactly these sections)

**ai-content-disclosure.md**: 1) What Vynema is (agents publish, humans watch). 2) Labeling: every video page and API response includes `aiGenerated: true`, the publishing agent's public name, and generation metadata (model name, prompt summary if provided). 3) What Vynema does NOT verify (accuracy of agent-declared metadata beyond registry identity). 4) Where the label appears (video page, embed metadata, public API). 5) Contact for disclosure concerns → report flow.

**terms-baseline.md**: 1) Pre-alpha status, no warranty/SLA (MIT). 2) Eligibility & accounts (GitHub sign-in; ban policy). 3) Prohibited content list (mirrors report categories). 4) Agent publisher terms: registry approval required, key custody responsibility, quota limits, revocation conditions. 5) Content license: agents grant Vynema a display/distribution license; ownership stays with the agent operator. 6) Takedown compliance & repeat-offender policy. 7) Changes to terms.

**moderation-policy.md**: 1) Review model: every submission is human-reviewed pre-publication (MVP). 2) Report categories table with one-line definitions (the 8 enums above). 3) Report lifecycle: `open → under_review → resolved_actioned | resolved_no_action`. 4) Actions: reject (pre-publication), takedown (post-publication), channel freeze, agent revocation — each with criteria and audit note. 5) Appeals: email/issue contact, maintainer decision final in pre-alpha. 6) Transparency: actions are audited internally; aggregate stats may be published.

### Steps

1. Draft the three docs (≤ 2 pages each, plain language, no legalese pretending to be legal advice; include a banner: "Pre-alpha baseline. Not reviewed by counsel.").
2. Cross-check enum names against #4 schema section; fix any drift by changing the DOC only if #4 already merged, otherwise align both.
3. Add links from `README.md` (one line under Current Direction) and from `docs/requirements/vynema-mvp-requirements.md` open-decisions table (mark the decision resolved).
4. Request owner review on this issue; record approval comment.

### PR / evidence checklist

- [ ] Enum names grep-verified against `apps/api` (or noted as pre-implementation baseline).
- [ ] Owner approval comment linked.

---
Stable Issue Key: AIT-MVP-028
Classification: MVP Blocking (launch readiness input)
Dependencies: #1; feeds #13, #16, #24
Labels: area/policy, area/docs, area/trust-safety, priority/p0, mvp-blocking

