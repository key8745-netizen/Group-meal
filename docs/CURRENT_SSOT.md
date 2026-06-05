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

Phase 3: Advanced Guard Hardening + Full-chain Hash Propagation

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
* Feature 007 Phase 1 Grok Code Review: 94/100
* Feature 007 Phase 2: PASSED
* Feature 007 Phase 2 Commit: `931026e`
* Feature 007 Phase 2 Grok Code Review: 93/100
* ChatGPT Decision: Claude GO - Feature 007 Phase 3 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`931026e`

---

## Phase 3 Priority Risks

Grok identified two medium risks that must be handled in Phase 3:
1. Default-Deny Guard robustness under advanced spoofed context:
   * partial valid token claims with malicious injected claims
   * forged `sign_in_provider`
   * provider/user identity mismatch
   * serviceAccount / Admin SDK context attempting to imply human permission
2. Full-chain hash propagation:
   * `approval → canonicalization → pseudo-plan → auditEventPlan`
   * `configBeforeHash`, `currentConfigHash`, `configAfterHash`, `diffHash`, `applyToken`, `auditTrailId`
   * complex nested config regression cases

These are mandatory Phase 3 work items.

---

## Allowed in this phase

* Advanced spoofed token regression tests
* Forged `sign_in_provider` tests
* Partial valid claims + malicious injected claims tests
* Provider/user mismatch tests
* Service Account / Admin SDK bypass regression tests
* Full-chain hash propagation validation
* Approval → canonicalization continuity tests
* Canonicalization → pseudo-plan continuity tests
* Pseudo-plan → auditEventPlan continuity tests
* Complex nested config hash regression tests
* Apply token continuity tests
* Audit trail continuity tests
* Static guard / CI boundary regression tests
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

* Phase 3 must remain pure logic / contract integration only.
* No real Firestore read/write may occur.
* No real transaction may be executed.
* Transaction pseudo-plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Default-deny guard must remain the first security boundary.
* Context parsing failure must BLOCK.
* Spoofed token claims must BLOCK.
* Forged `sign_in_provider` must BLOCK.
* Provider/user mismatch must BLOCK.
* Unknown caller type must BLOCK.
* Empty `sign_in_provider` with uid must BLOCK unless explicitly validated as human by approved guard logic.
* Missing human user id must BLOCK.
* AI caller must BLOCK.
* Service Account / Admin SDK must not imply permission.
* Tenant hard guard must execute before all other validation.
* Canonicalization must be deterministic.
* Full-chain hash propagation must be validated.
* `configBeforeHash`, `currentConfigHash`, `configAfterHash`, `diffHash`, `applyToken`, and `auditTrailId` mismatch must BLOCK.
* Audit event helper must remain pure payload generation only.
* Static guards / CI rules must continue preventing forbidden imports and forbidden calls.

---

## Team State

* Claude: GO - Feature 007 Phase 3 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 007 Phase 3 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 007 Phase 3 report:
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
* confirmation that no real apply / rollback exists
* confirmation that no real approval / apply / rollback records are created
* confirmation that advanced spoofed / forged context tests are added
* confirmation that Service Account / Admin SDK cannot bypass business guard
* confirmation that full-chain hash propagation is validated
* confirmation that approval → canonicalization → pseudo-plan → auditEventPlan continuity is tested
* confirmation that complex nested config hash regression tests are added
* confirmation that transaction pseudo-plan remains executable=false
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
