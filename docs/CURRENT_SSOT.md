# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Release Monitoring: Feature 004 Dry-run Model Config Apply Boundary

---

## Current Phase

Post-Release Monitoring / Feature 005 Planning Pending

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
* Feature 004 Phase 2: PASSED
* Feature 004 Phase 2 Commit: `58623a9`
* Feature 004 Phase 2 Tests: 210/210 pass
* Feature 004 Phase 2 Grok Code Review: 93/100
* Feature 004 Phase 3: PASSED
* Feature 004 Phase 3 Commit: `9b20e4c`
* Feature 004 Phase 3 Tests: 276 assertions pass
* Feature 004 Phase 3 Grok Code Review: 94/100
* Feature 004 Phase 4: PASSED
* Feature 004 Phase 4 Commit: `52ef10e`
* Feature 004 Phase 4 Tests: 414 assertions pass
* Feature 004 Dry-run Release Gate Checklist: 23/23 pass
* Feature 004 Phase 4 Grok Code Review: 95/100
* ChatGPT Decision: Feature 004 dry-run version CLOSED; begin Post-Release Monitoring before Feature 005

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`52ef10e`

---

## Feature 004 Status

Feature 004 is CLOSED as a dry-run model config apply boundary.
Feature 004 does not implement real settings mutation.
Feature 004 does not implement real approval persistence.
Feature 004 does not implement real apply.
Feature 004 does not implement real rollback.
Feature 004 does not add UI.
Feature 004 does not add Netlify Functions.

---

## Allowed in this phase

* Post-release monitoring
* Dry-run behavior observation
* Documentation updates
* SSOT update
* Risk register update
* Feature 005 planning discussion only
* Gemini may prepare Feature 005 spec only after ibi / ChatGPT approval
* Grok may prepare Feature 005 spec review only after Gemini spec exists

---

## Forbidden in this phase

* Do not start Feature 005 implementation
* Do not let Claude implement code
* Do not write Firestore
* Do not read Firestore unless a future approved phase explicitly allows it
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

* Feature 004 dry-run boundary must remain intact.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Simulated approval must not become persisted approval.
* Dry-run apply plan must not become executable.
* Dry-run rollback plan must not become executable.
* `aiCanApply` must remain false.
* `aiCanRollback` must remain false.
* Any future real apply mechanism must be a new Feature with Gemini spec, Grok red-team review, and ChatGPT gatekeeping.
* Any future real rollback mechanism must be a new Feature with human approval, transaction safety, idempotency lock, version conflict guard, and audit trail.

---

## Known Accepted Risks / Future Work

* Real model config apply is not implemented.
* Real rollback is not implemented.
* UI approval flow is not implemented.
* Persisted approval record is not implemented.
* Rollback token is currently planning-only and must be connected to transaction/idempotency in a future Feature.
* Simulated approval and persisted approval isolation must be preserved if real approval is introduced later.

---

## Team State

* Claude: HOLD / post-release monitoring support only
* Gemini: HOLD / Feature 005 planning later
* Grok: HOLD / Prepare monitoring review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start Feature 004 post-release monitoring review
2. Pause development and observe production
3. Begin Feature 005 planning after monitoring baseline

Recommended next step:
Run a short post-release monitoring window for Feature 004 dry-run behavior before opening Feature 005.

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
