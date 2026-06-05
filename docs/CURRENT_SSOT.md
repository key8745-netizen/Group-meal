# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Release Monitoring: Feature 007 Dry-run Real-Apply Readiness Boundary

---

## Current Phase

Post-Release Monitoring / Feature 008 Planning Pending

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006: CLOSED
* Feature 007 dry-run real-apply readiness version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 007 Spec v1.2: PASSED
* Feature 007 Phase 1: PASSED
* Feature 007 Phase 1 Commit: `380e645`
* Feature 007 Phase 1 Grok Code Review: 94/100
* Feature 007 Phase 2: PASSED
* Feature 007 Phase 2 Commit: `931026e`
* Feature 007 Phase 2 Grok Code Review: 93/100
* Feature 007 Phase 3: PASSED
* Feature 007 Phase 3 Commit: `8071d03`
* Feature 007 Phase 3 Grok Code Review: 93/100
* Feature 007 Phase 4: PASSED
* Feature 007 Phase 4 Commit: `206bdbf`
* Feature 007 Phase 4 Grok Code Review: 95/100
* ChatGPT Decision: Feature 007 dry-run real-apply readiness version CLOSED; begin Post-Release Monitoring before Feature 008

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`206bdbf`

---

## Feature 007 Status

Feature 007 is CLOSED as a dry-run real-apply readiness boundary.
Feature 007 does not implement real Firestore reads.
Feature 007 does not implement real Firestore writes.
Feature 007 does not implement real transaction execution.
Feature 007 does not implement real settings mutation.
Feature 007 does not implement real settingsHistory writes.
Feature 007 does not implement real approval persistence.
Feature 007 does not implement real apply.
Feature 007 does not implement real rollback.
Feature 007 does not implement real cleanup jobs.
Feature 007 does not add UI.
Feature 007 does not add Netlify Functions or Cloud Functions.

---

## Allowed in this phase

* Post-release monitoring
* Dry-run real-apply readiness behavior observation
* Documentation updates
* SSOT update
* Risk register update
* Feature 008 planning discussion only
* Gemini may prepare Feature 008 spec only after ibi / ChatGPT approval
* Grok may prepare Feature 008 spec review only after Gemini spec exists

---

## Forbidden in this phase

* Do not start Feature 008 implementation
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
* Do not modify Feature 007 dry-run real-apply readiness boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 007 dry-run real-apply readiness boundary must remain intact.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Dry-run transaction pseudo-plans must not become executable.
* `executable` must remain false.
* `aiCanExecute` must remain false.
* Default-deny guard must remain active.
* Service Account / Admin SDK must not imply permission.
* Cryptographic forgery simulations must remain covered.
* Multi-claim injection tests must remain covered.
* Canonicalization must remain deterministic.
* Full-chain hash propagation must remain validated.
* Audit event payloads must remain pure data only.
* Static guard / CI rules must continue blocking forbidden imports and forbidden calls.
* Any future real apply mechanism must be a new Feature with Gemini spec, Grok red-team review, and ChatGPT gatekeeping.
* Any future real transaction executor must preserve human final control, idempotency, expectedCurrentVersion, immutable settingsHistory, audit trail, and AI hard-block.

---

## Known Accepted Risks / Future Work

* Real model config apply is not implemented.
* Real rollback is not implemented.
* Real cleanup job is not implemented.
* UI approval flow is not implemented.
* Persisted approval record is not implemented.
* Real Firestore transaction execution is not implemented.
* Real settingsHistory write is not implemented.
* `tokenVerificationStatus='verified'` remains a contract-level assertion.
* Actual Firebase token signature verification must happen in upstream middleware or future executor boundary.
* Dry-run transaction pseudo-plan must remain non-executable until a future approved Feature.
* Feature 008 should decide whether to implement real transaction executor first, UI approval first, or upstream token verification gate first.

---

## Team State

* Claude: HOLD / post-release monitoring support only
* Gemini: HOLD / Feature 008 planning later
* Grok: HOLD / Prepare monitoring review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start Feature 007 post-release monitoring review
2. Pause development and observe production
3. Begin Feature 008 planning after monitoring baseline

Recommended next step:
Run a short post-release monitoring window for Feature 007 dry-run real-apply readiness behavior before opening Feature 008.

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
