# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 004: Model Config Apply Boundary

---

## Current Phase

Planning / Spec Design — Grok Red Team Review (Spec v1.0)

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring First Window: PASSED
* Deployed Branch: `claude/fervent-dirac-HJT01`
* Deployed Commit: `ffbabe8`
* Gemini Feature 004 Spec v1.0: SUBMITTED
* ChatGPT Initial Review: Direction OK — not implementation-ready; Grok review required
* Claude: HOLD — cannot implement until Grok passes Spec + Gemini v1.1 issued if required

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`3f1c9b3`

---

## Known Spec v1.0 Gaps (ChatGPT Initial Review)

1. `AI_CALLER_BLOCKED` definition insufficient — Admin SDK / Service Account must also be blocked at service guard level
2. Phase 1 scope not hard enough — must be pure dry-run only; no Firestore read/write, no approvals, no settings write
3. Firestore schema missing critical fields — tenantId, configVersion, sourceRecommendationId, approvalId, approvedByHumanUserId, appliedByHumanUserId, previousVersion, newVersion, rollbackTargetVersion, auditTrailId, status machine
4. Rollback design too simplified — rollback must also require human approval, audit trail, version conflict check, and produce new version or immutable rollback event
5. `weights sum = 1.0` may be incorrect — must clarify if weights are normalized (sum=1) or independent multipliers (each bounded, no sum constraint)
6. Audit trail metadata incomplete — missing previousVersion, newVersion, diffHash, approvedByHumanUserId, appliedByHumanUserId, approvalReason, rollbackReference, configBeforeHash, configAfterHash, aiCanApply=false, requiresHumanApproval=true

---

## Allowed in this phase

* Grok red team review of Feature 004 Spec v1.0
* Gemini produce Spec v1.1 if required by Grok
* Feature 004 requirements discussion
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not add UI
* Do not add Netlify Functions
* Do not modify settings
* Do not apply model config
* Do not allow AI to apply model config
* Do not allow AI to mutate rules
* Do not modify Feature 001 / 002 / 003 core flow
* Do not introduce new Firestore write paths
* Do not bypass backend guards
* Do not bypass audit trail

---

## Required Guard Rails

* Feature 004 must preserve human final control.
* AI may recommend model config changes but cannot apply them.
* Any config apply must require explicit human approval.
* Any config apply must be auditable.
* Any settings mutation must be versioned.
* Any settings mutation must support rollback or previous-version traceability.
* Rollback itself must require human approval and be auditable.
* AI cannot mutate settings, thresholds, confidence rules, or weighting formula.
* AI blocked even if using Admin SDK / Service Account — service guard must enforce.
* Feature 004 Spec must pass Grok review before Claude can implement.

---

## Team State

* Claude: HOLD
* Gemini: HOLD — await Grok review result; produce v1.1 if required
* Grok: GO — Red Team Review Spec v1.0
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Grok Red Team Review of Feature 004 Spec v1.0.
Output format:
* Total score
* Passed items
* High-risk issues
* Medium-risk issues
* Low-risk notes
* Whether to permit Claude Phase 1 (Permit / Conditional on v1.1 / Block)
* Required fixes
* Recommended next steps

---

## SSOT Update Rule

After each phase is reviewed and approved, ChatGPT will generate the next version of this file.
Claude should update this file only when explicitly instructed by ibi or ChatGPT.
If the latest ChatGPT-generated SSOT in chat differs from this file, the chat SSOT is considered newer and this file must be updated.

---

## Agent Reading Rule

Before starting implementation or review, every agent must read this file and follow only this current state.
Old conversations, previous specs, and previous phases are historical context only.
They are not active instructions unless reflected in this file.
