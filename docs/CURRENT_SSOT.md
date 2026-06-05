# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009: Real Model Config Apply Transaction Implementation

---

## Current Phase

Phase 3: Real Verification / Transaction Read-Set Contract Integration — COMPLETE

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
* Feature 008 Post-Release Monitoring: PASSED
* Feature 008 Post-Release Monitoring Commit: `1e28a54`
* Feature 008 Monitoring Review: 95/100
* Feature 008 Monitoring Recommendation: MONITORING_OK
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* ChatGPT Decision: Begin Feature 009 Planning only; Claude HOLD

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`1e28a54`

---

## Feature 009 Goal

Design the first real Firestore transaction implementation for human-approved model config apply.
Feature 009 may implement real model config apply only if the Spec is approved by Grok and explicitly authorized by ChatGPT / ibi.
The real transaction must preserve:
* human final control
* explicit persisted approval
* verified human caller context
* default-deny service guard
* AI caller hard block
* single Firestore transaction
* immutable `settingsHistory` write
* `settings.currentVersion` update
* idempotency lock write
* expectedCurrentVersion guard
* canonical hash validation inside transaction
* full audit trail
* duplicate apply prevention
* rollback exclusion unless explicitly scoped

---

## Allowed in this phase

* Feature 009 requirements discussion
* Gemini produces Feature 009 Spec
* Grok reviews Feature 009 Spec
* Define real Firestore transaction implementation boundary
* Define transaction read set
* Define transaction write set
* Define persisted approval read strategy
* Define `settings/{tenantId}` read / update strategy
* Define `settingsHistory/{tenantId}/versions/{version}` immutable write strategy
* Define idempotency lock write strategy
* Define audit event write strategy
* Define expectedCurrentVersion guard
* Define canonical hash validation inside transaction
* Define duplicate apply handling
* Define transaction retry behavior
* Define transaction failure behavior
* Define rollback inclusion / exclusion boundary
* Define cleanup inclusion / exclusion boundary
* Define UI inclusion / exclusion boundary
* Define Claude Phase 1 implementation scope
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not write Firestore
* Do not read Firestore
* Do not call `runTransaction`
* Do not modify `settings`
* Do not write `settingsHistory`
* Do not create real approval records
* Do not create real apply records
* Do not create real rollback records
* Do not create real cleanup jobs
* Do not apply config
* Do not rollback config
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

* Claude remains HOLD until Feature 009 Spec passes Grok review.
* Feature 009 must not begin implementation during Planning / Spec Design.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* AI cannot create approval records.
* AI cannot create apply records.
* AI cannot execute rollback.
* Admin SDK / Service Account must not imply business permission.
* Upstream verified human context must be mandatory.
* Client-supplied verification must be rejected.
* Persisted human approval must be mandatory.
* Transaction must validate approval before writing anything.
* Transaction must validate tenantId before writing anything.
* Transaction must validate expectedCurrentVersion.
* Transaction must canonicalize current config inside transaction.
* Transaction must validate configBeforeHash against actual current config.
* Transaction must validate configAfterHash and diffHash.
* Transaction must write idempotency lock.
* Transaction must write immutable settingsHistory.
* Transaction must update settings current config and currentVersion.
* Transaction must write audit event or define a safe atomic audit strategy.
* Duplicate apply must be blocked or idempotently recognized.
* settingsHistory must remain append-only.
* Rollback must be deferred unless fully specified.
* Cleanup job must be deferred unless fully specified.
* UI must be deferred unless fully specified.

---

## Priority Risks From Feature 008 Monitoring

Feature 009 Spec must address:
1. Real Firestore transaction execution is not yet implemented.
2. Real settings mutation is not yet implemented.
3. Real settingsHistory write is not yet implemented.
4. Real approval read / validation is not yet implemented.
5. Real idempotency lock write is not yet implemented.
6. Real audit event write strategy is not yet implemented.
7. Token verification was modeled through production-like contract simulation.
8. Feature 009 must define how verified context enters the executor.
9. Feature 009 must define transaction retry / duplicate apply behavior.
10. Feature 009 must define failure recovery and partially failed audit strategy.
11. Feature 009 must decide whether rollback is excluded or included.
12. Feature 009 must decide whether cleanup job is excluded or included.
13. Feature 009 must decide whether UI is excluded or included.

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Spec
* Grok: GO - Prepare Feature 009 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Spec.
Spec should define:
* real transaction executor boundary
* real Firestore read set
* real Firestore write set
* persisted approval read and validation
* verified caller context contract
* settings current config read and validation
* settingsHistory immutable version write
* idempotency lock schema and write behavior
* expectedCurrentVersion behavior
* canonical hash validation inside transaction
* audit event write strategy
* duplicate apply handling
* transaction retry behavior
* failure / rollback strategy
* rollback boundary decision
* cleanup boundary decision
* UI boundary decision
* security rules / service guard assumptions
* Claude Phase 1 implementation scope

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
