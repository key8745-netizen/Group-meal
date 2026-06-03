# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 003: Predictive Purchasing Optimization Engine

---

## Current Phase

Spec v1.1 Revision Required

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 002: CLOSED
- Feature 002 Final Commit: `2bf0769`
- System Integration Gate: CONDITIONALLY PASSED
- Integration Tests: 139/139 assertions pass
- Gemini Feature 003 Spec v1.0: SUBMITTED
- Grok Red Team Review v1.0: 87/100
- ChatGPT Decision: Spec v1.0 not ready for Claude; Gemini must produce Spec v1.1

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

Pending Feature 003 Spec v1.1

---

## Allowed in this phase

- Gemini revises Feature 003 Spec v1.1
- Grok reviews Feature 003 Spec v1.1
- Strengthen `PredictionInputSummary`
- Add `containsRawData: false`
- Add `dataQualityScore`
- Add `sourceAggregationLevel`
- Add `tenantConsistencyCheck`
- Add `warnings`
- Define multi-source small-group suppression
- Define prediction factor formula and clamp rules
- Define max purchase limit and negative quantity handling
- Define human-approved model config workflow
- Define full audit trail metadata
- Expand BlockedReason list
- Define Claude Phase 1 pure computation scope
- Docs / SSOT update only

---

## Forbidden in this phase

- Do not let Claude implement code
- Do not write Firestore
- Do not modify inventory
- Do not modify purchaseOrders
- Do not modify settings
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not create UI
- Do not add Netlify Functions
- Do not modify Feature 001 / Feature 002 core logic
- Do not allow AI to mutate rules
- Do not allow AI to auto-adjust wasteFactorWarning
- Do not allow raw documents into prediction engine
- Do not treat Spec v1.0 as implementation-ready

---

## Required Guard Rails

- Prediction engine must remain pure computation.
- Input must be `PredictionInputSummary`, not raw Firestore documents.
- `PredictionInputSummary` must explicitly assert `containsRawData: false`.
- `PredictionInputSummary` must include data quality and aggregation safety fields.
- Small-group suppression must check historical usage, waste risk, and receiving delta separately.
- Any key source below safe sample threshold must downgrade or block prediction.
- Prediction formula must have bounded factors and clamp rules.
- All quantities must use `Grams`.
- `aiCanWrite` must be false.
- `aiCanMutateRules` must be false.
- `dataLineage.usedRawDocuments` must be false.
- Model config changes must require human approval and must not write settings in Feature 003 Phase 1.

---

## Team State

- Claude: HOLD
- Gemini: GO — Produce Feature 003 Spec v1.1
- Grok: GO — Prepare Spec v1.1 Red Team Review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Gemini Feature 003 Spec v1.1, followed by Grok Red Team Review v1.1.

Grok review should decide:
- whether Spec v1.1 is safe enough
- whether Gemini must produce v1.2
- whether Claude can begin Feature 003 Phase 1

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
