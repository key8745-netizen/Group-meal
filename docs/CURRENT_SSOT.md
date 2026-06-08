# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Emulator Monitoring: Feature 009 Phase 5A Emulator-only Real Transaction Executor

---

## Current Phase

Post-Emulator Monitoring / Phase 5B Planning Pending

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
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Post-Release Monitoring: PASSED
* Feature 009 Phase 5 Spec v1.1: PASSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Commit: `018dd34`
* Feature 009 Phase 5A Grok Code Review: 95/100
* ChatGPT Decision: Feature 009 Phase 5A PASSED; begin Post-Emulator Monitoring before Phase 5B

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`018dd34`

---

## Feature 009 Phase 5A Status

Feature 009 Phase 5A has successfully implemented the first emulator-only real transaction executor.
The executor is allowed only in Firebase Emulator / test environment.
Production write remains forbidden.
Production settings mutation remains forbidden.
Production settingsHistory write remains forbidden.
Production approval / apply / rollback records remain forbidden.
Production rollback remains forbidden.
UI remains excluded.
Netlify Functions and Cloud Functions remain excluded.

---

## Allowed in this phase

* Post-emulator monitoring
* Emulator transaction behavior observation
* ProductionEnvironmentGuard regression checks
* Production hard-block regression checks
* Emulator integration test reruns
* Idempotency behavior observation
* settingsHistory append-only behavior observation in emulator
* audit event behavior observation in emulator
* abort / failure atomicity observation in emulator
* Documentation updates
* SSOT update
* Risk register update
* Phase 5B planning discussion only after monitoring baseline

---

## Forbidden in this phase

* Do not start Phase 5B implementation
* Do not allow production Firestore write
* Do not mutate production settings
* Do not write production settingsHistory
* Do not create production approval records
* Do not create production apply records
* Do not create production rollback records
* Do not create production cleanup jobs
* Do not apply config in production
* Do not rollback config in production
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
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
* Do not introduce production write paths

---

## Required Guard Rails

* ProductionEnvironmentGuard must remain first-layer guard.
* Emulator-only check must continue hard-blocking production writes.
* Production project IDs must remain explicitly blocked.
* Unknown environment must default-deny.
* Missing emulator flag must BLOCK.
* `NODE_ENV=test` alone is not sufficient unless combined with explicit emulator project guard.
* AI caller must remain hard-blocked.
* Service Account / Admin SDK must not imply business permission.
* Verified human caller remains mandatory.
* Persisted human approval remains mandatory.
* Approval status must be `APPROVED`.
* Approval tenantId must match request tenantId.
* Approval approvedBy must match verified caller unless delegated apply is explicitly modeled.
* Transaction must validate approval before any write.
* Transaction must validate settings currentVersion.
* Transaction must canonicalize current config inside transaction.
* Transaction must validate configBeforeHash against actual current config.
* Transaction must validate configAfterHash and diffHash.
* Transaction must write idempotency lock only in emulator.
* Transaction must write immutable settingsHistory only in emulator.
* Transaction must update settings current config and currentVersion only in emulator.
* Transaction must write audit event only in emulator.
* Duplicate apply must be blocked or explicitly idempotent.
* Same token + same payload behavior must remain safe.
* Same token + different payload must BLOCK.
* Same approvalId + different token must BLOCK.
* Abort path must not partially mutate settings.
* settingsHistory must remain append-only.
* Rollback remains excluded.
* Cleanup job remains excluded.
* UI remains excluded.

---

## Required Monitoring Checks

Post-Emulator Monitoring must confirm:
* emulator-only real transaction still works
* production write remains hard-blocked
* ProductionEnvironmentGuard still executes before transaction
* no production settings mutation exists
* no production settingsHistory write exists
* no production approval / apply / rollback records are created
* AI caller remains BLOCKED
* Service Account / Admin SDK cannot bypass business guard
* verified human caller is mandatory
* persisted approval is mandatory
* expectedCurrentVersion is enforced
* canonical hash validation is enforced inside emulator transaction
* idempotency lock behavior remains correct
* duplicate apply behavior remains safe
* same token + same payload behavior remains safe
* same token + different payload remains BLOCKED
* same approvalId + different token remains BLOCKED
* settingsHistory append-only behavior remains correct in emulator
* settings currentVersion update remains correct in emulator
* audit event write remains correct in emulator
* abort / failure atomicity remains correct
* rollback remains excluded
* cleanup remains excluded
* UI remains excluded
* tests pass
* emulator tests pass
* typecheck pass
* build pass

---

## Team State

* Claude: HOLD / post-emulator monitoring support only
* Gemini: HOLD / Phase 5B planning later
* Grok: GO - Prepare Post-Emulator Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5A Post-Emulator Monitoring report:
* observation window
* branch name
* commit hash
* tests result
* emulator integration test result
* typecheck result
* build result
* ProductionEnvironmentGuard status
* production write hard-block confirmation
* emulator-only real transaction confirmation
* no production settings mutation confirmation
* no production settingsHistory write confirmation
* AI caller blocked confirmation
* Service Account / Admin SDK blocked confirmation
* idempotency behavior status
* settingsHistory append-only status
* audit event write status
* abort / failure atomicity status
* rollback / cleanup / UI exclusion confirmation
* production error summary
* known limitations
* final recommendation: MONITORING_OK / NEEDS_PATCH / BLOCKED

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
