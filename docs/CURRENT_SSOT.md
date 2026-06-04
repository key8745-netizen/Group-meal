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

Phase 3: Enhanced Apply Plan Logic, Simulated Approval Isolation, Rollback Simulation, Final Hardening — COMPLETED

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
* Feature 004 Phase 1 Tests: 158 assertions
* Feature 004 Phase 1 Grok Code Review: 94/100
* Feature 004 Phase 2: PASSED
* Feature 004 Phase 2 Commit: `58623a9`
* Feature 004 Phase 2 Tests: 52 assertions (210 cumulative)
* Feature 004 Phase 2 Grok Code Review: 93/100
* Feature 004 Phase 3: COMPLETED
* Feature 004 Phase 3 Tests: pending commit
* Feature 004 Phase 3 typecheck: CLEAN
* Feature 004 Phase 3 build: PASS
* ChatGPT Decision: Claude GO - Feature 004 Phase 3 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

pending push

---

## Allowed in this phase

* Enhanced dry-run apply plan logic
* Enhanced dry-run rollback plan logic
* Simulated approval type isolation
* Discriminator / literal type hard-locks for simulated approval
* Discriminator / literal type hard-locks for dry-run apply plan
* Discriminator / literal type hard-locks for dry-run rollback plan
* Rollback token / idempotency planning hardening
* Advanced canonical JSON edge-case tests
* Advanced applyToken / rollbackToken binding tests
* Advanced continuity tests from Feature 003 recommendation to Feature 004 dry-run plan
* Audit event payload hardening
* Documentation
* Tests
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
* Do not allow AI to apply config
* Do not allow AI to mutate rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Phase 3 must remain dry-run only.
* All integration output must remain non-executable.
* Simulated approval must be clearly distinct from persisted approval.
* Simulated approval must not be usable as a real approval record.
* Apply plan must have `executable: false`.
* Rollback plan must have `executable: false`.
* `aiCanApply` must remain false.
* `aiCanRollback` must remain false.
* Human approval must remain required for any future real apply / rollback.
* Tenant hard guard must execute before all other validation.
* `tenantId` mismatch must be BLOCKED.
* `applyToken` / `rollbackToken` remain validation-only.
* No real transaction may be executed in Phase 3.
* Rollback token must bind to tenantId, targetVersion, auditTrailId, and rollback reason.
* Config diff must remain deterministic.
* `diffHash` must remain reproducible using SHA-256.
* Rollback must remain dry-run and version-aware.
* Rollback must not delete or overwrite settings history.
* All helpers must be covered by unit tests.

---

## Team State

* Claude: GO - Feature 004 Phase 3 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 004 Phase 3 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Grok Feature 004 Phase 3 code review → ChatGPT gatekeeper decision.

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
