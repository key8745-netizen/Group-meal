# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Release Monitoring: Feature 008 Dry-run Executor-Readiness Boundary

---

## Current Phase

Post-Release Monitoring / Feature 009 Planning Pending

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006: CLOSED
* Feature 007: CLOSED
* Feature 008 dry-run executor-readiness version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 008 Spec v1.2: PASSED
* Feature 008 Phase 1: PASSED
* Feature 008 Phase 1 Commit: `6f4290b`
* Feature 008 Phase 1 Grok Code Review: 94/100
* Feature 008 Phase 2: PASSED
* Feature 008 Phase 2 Commit: `8d5069c`
* Feature 008 Phase 2 Grok Code Review: 94/100
* Feature 008 Phase 3: PASSED
* Feature 008 Phase 3 Commit: `19d667f`
* Feature 008 Phase 3 Grok Code Review: 93/100
* Feature 008 Phase 4: PASSED
* Feature 008 Phase 4 Commit: `4fd4c3c`
* Feature 008 Phase 4 Grok Code Review: 95/100
* ChatGPT Decision: Feature 008 dry-run executor-readiness version CLOSED; begin Post-Release Monitoring before Feature 009
* Feature 008 Post-Release Monitoring: PASSED
* Feature 008 Monitoring Commit: `1e28a54`
* Feature 008 Monitoring Grok Review: 95/100
* Feature 008 Monitoring Recommendation: MONITORING_OK
* ChatGPT Decision: Feature 009 planning authorized; Gemini GO — prepare Feature 009 Spec

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`4fd4c3c`

---

## Feature 008 Status

Feature 008 is CLOSED as a dry-run executor-readiness boundary.
Feature 008 does not implement real Firestore reads.
Feature 008 does not implement real Firestore writes.
Feature 008 does not implement real transaction execution.
Feature 008 does not implement real settings mutation.
Feature 008 does not implement real settingsHistory writes.
Feature 008 does not implement real approval persistence.
Feature 008 does not implement real apply.
Feature 008 does not implement real rollback.
Feature 008 does not implement real cleanup jobs.
Feature 008 does not add UI.
Feature 008 does not add Netlify Functions or Cloud Functions.

---

## Allowed in this phase

* Post-release monitoring
* Dry-run executor-readiness behavior observation
* Documentation updates
* SSOT update
* Risk register update
* Feature 009 planning discussion only
* Gemini may prepare Feature 009 spec only after ibi / ChatGPT approval
* Grok may prepare Feature 009 spec review only after Gemini spec exists

---

## Forbidden in this phase

* Do not start Feature 009 implementation
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
* Do not modify Feature 008 dry-run executor-readiness boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 008 dry-run executor-readiness boundary must remain intact.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Dry-run write-set contracts must not become executable.
* `executable` must remain false.
* `aiCanExecute` must remain false.
* Default-deny guard must remain active.
* Service Account / Admin SDK must not imply permission.
* Upstream verification alignment checks must remain covered.
* Middleware verified context vs Firebase token parse mismatch must remain BLOCKED.
* Simulated real Firestore snapshot validation must remain covered.
* Deep nested concurrent modification tests must remain covered.
* Write-set hash consistency must remain validated.
* Persisted approval snapshot validation must remain intact.
* Static guard / CI rules must continue blocking forbidden imports and forbidden calls.
* Any future real transaction executor must be a new Feature with Gemini spec, Grok red-team review, and ChatGPT gatekeeping.
* Any future real transaction executor must preserve human final control, idempotency, expectedCurrentVersion, immutable settingsHistory, audit trail, upstream token verification, and AI hard-block.

---

## Known Accepted Risks / Future Work

* Real model config apply is not implemented.
* Real Firestore transaction execution is not implemented.
* Real settings mutation is not implemented.
* Real settingsHistory write is not implemented.
* Real approval persistence is not implemented.
* Real rollback is not implemented.
* Real cleanup job is not implemented.
* UI approval flow is not implemented.
* Firebase Admin token verification is modeled through production-like contract simulation only.
* Simulated Firestore snapshot validation is pure input validation only.
* Feature 009 should decide whether to implement the first real transaction executor, upstream middleware integration, or UI approval flow first.

---

## Team State

* Claude: HOLD — await Feature 009 Spec + Grok red-team before any implementation
* Gemini: GO — prepare Feature 009 Spec (real transaction executor)
* Grok: Prepare Feature 009 Spec review after Gemini Spec exists
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Spec.
Spec should define the first real transaction executor, covering:
* real `runTransaction` executor service orchestrating Phase 1–4 validators
* real Firebase Admin SDK `verifyIdToken` middleware integration
* real Firestore read of `settings/{tenantId}` inside transaction
* real Firestore read of approval record inside transaction
* real idempotency lock check-and-write inside transaction
* real `settingsHistory` immutable append inside transaction
* real `settings` currentVersion update inside transaction
* real audit event write strategy
* rollback inclusion / exclusion boundary
* cleanup job inclusion / exclusion boundary
* UI approval flow inclusion / exclusion boundary

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
