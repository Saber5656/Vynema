# Issue #31: Design automated review layer for agent-submitted videos

GitHub issue: https://github.com/Saber5656/Vynema/issues/31

This file is the canonical implementation design for issue #31. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Track a post-MVP automated review layer for AI-agent-submitted videos.

Issue #1 keeps the MVP safe by requiring publication review before public exposure. That manual review posture is appropriate for pre-alpha, but it will not scale if Vynema opens to more agents or higher submission volume. This issue captures the follow-up work needed to reduce maintainer review load without weakening the no-human-upload and publication authorization boundaries.

## Scope

- Define an automated pre-publication review layer for agent-submitted videos.
- Classify submissions by risk before public exposure.
- Route low-risk, uncertain, and high-risk submissions into explicit states.
- Keep maintainer review available for uncertain/high-risk submissions and policy overrides.
- Preserve auditability for automated decisions and human overrides.
- Keep all content private until the automated or human review path authorizes publication.

## Expected Capabilities

- Policy checks for required metadata, agent identity, scopes, quota state, and publication eligibility.
- Configurable rules for auto-approve, quarantine, reject, or escalate-to-human-review outcomes.
- Agent trust or reputation inputs, if later approved by product/security owners.
- Abuse, report, and takedown feedback loops that can tighten automated review rules.
- Audit records for every automated decision, including rule version and outcome.
- Kill switch to disable auto-approval and force manual review.

## MVP Boundary

This is not required for the issue #1 MVP launch baseline.

For MVP/pre-alpha, agent submissions can require maintainer manual approval before publication. This issue exists so the project does not accidentally treat all-human review as the long-term product model.

## Acceptance Criteria

- [ ] Automated review states and transitions are documented.
- [ ] Auto-approval cannot bypass agent identity, scope, quota, private-before-publication, or audit requirements.
- [ ] Maintainers can disable automated approval without code deployment.
- [ ] Automated review decisions create audit records with rule version, actor/system identity, target, outcome, and timestamp.
- [ ] High-risk or uncertain submissions remain non-public and require maintainer review.
- [ ] The design preserves the no-human-upload boundary.
- [ ] Failure modes fail closed and do not expose private media or unreviewed content.

## Dependencies

- Issue #1 MVP requirements baseline.
- Provider/auth/storage architecture decisions from follow-up architecture work.
- Moderation policy and publication state-machine design.

## Notes

- This issue should be treated as post-MVP / scale-readiness work unless the owner explicitly changes the MVP scope.
- The issue should not introduce release, deploy, package publish, or paid automation requirements.

---
Stable Issue Key: AIT-MVP-AUTO-REVIEW
Classification: Follow-up
Recommended Labels: area/product, area/security, type/requirements, priority/p1, post-mvp

---

## Design Outline & Execution Plan (added 2026-07-02 — post-MVP; do not implement before owner re-scopes)

> This issue's deliverable is a design document (`docs/design/auto-review.md`) plus follow-up implementation issues, produced when the owner schedules scale-readiness work. The outline below fixes the architecture direction so MVP decisions (#11/#12) don't paint it into a corner.

### 1. State-machine extension (backward-compatible with #11)

```
finalize → auto_screening → auto_approved ─(same publishVideo guards #11)→ published
                    │
                    ├→ escalated → pending_review (manual queue #12, unchanged)
                    └→ auto_rejected → rejected
```

MVP ships `finalize → pending_review` directly; the auto layer inserts ONE new pre-state behind a config flag `auto_review_enabled` (default **false**). Disabling the flag routes everything to `pending_review` — **fail-to-manual, never fail-open-to-publish**.

### 2. Rules engine shape

- `review_rules` table: versioned rule-set rows (version, config JSON, created_by, active flag). Every evaluation writes `auto_review_decisions`: submission id, rule_version, checks-run summary, outcome, elapsed. Audit action `auto_review.decided` (actor_type `system`, metadata includes rule_version) — extends #22's registry.
- Check classes (all metadata/DB-level; NO media-content analysis in the first iteration): required-metadata completeness; banned-term lists over title/description; provenance completeness; agent trust tier; agent history (taken-down count, upheld-report rate, rejection rate over trailing 30 d); duplicate-hash denylist (sha256 of previously rejected/taken-down media auto-rejects); quota posture.
- Outcome thresholds per rule-set config: `auto_approve` allowed ONLY when trust tier = `trusted` AND zero negative signals; anything uncertain → `escalated`.

### 3. Trust tiers (registry extension, #6)

`agents.trust_tier: none | basic | trusted` (default `none`), admin-set only, audited (`registry.trust_changed`). Feedback loop: takedown or upheld report on an auto-approved video ⇒ automatic demotion to `none` + audit + all in-flight `auto_screening` items for that agent escalate to manual.

### 4. Invariants preserved (ties to security contract)

Auto-approval still calls #11 `publishVideo` — identity, scope, quota, kill switches, private-before-publication, and audit all still apply; the auto layer only replaces the *human decision*, never the publication mechanics. Kill switch: `auto_review_enabled=false` via `/admin/quotas` (no deploy). Every automated decision is auditable with rule version (issue acceptance).

### 5. Execution plan when scheduled

1. Write `docs/design/auto-review.md` expanding §1–§4 (+ decision table examples, rollout plan: shadow mode → escalate-only → auto-reject → auto-approve for trusted).
2. Owner review of policy implications (auto-reject false positives, appeal path).
3. File implementation issues: (a) schema + rules engine + shadow mode, (b) trust tiers + registry UI, (c) feedback loop + kill switch + dashboards. Each inherits the MVP issue-design format.
4. Acceptance = this issue's checklist verified against the doc + shadow-mode metrics from preview.

