# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 005: Human-Approved Model Config Apply Execution

---

## Current Phase

Phase 2: Recommendation Integration + Dry-run Transaction Plan

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004 dry-run version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 005 Spec v1.1: PASSED
* Feature 005 Phase 1: PASSED
* Feature 005 Phase 1 Commit: `c6366ac`
* Feature 005 Phase 1 Tests: 143/143 assertions pass
* Feature 005 Phase 1 Typecheck: PASS
* Feature 005 Phase 1 Build: PASS
* Feature 005 Phase 1 Grok Code Review: 93/100
* ChatGPT Decision: Claude GO — Feature 005 Phase 2 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`c6366ac`

---

## Allowed in this phase

* Integrate Feature 003 `ModelConfigRecommendation` into Feature 005 dry-run transaction planning
* Build dry-run apply transaction plan from approved recommendation input
* Build dry-run rollback transaction plan from approved rollback input
* Strengthen applyToken binding
* Strengthen rollbackToken binding (must include rollbackTargetVersion + newVersion relationship)
* Define BigInt canonical JSON behavior (BLOCKED)
* Strengthen canonical JSON edge-case tests
* Validate recommendation → approval → transaction plan continuity
* Validate approvalId / auditTrailId / tenantId continuity
* Validate expectedCurrentVersion / newVersion / rollbackTargetVersion
* Validate settingsHistory append-only write plan
* Validate idempotency lock plan
* Validate audit event plan
* Add tests
* Add docs
* SSOT update

---

## Forbidden in this phase

* Do not write Firestore
* Do not read Firestore
* Do not import `firebase-admin`
* Do not import `google-cloud-firestore`
* Do not call `runTransaction`
* Do not modify `settings`
* Do not write `settingsHistory`
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
* Do not modify Feature 004 dry-run boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Phase 2 must remain dry-run transaction planning only.
* Transaction plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Idempotency lock must remain plan-only.
* No real transaction may be executed.
* No real settings mutation may occur.
* No real settingsHistory write may occur.
* Tenant hard guard must execute before all other validation.
* AI caller must be blocked.
* Human approval must remain required.
* `approvalId`, `auditTrailId`, `tenantId`, `expectedCurrentVersion`, and `applyToken` are required for apply planning.
* `approvalId`, `auditTrailId`, `tenantId`, `expectedCurrentVersion`, `rollbackTargetVersion`, `newVersion`, and `rollbackToken` are required for rollback planning.
* Rollback must be modeled as a new human-approved change.
* Rollback must not delete or overwrite settings history.
* settingsHistory must remain modeled as immutable append-only.
* BigInt canonical JSON behavior must be explicitly defined and tested (BLOCKED).
* canonical JSON must remain deterministic.
* applyToken / rollbackToken must be deterministic and bind to all required fields.

---

## Team State

* Claude: GO — Feature 005 Phase 2 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 005 Phase 2 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 005 Phase 2 report:
* branch name
* commit hash
* changed files
* whether only allowed files were modified
* tests result
* typecheck result
* build result
* confirmation that no Firestore read/write exists
* confirmation that no firebase-admin / google-cloud-firestore import exists
* confirmation that no runTransaction exists
* confirmation that no UI was added
* confirmation that no Netlify Function was added
* confirmation that no real apply / rollback exists
* confirmation that no real approval / apply / rollback records are created
* confirmation that Feature 003 recommendation integration is dry-run only
* confirmation that transaction plans remain executable=false
* confirmation that aiCanExecute remains false
* confirmation that idempotency lock remains plan-only
* confirmation that rollbackToken includes rollbackTargetVersion + newVersion relationship
* confirmation that BigInt canonical JSON behavior is defined and tested
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
