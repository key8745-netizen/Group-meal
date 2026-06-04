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

Phase 2: Feature 003 Recommendation Integration + Dry-run Apply Plan — COMPLETED

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring First Window: PASSED
* Feature 004 Spec v1.2: CONDITIONALLY PASSED
* Feature 004 Phase 1: PASSED
* Feature 004 Phase 1 Commit: `340ee9d`
* Feature 004 Phase 1 Tests: 1184/1184 pass
* Feature 004 Phase 1 Grok Code Review: 94/100
* ChatGPT Decision: Claude GO - Feature 004 Phase 2 only
* Feature 004 Phase 2: COMPLETED
* Feature 004 Phase 2 Tests: 52/52 pass (210 total across Phases 1+2)
* Feature 004 Phase 2 typecheck: CLEAN

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`58623a9`

---

## Allowed in this phase

* Integrate Feature 003 ModelConfigRecommendation with Feature 004 dry-run apply planning
* Create dry-run apply plan from recommendation + simulated human approval
* Create dry-run rollback plan from version metadata
* Simulate human approval object without writing it
* Validate recommendation → approval → apply plan continuity
* Validate sourceRecommendationId
* Validate humanApprovalId
* Validate auditTrailId
* Validate tenantId
* Validate config diff and diffHash
* Validate configBeforeHash / configAfterHash
* Validate applyToken / rollbackToken
* Strengthen canonical JSON edge-case tests
* Strengthen rollback token / idempotency planning tests
* Add docs
* Add tests
* SSOT update

---

## Forbidden in this phase

* Do not write Firestore
* Do not read Firestore
* Do not import firebase-admin
* Do not import google-cloud-firestore
* Do not call runTransaction
* Do not modify settings
* Do not write settingsHistory
* Do not create real approval records
* Do not create real apply records
* Do not create real rollback records
* Do not actually apply config
* Do not actually rollback config
* Do not add UI
* Do not add Netlify Functions
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not allow AI to apply config
* Do not allow AI to mutate rules
* Do not change wasteFactorWarning automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Phase 2 must remain dry-run only.
* All integration output must be non-executable.
* ModelConfigRecommendation may be consumed only as input to dry-run planning.
* Simulated human approval must not become a persisted approval record.
* Apply plan must have executable: false.
* Rollback plan must have executable: false.
* aiCanApply must remain false.
* aiCanRollback must remain false.
* Human approval must remain required for any future real apply / rollback.
* Tenant hard guard must execute before all other validation.
* tenantId mismatch must be BLOCKED.
* Missing sourceRecommendationId must be BLOCKED.
* Missing humanApprovalId must be BLOCKED.
* Missing auditTrailId must be BLOCKED.
* applyToken / rollbackToken remain validation-only.
* No real transaction may be executed in Phase 2.
* Config diff must remain deterministic.
* diffHash must remain reproducible using SHA-256.
* Rollback must remain dry-run and version-aware.
* Rollback must not delete or overwrite settings history.
* All helpers must be covered by unit tests.

---

## Team State

* Claude: GO - Feature 004 Phase 2 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 004 Phase 2 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Grok Feature 004 Phase 2 code review → ChatGPT gatekeeper decision.

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
