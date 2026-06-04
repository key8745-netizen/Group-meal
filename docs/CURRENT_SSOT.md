# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 006: Real Model Config Apply Transaction Boundary

---

## Current Phase

Phase 3: Lock Cleanup Pseudo-implementation + settingsHistory Snapshot Mapping

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 006 Spec v1.2: PASSED
* Feature 006 Phase 1: PASSED
* Feature 006 Phase 1 Commit: `f74513e`
* Feature 006 Phase 1 Grok Code Review: 92/100
* Feature 006 Phase 2: PASSED
* Feature 006 Phase 2 Commit: `6ed438f`
* Feature 006 Phase 2 Grok Code Review: 92/100
* ChatGPT Decision: Claude GO - Feature 006 Phase 3 only

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`6ed438f`

---

## Phase 3 Priority Risks

Grok identified two remaining medium risks that must be handled in Phase 3:
1. Lock cleanup job execution responsibility and trigger mechanism:
   * Phase 2 documented a 3-level cleanup chain.
   * Phase 3 must define pseudo-implementation, owner, trigger, query criteria, TTL strategy, and manual fallback details.
2. rollback historicalConfigHash and settingsHistory snapshot integration:
   * Phase 2 models historicalConfigHash validation.
   * Phase 3 must define mapping from settingsHistory snapshot to historicalConfigHash and mismatch handling in end-to-end dry-run integration.

These are mandatory Phase 3 work items.

---

## Allowed in this phase

* Lock cleanup pseudo-implementation
* Lock cleanup owner / trigger / TTL policy documentation
* Lock cleanup query criteria modeling
* Lock cleanup dry-run preview helper
* Manual cleanup fallback plan
* Maintenance audit event plan
* settingsHistory snapshot mapping helper
* historicalConfigHash mapping validation
* historicalConfigHash mismatch handling tests
* End-to-end dry-run rollback readiness tests
* Rollback target snapshot validation
* Service guard entrance contract hardening
* Transaction-readiness integration tests
* Boundary tests
* Docs
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
* Do not create real cleanup jobs
* Do not add Cloud Functions
* Do not add Netlify Functions
* Do not add UI
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not modify Feature 004 dry-run boundary
* Do not modify Feature 005 dry-run execution boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Phase 3 must remain transaction-readiness only.
* No real Firestore read/write may occur.
* No real cleanup job may be created.
* No real transaction may be executed.
* Transaction plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Idempotency locks remain plan-only.
* Historical snapshot validation must be modeled against supplied snapshot input only.
* settingsHistory snapshot mapping must be deterministic.
* historicalConfigHash mismatch must be BLOCKED.
* Missing settingsHistory snapshot must be BLOCKED.
* Deleted / overwritten / mutable history snapshot must be BLOCKED.
* Lock cleanup must be modeled as dry-run only.
* Lock cleanup owner must not be AI.
* Lock cleanup must not delete active locks.
* Lock cleanup must include TTL / cleanupEligibleAt logic.
* Lock cleanup must include maintenance audit event plan.
* AI caller must be blocked.
* Tenant hard guard must execute before all other validation.
* Admin SDK / Service Account must not bypass business guard.
* All helpers must be pure and covered by tests.

---

## Team State

* Claude: GO - Feature 006 Phase 3 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 006 Phase 3 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 006 Phase 3 report:
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
* confirmation that no Netlify Function / Cloud Function was added
* confirmation that no real cleanup job exists
* confirmation that no real apply / rollback exists
* confirmation that no real approval / apply / rollback records are created
* confirmation that lock cleanup pseudo-implementation is documented
* confirmation that lock cleanup owner / trigger / TTL policy is defined
* confirmation that cleanup is dry-run only
* confirmation that settingsHistory snapshot mapping is implemented
* confirmation that historicalConfigHash mismatch is BLOCKED
* confirmation that transaction plans remain executable=false
* confirmation that aiCanExecute remains false
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
