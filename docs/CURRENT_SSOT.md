# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 008: Real Model Config Apply Transaction Executor

---

## Current Phase

Phase 1: Pure Logic & Validation

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
* Feature 007 Post-Release Monitoring: PASSED
* Feature 007 Monitoring Commit: `81cb3dd`
* Feature 007 Monitoring Review: 94/100
* Feature 007 Monitoring Recommendation: MONITORING_OK
* ChatGPT Decision: Feature 008 Phase 1 authorized; Claude GO Phase 1 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`81cb3dd`

---

## Feature 008 Goal

Design the first real transaction executor for human-approved model config apply.
Feature 008 may allow real model config apply in a future implementation phase, but only through:
* explicit persisted human approval
* verified human caller context
* strict default-deny service guard
* single Firestore transaction
* immutable `settingsHistory` write
* `settings.currentVersion` update
* idempotency lock write
* expectedCurrentVersion guard
* canonical hash validation inside transaction
* complete audit trail
* AI caller hard block

Rollback is not automatically included.
Cleanup job is not automatically included.
UI approval flow is not automatically included.
Gemini Spec must explicitly define whether rollback, cleanup, or UI are excluded or deferred.

---

## Priority Risks From Feature 007 Monitoring

These must be addressed in Feature 008 Spec:
1. Advanced forged context under long-running / production-like conditions:
   * Feature 007 passed spoofed token and multi-claim tests.
   * Feature 008 must define real token verification middleware and guard integration.
2. Deep nested hash propagation under concurrent modification:
   * Feature 007 passed full-chain and nested hash tests.
   * Feature 008 must define production boundary tests for deep nested config plus concurrent modification.
3. `tokenVerificationStatus='verified'` is currently contract-level only:
   * Feature 008 must define where actual Firebase token verification happens.
   * Feature 008 must prevent client-supplied fake verification status.
4. Real Firestore transaction execution has not yet been implemented.
5. Real settings mutation and settingsHistory writes have not yet been implemented.
6. Real idempotency lock writes have not yet been implemented.
7. Audit event atomicity under real transaction must be defined.

---

## Allowed in this phase

* Feature 008 requirements discussion
* Gemini produces Feature 008 Spec
* Grok reviews Feature 008 Spec
* Define real apply transaction executor boundary
* Define persisted approval validation
* Define default-deny service guard entrance contract
* Define upstream token verification boundary
* Define settings mutation rules
* Define immutable settingsHistory write strategy
* Define idempotency lock write strategy
* Define applyToken storage and duplicate handling
* Define expectedCurrentVersion race-condition guard
* Define canonical hash validation inside transaction
* Define audit event transaction strategy
* Define transaction retry behavior
* Define rollback inclusion / exclusion boundary
* Define cleanup job inclusion / exclusion boundary
* Define UI inclusion / exclusion boundary
* Define tenant isolation
* Define AI forbidden actions
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
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 008 must preserve human final control.
* AI may recommend config changes but cannot apply them.
* AI must be blocked even if invoked through Admin SDK / Service Account / Netlify Function / Cloud Function.
* Service Account / Admin SDK must not imply permission.
* Upstream token verification boundary must be explicitly defined.
* `tokenVerificationStatus='verified'` must not rely on client input.
* Any real apply must require explicit persisted human approval.
* Any real apply must occur inside one Firestore transaction.
* Any real apply must be idempotency-protected.
* Any real apply must write immutable settingsHistory.
* Any real apply must update settings current config and currentVersion in the same transaction.
* Any real apply must append audit trail in the same transaction or use a clearly defined atomic audit strategy.
* No settings mutation may occur without approvalId, auditTrailId, tenantId, expectedCurrentVersion, applyToken, verified human caller, and valid hash continuity.
* expectedCurrentVersion must prevent race conditions.
* canonical hash validation must prevent applying against stale or tampered config state.
* settingsHistory must remain immutable append-only.
* Feature 008 Spec must be reviewed by Grok before Claude can implement.
* Claude must remain HOLD until ChatGPT explicitly authorizes Phase 1.

---

## Team State

* Claude: GO - Phase 1 only
* Gemini: HOLD
* Grok: GO - Prepare Phase 1 Code Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 008 Spec.
Spec should define:
* real model config apply transaction executor flow
* persisted approval validation
* default-deny service guard entrance contract
* upstream token verification boundary
* transaction pseudo-code
* Firestore write set
* idempotency lock collection / schema
* applyToken storage and duplicate handling
* settingsHistory immutable version write
* settings currentVersion update
* audit event transaction strategy
* rollback inclusion / exclusion boundary
* cleanup job inclusion / exclusion boundary
* UI inclusion / exclusion boundary
* tenant isolation
* AI forbidden actions
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
