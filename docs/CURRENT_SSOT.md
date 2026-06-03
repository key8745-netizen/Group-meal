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

Phase 2: Integration with Feature 001 Suggestion Service + Dry-run Prediction Output

---

## Current Basis

* Feature 001: CLOSED
* Feature 001 Final Commit: `48c57b0`
* Feature 002: CLOSED
* Feature 002 Final Commit: `2bf0769`
* System Integration Gate: CONDITIONALLY PASSED
* Integration Tests: 139/139 assertions pass
* Gemini Feature 003 Spec v1.1: CONDITIONALLY PASSED
* Grok Red Team Review v1.1: 92/100
* Feature 003 Phase 1: PASSED
* Feature 003 Phase 1 Commit: `40c7ac8`
* Feature 003 Phase 1 SSOT Commit: `d5c82fa`
* Feature 003 Phase 1 Tests: 110/110 pass
* Feature 003 Phase 1 Grok Code Review: 93/100
* ChatGPT Decision: Claude GO - Feature 003 Phase 2 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`40c7ac8`

---

## Allowed in this phase

* Integrate Feature 003 prediction pure functions with existing Feature 001 suggestion output in dry-run mode
* Create dry-run prediction adapter
* Create prediction-enhanced suggestion preview object
* Preserve `sourceSnapshotId`
* Preserve `auditTrailId`
* Preserve `suggestionId`
* Add `predictionId`
* Add `PredictionOutput` to dataLineage as non-executable metadata
* Add tests for Feature 001 → Feature 003 continuity
* Add tests for auditTrailId / sourceSnapshotId propagation
* Add tests confirming no Firestore read/write
* Add tests confirming no executable draft purchase suggestion is created
* Add docs explaining `dataQualityScore` formula and human-approved config recommendation behavior
* SSOT update

---

## Forbidden in this phase

* Do not write Firestore
* Do not read raw Firestore documents
* Do not call `admin.firestore().set/update/add/delete`
* Do not connect UI
* Do not add Netlify Functions
* Do not call purchaseOrderService
* Do not call inventoryService
* Do not modify settings
* Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
* Do not modify Feature 001 core flow
* Do not modify Feature 002 core flow
* Do not create executable draft purchase suggestion
* Do not apply model config
* Do not auto-adjust wasteFactorWarning
* Do not auto-adjust confidence rules
* Do not allow AI to mutate rules
* Do not make prediction output actionable without human approval

---

## Required Guard Rails

* Prediction integration must remain dry-run only.
* Prediction output must be metadata, not an executable purchase action.
* Existing Feature 001 suggestion logic must remain intact.
* Feature 003 may enrich a suggestion preview, but must not change purchase flow behavior.
* All prediction outputs must include `predictionId`, `sourceSnapshotId`, and `auditTrailId`.
* `dataLineage.usedRawDocuments` must remain false.
* `aiCanWrite` must remain false.
* `aiCanMutateRules` must remain false.
* Missing `maxPurchaseLimitGrams` must remain BLOCKED.
* `tenantConsistencyCheck` must remain enforced.
* All quantities must use `Grams` / `asGrams`.
* Model config recommendation must require human approval and cannot be applied in this phase.

---

## Team State

* Claude: GO - Feature 003 Phase 2 only
* Gemini: HOLD
* Grok: Prepare Feature 003 Phase 2 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 003 Phase 2 report:
* branch name
* commit hash
* changed files
* whether only allowed files were modified
* tests result
* typecheck result
* build result
* confirmation that no Firestore read/write exists
* confirmation that no UI was added
* confirmation that no Netlify Function was added
* confirmation that purchaseOrderService / inventoryService were not called
* confirmation that Feature 001 / Feature 002 core flows were not modified
* confirmation that prediction output is dry-run only
* confirmation that no executable draft purchase suggestion is created
* confirmation that sourceSnapshotId / auditTrailId / suggestionId continuity is tested
* known limitations

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
