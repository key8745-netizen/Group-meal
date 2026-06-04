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

Phase 1: Pure Logic & Validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring First Window: PASSED
* Feature 004 Spec: CONDITIONALLY PASSED
* Grok Feature 004 Spec Review: 93/100
* ChatGPT Decision: Claude GO - Feature 004 Phase 1 only; Gemini v1.1 not required

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`ffbabe8`

---

## Allowed in this phase

* TypeScript interfaces for model config apply boundary
* Pure validators
* Config diff calculator
* Canonical JSON hash helper
* SHA-256 diff hash helper
* Version schema helper
* Apply plan dry-run helper
* Rollback plan dry-run helper
* applyToken / rollbackToken validation
* Tenant hard guard helpers
* Weight bounds validator
* Audit event pure helper
* Unit tests
* Documentation
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
* Do not apply config
* Do not rollback config
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

* Phase 1 must remain pure logic only.
* AI caller must be blocked from apply / rollback planning.
* Human approval must be required for any future apply.
* tenantId mismatch must be blocked as the first validation step.
* applyToken / rollbackToken must be validated for idempotency planning only.
* No real transaction may be executed in Phase 1.
* Config diff must use canonicalized JSON with deterministic key ordering.
* diffHash must be reproducible using SHA-256.
* Weight validation must support per-factor bounds.
* If normalized weights are used, epsilon tolerance must be defined.
* If independent multipliers are used, per-factor bounds must apply and sum-to-1 must not be required.
* Rollback must be modeled as human-approved, auditable, and version-aware.
* Rollback must not directly delete or overwrite settings history.
* All helpers must be covered by unit tests.

---

## Team State

* Claude: GO - Feature 004 Phase 1 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 004 Phase 1 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 004 Phase 1 report:
* branch name
* commit hash
* changed files
* tests result
* typecheck result
* build result
* confirmation that no Firestore read/write exists
* confirmation that no firebase-admin / google-cloud-firestore import exists
* confirmation that no real apply / rollback exists
* confirmation that no runTransaction exists
* confirmation that tenant hard guard is first validation step
* confirmation that canonical diff hash is deterministic
* confirmation that applyToken / rollbackToken are validation-only
* confirmation that weight bounds and epsilon rules are implemented
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
