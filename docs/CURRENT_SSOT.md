# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Release Monitoring: Feature 009 Contract-Readiness Boundary

---

## Current Phase

Post-Release Monitoring / Feature 009 Phase 5 Planning Pending

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006: CLOSED
* Feature 007: CLOSED
* Feature 008: CLOSED
* Feature 008 Post-Release Monitoring: PASSED
* Feature 009 Spec v1.1: PASSED
* Feature 009 Phase 1: PASSED
* Feature 009 Phase 1 Commit: `d2add5a`
* Feature 009 Phase 1 Grok Code Review: 96/100
* Feature 009 Phase 2: PASSED
* Feature 009 Phase 2 Commit: `4c0d96d`
* Feature 009 Phase 2 Grok Code Review: 96/100
* Feature 009 Phase 3: PASSED
* Feature 009 Phase 3 Commit: `56f3dfb`
* Feature 009 Phase 3 Grok Code Review: 96/100
* Feature 009 Phase 4: PASSED
* Feature 009 Phase 4 Commit: `1bdc805`
* Feature 009 Phase 4 Grok Code Review: 96/100
* Feature 009 contract-readiness version: CLOSED
* ChatGPT Decision: Feature 009 contract-readiness version CLOSED; begin Post-Release Monitoring before Phase 5 / real execution

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`1bdc805`

---

## Feature 009 Status

Feature 009 is CLOSED as a contract-readiness version.
Feature 009 does not implement real Firestore writes.
Feature 009 does not implement real settings mutation.
Feature 009 does not implement real settingsHistory writes.
Feature 009 does not implement real approval persistence.
Feature 009 does not implement real apply.
Feature 009 does not implement real rollback.
Feature 009 does not implement real cleanup jobs.
Feature 009 does not add UI.
Feature 009 does not add Netlify Functions or Cloud Functions.
Feature 009 models real transaction behavior as contract / simulation only.

---

## Allowed in this phase

* Post-release monitoring
* Contract-readiness behavior observation
* Documentation updates
* SSOT update
* Risk register update
* Feature 009 Phase 5 planning discussion only
* Gemini may prepare Phase 5 spec only after ibi / ChatGPT approval
* Grok may prepare Phase 5 spec review only after Gemini spec exists

---

## Forbidden in this phase

* Do not start Phase 5 implementation
* Do not let Claude implement new code beyond monitoring/docs unless explicitly approved
* Do not write Firestore
* Do not mutate Firestore
* Do not modify `settings`
* Do not write `settingsHistory`
* Do not create real approval records
* Do not create real apply records
* Do not create real rollback records
* Do not create real cleanup jobs
* Do not actually apply config
* Do not actually rollback config
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not modify Feature 004 dry-run boundary
* Do not modify Feature 005 dry-run execution boundary
* Do not modify Feature 006 dry-run transaction-readiness boundary
* Do not modify Feature 007 dry-run real-apply readiness boundary
* Do not modify Feature 008 dry-run executor-readiness boundary
* Do not modify Feature 009 contract-readiness boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 009 contract-readiness boundary must remain intact.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Transaction contracts must not become executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Verified caller context validation must remain intact.
* Middleware / Firebase token consistency validation must remain intact.
* Approval / settings / lock read-set consistency must remain intact.
* Concurrent modification blocking must remain intact.
* Duplicate apply behavior modeling must remain intact.
* Idempotency lifecycle contract must remain intact.
* Abort atomicity contract must remain intact.
* FAILED audit payload contract must remain intact.
* ABANDONED lock transition contract must remain intact.
* Abort path must not produce settings mutation.
* Abort path must not write settingsHistory.
* Static guards / CI rules must continue blocking forbidden imports and forbidden calls.
* Any future real transaction executor must be a new approved phase with Gemini spec, Grok review, and ChatGPT gatekeeping.

---

## Known Accepted Risks / Future Work

* Real Firestore transaction execution is not implemented.
* Real Firestore write is not implemented.
* Real settings mutation is not implemented.
* Real settingsHistory write is not implemented.
* Real approval persistence is not implemented.
* Real apply result persistence is not implemented.
* Real rollback is not implemented.
* Real cleanup job is not implemented.
* UI approval/apply flow is not implemented.
* Phase 5 should decide whether to introduce the first real write transaction or perform another release gate before real execution.

---

## Team State

* Claude: HOLD / post-release monitoring support only
* Gemini: HOLD / Phase 5 planning later
* Grok: HOLD / Prepare monitoring review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start Feature 009 post-release monitoring review
2. Pause development and observe production
3. Begin Feature 009 Phase 5 planning after monitoring baseline

Recommended next step:
Run a short post-release monitoring window for Feature 009 contract-readiness behavior before opening Phase 5 real transaction execution.

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
