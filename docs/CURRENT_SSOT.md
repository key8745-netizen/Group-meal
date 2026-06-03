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

Phase 1: Pure Computation Types, Validators, Formula, Tests

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 002: CLOSED
- Feature 002 Final Commit: `2bf0769`
- System Integration Gate: CONDITIONALLY PASSED
- Integration Tests: 139/139 assertions pass
- Gemini Feature 003 Spec v1.1: CONDITIONALLY PASSED
- Grok Red Team Review v1.1: 92/100
- ChatGPT Decision: Claude GO - Feature 003 Phase 1 only; no Gemini v1.2 required

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`40c7ac8` — Feature 003 Phase 1 complete (110/110 tests, typecheck clean, build clean)

---

## Allowed in this phase

- TypeScript interfaces (`PredictionInputSummary`, `PredictionOutput`, `ModelConfigRecommendation`)
- `validatePredictionInputSummary`
- `applySmallGroupSuppression`
- `calculateDataQualityScore`
- `calculatePredictionFactors`
- `calculatePredictionOutput`
- `evaluatePredictionConfidenceTier`
- `createPredictionAuditEvent`
- `createModelConfigRecommendation` pure helper
- BlockedReason additions to `aiBoundary.ts`
- Tests for all of the above
- `docs/FEATURE_003_PREDICTIVE_PURCHASING_PHASE1.md`
- `docs/CURRENT_SSOT.md`

---

## Forbidden in this phase

- Do not write Firestore
- Do not read raw Firestore documents
- Do not call `admin.firestore().set/update/add/delete`
- Do not connect UI
- Do not add Netlify Functions
- Do not call purchaseOrderService
- Do not call inventoryService
- Do not modify settings
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not modify Feature 001 core flow
- Do not modify Feature 002 core flow
- Do not create executable draft purchase suggestion
- Do not allow AI to mutate rules
- Do not apply model config
- Do not auto-adjust wasteFactorWarning
- Do not auto-adjust confidence rules

---

## Required Guard Rails

- Prediction engine must be pure computation.
- `PredictionInputSummary.containsRawData` must be false.
- `tenantConsistencyCheck.allSourcesMatchTenant` must be true or BLOCKED.
- `sourceAggregationLevel === 'blocked_single_source'` must be BLOCKED.
- `dataQualityScore` must be computed by explicit formula.
- `maxPurchaseLimitGrams` missing must be BLOCKED.
- All quantities must use `Grams` branded type and go through `asGrams()` or equivalent.
- Small-group suppression must check historicalUsage, wasteRisk, and receivingDelta separately.
- Any key source below safe threshold must downgrade or block prediction.
- Prediction factors must be bounded and clamped.
- `aiCanWrite` must be false.
- `aiCanMutateRules` must be false.
- `dataLineage.usedRawDocuments` must be false.
- Model config recommendations must require human approval and cannot be applied in this phase.

---

## Team State

- Claude: GO — Feature 003 Phase 1 only
- Gemini: HOLD
- Grok: Prepare Feature 003 Phase 1 code review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Claude Feature 003 Phase 1 report:
- branch name
- commit hash
- changed files
- whether only allowed files were modified
- tests result
- typecheck result
- build result
- confirmation that no Firestore read/write exists
- confirmation that no UI was added
- confirmation that no Netlify Function was added
- confirmation that purchaseOrderService / inventoryService were not called
- confirmation that dataQualityScore formula was implemented
- confirmation that maxPurchaseLimitGrams missing is BLOCKED
- confirmation that tenantConsistencyCheck is enforced in validator
- confirmation that all quantities use Grams / asGrams
- known limitations

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
