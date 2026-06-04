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

Phase 1: Pure Logic & Validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004 dry-run version: CLOSED
* Feature 005 dry-run execution version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 005 Post-Release Monitoring: PASSED
* Feature 005 Monitoring Commit: `a2da1e4`
* Feature 005 Monitoring Tests: 282 assertions pass
* Feature 005 Release Gate Checklist: 24/24 pass
* Feature 005 Monitoring Grok Review: 93/100
* ChatGPT Decision: Begin Feature 006 Planning only; Claude HOLD
* Feature 006 Phase 1: PASSED
* Feature 006 Phase 1 Commit: f74513e

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`a2da1e4`

---

## Feature 006 Goal

Design a safe real execution boundary for human-approved model config apply.
Feature 006 may allow real model config apply in a future implementation phase, but only through:
* explicit human approval
* strict service guard
* single Firestore transaction
* immutable settingsHistory write
* settings currentVersion update
* idempotency lock
* expectedCurrentVersion check
* complete audit trail append
* AI caller hard block

Feature 006 must also define rollback safety, but real rollback may be separated into a later feature if needed.

---

## Allowed in this phase

* Feature 006 requirements discussion
* Gemini produces Feature 006 Spec
* Grok reviews Feature 006 Spec
* Define real apply transaction boundary
* Define service guard entrance requirements
* Define persisted approval validation
* Define idempotency lock storage strategy
* Define applyToken lock semantics
* Define rollbackToken lock semantics
* Define expectedCurrentVersion race-condition guard
* Define immutable settingsHistory write strategy
* Define settings current config update strategy
* Define audit trail events
* Define rollback strategy
* Define tenant isolation
* Define AI forbidden actions
* Define Claude Phase 1 implementation scope
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not write Firestore
* Do not modify settings
* Do not write settingsHistory
* Do not create real approval records
* Do not create real apply records
* Do not create real rollback records
* Do not apply config
* Do not rollback config
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

* Feature 006 must preserve human final control.
* AI may recommend config changes but cannot apply them.
* AI must be blocked even if invoked through Admin SDK / Service Account / Netlify Function.
* Any real apply must require explicit human approval.
* Any real apply must occur inside one Firestore transaction.
* Any real apply must be idempotency-protected.
* Any real apply must write immutable settingsHistory.
* Any real apply must update settings current config and currentVersion in the same transaction.
* Any real apply must append audit trail in the same transaction or use a clearly defined atomic audit strategy.
* No settings mutation may occur without approvalId, auditTrailId, tenantId, expectedCurrentVersion, and applyToken.
* Rollback must also require human approval, transaction safety, idempotency, version conflict guard, and audit trail.
* Rollback must not delete history or overwrite historical versions.
* Feature 006 Spec must be reviewed by Grok before Claude can implement.

---

## Priority Risks From Feature 005 Monitoring

These must be addressed in Feature 006 Spec:
1. Rollback token storage and transaction integration.
2. Rollback conflict resolution in real transaction context.
3. Version chain check for rollbackTargetVersion / expectedCurrentVersion / newVersion.
4. rollbackReason / rollbackTargetVersion production boundary tests.
5. Audit metadata consistency under real apply / rollback execution.

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 006 Spec
* Grok: GO - Prepare Feature 006 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 006 Spec.
Spec should define:
* real model config apply transaction flow
* real persisted approval validation
* transaction pseudo-code
* idempotency lock collection / schema
* applyToken / rollbackToken storage strategy
* settingsHistory immutable version write
* settings currentVersion update
* audit event transaction strategy
* rollback strategy
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
