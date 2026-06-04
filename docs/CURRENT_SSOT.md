# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 005: Human-Approved Model Config Apply Execution

---

## Current Phase

Phase 3: Transaction Readiness Hardening + Audit Metadata Cross-validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004 dry-run version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 005 Spec v1.1: PASSED
* Feature 005 Phase 1: PASSED
* Feature 005 Phase 1 Commit: `c6366ac`
* Feature 005 Phase 1 Grok Code Review: 93/100
* Feature 005 Phase 2: PASSED
* Feature 005 Phase 2 Commit: `78c9a95`
* Feature 005 Phase 2 Grok Code Review: 92/100
* ChatGPT Decision: Claude GO — Feature 005 Phase 3 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`78c9a95`

---

## Phase 3 Priority Risks

Grok identified two medium risks that must be handled in Phase 3:
1. Rollback token alignment with future transaction / idempotency lock strategy.
2. Feature 003 → Feature 005 audit metadata cross-validation completeness.
These are now mandatory Phase 3 work items.

---

## Allowed in this phase

* Strengthen rollbackToken transaction-readiness design
* Strengthen rollbackToken idempotency lock plan validation
* Add rollback conflict simulation tests
* Add duplicate rollback token / duplicate lock plan tests
* Add rollbackTargetVersion + expectedCurrentVersion + newVersion consistency tests
* Add Feature 003 → Feature 005 audit metadata cross-validation
* Validate configBeforeHash / configAfterHash / diffHash continuity
* Validate rollbackReason propagation into rollback audit event plan
* Validate sourceRecommendationId / approvalId / auditTrailId continuity
* Strengthen transaction plan safety assertions
* Strengthen idempotency lock plan semantics
* Add docs
* Add tests
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
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Phase 3 must remain dry-run transaction readiness only.
* Transaction plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Idempotency lock must remain plan-only.
* No real transaction may be executed.
* No real settings mutation may occur.
* No real settingsHistory write may occur.
* Rollback must remain modeled as a new human-approved change.
* rollbackToken must bind tenantId, approvalId, rollbackTargetVersion, expectedCurrentVersion, newVersion, auditTrailId, and rollbackReason.
* rollback idempotency lock plan must explicitly model duplicate/conflict handling.
* audit event plan must include configBeforeHash, configAfterHash, diffHash, rollbackReason where applicable.
* Feature 003 recommendation continuity must be preserved through Feature 005 transaction plan.
* Tenant hard guard must execute before all other validation.
* AI caller must be blocked.
* Human approval must remain required.
* settingsHistory must remain modeled as immutable append-only.
* BigInt canonical JSON behavior must remain BLOCKED and tested.
* canonical JSON must remain deterministic.

---

## Team State

* Claude: GO — Feature 005 Phase 3 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 005 Phase 3 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 005 Phase 3 report:
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
* confirmation that rollbackToken transaction readiness is hardened
* confirmation that rollback idempotency lock conflict simulation is tested
* confirmation that audit metadata cross-validation is implemented
* confirmation that configBeforeHash / configAfterHash / diffHash continuity is validated
* confirmation that rollbackReason is carried into rollback audit event plan
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
