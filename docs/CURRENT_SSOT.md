# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Release Monitoring: Feature 006 Dry-run Transaction Readiness Boundary

---

## Current Phase

Post-Release Monitoring / Feature 007 Planning Pending

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006 dry-run transaction-readiness version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 006 Spec v1.2: PASSED
* Feature 006 Phase 1: PASSED
* Feature 006 Phase 1 Commit: `f74513e`
* Feature 006 Phase 1 Grok Code Review: 92/100
* Feature 006 Phase 2: PASSED
* Feature 006 Phase 2 Commit: `6ed438f`
* Feature 006 Phase 2 Grok Code Review: 92/100
* Feature 006 Phase 3: PASSED
* Feature 006 Phase 3 Commit: `403231f`
* Feature 006 Phase 3 Grok Code Review: 92/100
* Feature 006 Phase 4: PASSED
* Feature 006 Phase 4 Commit: `bd063da`
* Feature 006 Phase 4 Grok Code Review: 94/100
* ChatGPT Decision: Feature 006 dry-run transaction-readiness version CLOSED; begin Post-Release Monitoring before Feature 007

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`bd063da`

---

## Feature 006 Status

Feature 006 is CLOSED as a dry-run transaction-readiness boundary.
Feature 006 does not implement real Firestore reads.
Feature 006 does not implement real Firestore writes.
Feature 006 does not implement real transaction execution.
Feature 006 does not implement real settings mutation.
Feature 006 does not implement real settingsHistory writes.
Feature 006 does not implement real approval persistence.
Feature 006 does not implement real apply.
Feature 006 does not implement real rollback.
Feature 006 does not implement real cleanup jobs.
Feature 006 does not add UI.
Feature 006 does not add Netlify Functions or Cloud Functions.

---

## Allowed in this phase

* Post-release monitoring
* Dry-run transaction-readiness behavior observation
* Documentation updates
* SSOT update
* Risk register update
* Feature 007 planning discussion only
* Gemini may prepare Feature 007 spec only after ibi / ChatGPT approval
* Grok may prepare Feature 007 spec review only after Gemini spec exists

---

## Forbidden in this phase

* Do not start Feature 007 implementation
* Do not let Claude implement code
* Do not write Firestore
* Do not read Firestore unless a future approved phase explicitly allows it
* Do not call `runTransaction`
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
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 006 dry-run transaction-readiness boundary must remain intact.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Dry-run transaction plans must not become executable.
* Cleanup plans must not become executable.
* `executable` must remain false.
* `aiCanExecute` must remain false.
* Idempotency locks remain plan-only.
* Cleanup criteria remain descriptive only.
* Maintenance audit event payload remains pure data only.
* settingsHistory remains modeled as immutable append-only only.
* Rollback remains modeled as a new human-approved change, but not executed.
* Any future real apply mechanism must be a new Feature with Gemini spec, Grok red-team review, and ChatGPT gatekeeping.
* Any future real rollback mechanism must be a new Feature with human approval, transaction safety, idempotency lock, version conflict guard, historical hash validation, and audit trail.
* Any future real cleanup job must be a new Feature or explicitly approved phase with owner, trigger, TTL, dry-run preview, audit trail, and AI hard-block.

---

## Known Accepted Risks / Future Work

* Real model config apply is not implemented.
* Real rollback is not implemented.
* Real cleanup job is not implemented.
* UI approval flow is not implemented.
* Persisted approval record is not implemented.
* Real Firestore transaction execution is not implemented.
* Real settingsHistory write is not implemented.
* Real lock cleanup query execution is not implemented.
* Dry-run transaction plan must remain non-executable until a future approved Feature.
* Feature 007 should decide whether to implement real apply first, UI approval first, or a release gate before real transaction execution.

---

## Team State

* Claude: HOLD / post-release monitoring support only
* Gemini: HOLD / Feature 007 planning later
* Grok: HOLD / Prepare monitoring review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start Feature 006 post-release monitoring review
2. Pause development and observe production
3. Begin Feature 007 planning after monitoring baseline

Recommended next step:
Run a short post-release monitoring window for Feature 006 dry-run transaction-readiness behavior before opening Feature 007.

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
