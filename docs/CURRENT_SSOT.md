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

Phase 2: Transaction Readiness Integration + Historical Hash Validation + Lock Cleanup Design

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
* ChatGPT Decision: Claude GO - Feature 006 Phase 2 only

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`f74513e`

---

## Phase 2 Priority Risks

Grok identified two medium risks that must be handled in Phase 2:
1. `rollback historicalConfigHash` validation depth:
   * Phase 1 compares caller-provided hashes only.
   * Phase 2 must model how actual historical config hash from `settingsHistory` is cross-validated before rollback.
2. Lock cleanup job responsibility:
   * Phase 1 documented a cleanup chain.
   * Phase 2 must define trigger method, owner, TTL / cleanup strategy, and pseudo-implementation.

These are mandatory Phase 2 work items.

---

## Allowed in this phase

* Transaction-readiness integration planning
* Historical settingsHistory hash validation plan
* Historical config hash cross-validation helper
* Rollback target version validation helper
* Lock cleanup strategy documentation
* Lock TTL / cleanup pseudo-implementation
* Idempotency lock lifecycle helper
* Apply / rollback transaction pseudo-plan hardening
* Service guard entrance contract hardening
* Audit event metadata validation
* Tenant isolation validation
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
* Do not add UI
* Do not add Netlify Functions
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

* Phase 2 must remain transaction-readiness only.
* No real transaction may be executed.
* No real Firestore read/write may occur.
* Transaction plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Idempotency locks remain plan-only.
* Historical hash validation must be modeled against supplied `settingsHistory` snapshot input only.
* Rollback must validate that `rollbackTargetVersion` maps to expected historical config hash.
* Historical hash mismatch must be BLOCKED.
* Rollback must remain a new human-approved change.
* Rollback must not delete or overwrite settings history.
* Lock cleanup must be documented with trigger, owner, TTL policy, and pseudo-implementation.
* AI caller must be blocked.
* Tenant hard guard must execute before all other validation.
* Service guard must still block AI even if Admin SDK / Service Account is used.
* All helpers must be pure and covered by tests.

---

## Team State

* Claude: GO - Feature 006 Phase 2 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 006 Phase 2 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 006 Phase 2 report:
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
* confirmation that no Netlify Function was added
* confirmation that no real apply / rollback exists
* confirmation that no real approval / apply / rollback records are created
* confirmation that historicalConfigHash cross-validation is modeled
* confirmation that rollbackTargetVersion historical hash mismatch is BLOCKED
* confirmation that lock cleanup responsibility and pseudo-implementation are documented
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
