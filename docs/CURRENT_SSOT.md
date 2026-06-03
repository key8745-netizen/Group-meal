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

Phase 3: Enhanced Prediction Logic, Human Config Recommendation, Final Hardening

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
* Feature 003 Phase 2: PASSED
* Feature 003 Phase 2 Commit: `98817e7`
* Feature 003 Phase 2 SSOT Commit: `791863c`
* Feature 003 Phase 2 Tests: 153/153 pass
* Feature 003 Phase 2 Grok Code Review: 92/100
* ChatGPT Decision: Claude GO - Feature 003 Phase 3 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`98817e7`

---

## Allowed in this phase

* Enhanced prediction factor logic
* Final hardening of PredictionEnhancedSuggestionPreview type safety
* Literal hard-lock: `executable: false`
* Literal hard-lock: `aiCanWrite: false`
* Literal hard-lock: `aiCanMutateRules: false`
* Human-approved model config recommendation improvements
* Recommendation-only model config output
* Advanced tests for Feature 001 → Feature 003 continuity
* Advanced tests for dry-run output immutability
* Advanced tests for prediction output not becoming executable
* Documentation for `dataQualityScore` formula weights and rationale
* Documentation for human-approved config recommendation behavior
* Docs / SSOT update

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
* Do not apply model config
* Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
* Do not modify Feature 001 core flow
* Do not modify Feature 002 core flow
* Do not create executable draft purchase suggestion
* Do not let prediction output become an executable purchase action
* Do not auto-adjust wasteFactorWarning
* Do not auto-adjust confidence rules
* Do not allow AI to mutate rules

---

## Required Guard Rails

* Feature 003 remains pure computation.
* Prediction output remains dry-run only.
* Prediction preview must never be executable.
* Existing Feature 001 suggestion logic must remain unchanged.
* Prediction may enrich a preview, but must not change purchase flow behavior.
* `PredictionEnhancedSuggestionPreview.executable` must be literal `false`.
* `aiCanWrite` must be literal `false`.
* `aiCanMutateRules` must be literal `false`.
* `dataLineage.usedRawDocuments` must be literal `false`.
* All outputs must preserve `sourceSnapshotId`, `auditTrailId`, `suggestionId`, and `predictionId`.
* Human-approved model config recommendation must remain recommendation-only.
* No settings write is allowed.
* No executable draft purchase suggestion is allowed.

---

## Team State

* Claude: GO - Feature 003 Phase 3 only
* Gemini: HOLD
* Grok: Prepare Feature 003 Phase 3 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 003 Phase 3 report:
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
* confirmation that prediction preview is never executable
* confirmation that model config recommendation is not applied
* confirmation that aiCanWrite / aiCanMutateRules remain false
* confirmation that dataLineage.usedRawDocuments remains false
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
