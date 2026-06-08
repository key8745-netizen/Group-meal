# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5A: Emulator-only Real Model Config Apply Transaction Executor

---

## Current Phase

Phase 5A: Emulator-only Real Transaction Executor Implementation

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
* Feature 009 Phase 5 Spec v1.1 Grok Review: 96/100
* ChatGPT Decision: Claude GO - Feature 009 Phase 5A only
* Scope: Emulator-only real transaction executor
* Production write: FORBIDDEN

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`78f7965`

---

## Phase 5A Goal

Implement the first real Firestore transaction executor for human-approved model config apply, but only in Firebase Emulator / test environment.
Phase 5A may introduce real `runTransaction` only behind a strict emulator-only guard.
Phase 5A must hard-block all production writes.
Phase 5A must not expose UI.
Phase 5A must not add Netlify Functions or Cloud Functions.
Phase 5A must not enable production settings mutation.

---

## Allowed in this phase

* Emulator-only real transaction executor
* ProductionEnvironmentGuard
* Firebase Emulator environment detection
* Hard-block production project IDs
* Real `runTransaction` only in emulator / test environment
* Real emulator read of approval document
* Real emulator read of settings document
* Real emulator read/write of idempotency lock
* Real emulator write of immutable settingsHistory version
* Real emulator update of settings current config and currentVersion
* Real emulator audit event write
* Emulator integration tests
* Negative tests proving production write is blocked
* Verified human caller validation
* Persisted approval validation
* expectedCurrentVersion validation
* canonical hash validation inside emulator transaction
* idempotency lock behavior
* duplicate apply tests
* transaction atomicity tests
* abort / failure recovery tests
* docs
* tests
* SSOT update

---

## Forbidden in this phase

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

* ProductionEnvironmentGuard must execute before any transaction.
* Emulator-only check must hard-block production writes.
* Production project IDs must be explicitly blocked.
* Unknown environment must default-deny.
* Missing emulator flag must BLOCK.
* `NODE_ENV=test` alone is not sufficient unless combined with explicit emulator project guard.
* AI caller must be hard-blocked.
* Service Account / Admin SDK must not imply business permission.
* Verified human caller is mandatory.
* Persisted human approval is mandatory.
* Approval status must be `APPROVED`.
* Approval tenantId must match request tenantId.
* Approval approvedBy must match verified caller unless delegated apply is explicitly modeled.
* Transaction must validate approval before any write.
* Transaction must validate settings currentVersion.
* Transaction must canonicalize current config inside transaction.
* Transaction must validate configBeforeHash against actual current config.
* Transaction must validate configAfterHash and diffHash.
* Transaction must write idempotency lock.
* Transaction must write immutable settingsHistory.
* Transaction must update settings current config and currentVersion.
* Transaction must write audit event.
* Duplicate apply must be blocked or explicitly idempotent.
* Same token + same payload behavior must be tested.
* Same token + different payload must BLOCK.
* Same approvalId + different token must BLOCK.
* Abort path must not partially mutate settings.
* settingsHistory must remain append-only.
* Rollback remains excluded.
* Cleanup job remains excluded.
* UI remains excluded.

---

## Required Tests

Phase 5A must include tests for:
* valid emulator transaction success
* production project hard-block
* missing emulator flag BLOCKED
* unknown environment BLOCKED
* AI caller BLOCKED
* Service Account / Admin SDK bypass attempt BLOCKED
* invalid approval BLOCKED
* tenant mismatch BLOCKED
* approvedBy mismatch BLOCKED
* expectedCurrentVersion mismatch BLOCKED
* currentConfig hash mismatch BLOCKED
* configAfterHash mismatch BLOCKED
* diffHash mismatch BLOCKED
* duplicate apply behavior
* same token + same payload behavior
* same token + different payload BLOCKED
* same approvalId + different token BLOCKED
* settingsHistory immutable append-only write in emulator
* settings currentVersion update in emulator
* audit event write in emulator
* transaction atomicity
* abort path
* no production write path
* no UI
* no Netlify Function
* no Cloud Function

---

## Team State

* Claude: GO - Feature 009 Phase 5A only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5A code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5A report:
* branch name
* commit hash
* changed files
* tests result
* typecheck result
* build result
* emulator integration test result
* confirmation that production write is hard-blocked
* confirmation that ProductionEnvironmentGuard is implemented
* confirmation that real transaction only runs in emulator / test environment
* confirmation that no production settings mutation exists
* confirmation that no production settingsHistory write exists
* confirmation that no UI was added
* confirmation that no Netlify Function / Cloud Function was added
* confirmation that AI caller is blocked
* confirmation that Service Account / Admin SDK cannot bypass business guard
* confirmation that idempotency lock behavior works
* confirmation that settingsHistory append-only behavior works in emulator
* confirmation that audit event write works in emulator
* confirmation that abort path is safe
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
