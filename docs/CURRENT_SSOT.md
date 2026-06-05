# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 007: Real Model Config Apply Transaction Execution

---

## Current Phase

Phase 2: Real Apply Contract Integration + Guard / Hash Consistency Hardening

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 007 Spec v1.2: PASSED
* Feature 007 Phase 1: PASSED
* Feature 007 Phase 1 Commit: `380e645`
* Feature 007 Phase 1 SSOT Update: `b668ccc`
* Feature 007 Phase 1 Grok Code Review: 94/100
* ChatGPT Decision: Claude GO - Feature 007 Phase 2 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`b668ccc`

---

## Phase 2 Priority Risks

Grok identified two medium risks that must be handled in Phase 2:
1. Default-Deny Guard edge-case coverage:
   * spoofed token claims
   * malformed caller context
   * empty `sign_in_provider` with existing uid
   * serviceAccount / Admin SDK context not implying permission
2. Canonicalization validator and transaction pseudo-plan integration depth:
   * config hash consistency must be asserted inside pseudo-plan builder
   * `configBeforeHash`, `currentConfigHash`, `configAfterHash`, and `diffHash` continuity must be verified

These are mandatory Phase 2 work items.

---

## Allowed in this phase

* Harden default-deny guard tests
* Add spoofed token claims tests
* Add malformed caller context tests
* Add empty sign_in_provider with uid tests
* Add serviceAccount / Admin SDK bypass regression tests
* Integrate canonicalization validation into transaction pseudo-plan builder
* Add hash consistency assertion in pseudo-plan builder
* Validate `configBeforeHash`
* Validate `currentConfigHash`
* Validate `configAfterHash`
* Validate `diffHash`
* Validate hash continuity from approval to pseudo-plan to audit payload
* Strengthen idempotency lock schema validation
* Strengthen audit payload validation
* Strengthen static guard / CI boundary checks
* Add tests
* Add docs
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

* Phase 2 must remain pure logic / contract integration only.
* No real Firestore read/write may occur.
* No real transaction may be executed.
* Transaction pseudo-plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Default-deny guard must remain the first security boundary.
* Context parsing failure must BLOCK.
* Spoofed token claims must BLOCK.
* Unknown caller type must BLOCK.
* Missing human user id must BLOCK.
* AI caller must BLOCK.
* Service Account / Admin SDK must not imply permission.
* Tenant hard guard must execute before all other validation.
* Canonicalization must be deterministic.
* Pseudo-plan builder must validate canonical hash consistency.
* `configBeforeHash`, `currentConfigHash`, `configAfterHash`, and `diffHash` mismatch must BLOCK.
* Audit event helper must remain pure payload generation only.
* Static guards / CI rules must continue preventing forbidden imports and forbidden calls.

---

## Team State

* Claude: GO - Feature 007 Phase 2 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 007 Phase 2 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 007 Phase 2 report.

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
