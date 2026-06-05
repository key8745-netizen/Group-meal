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

Planning / Spec Design

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004: CLOSED
* Feature 005: CLOSED
* Feature 006 dry-run transaction-readiness version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 006 Post-Release Monitoring: PASSED
* Feature 006 Monitoring Commit: `9bf802d`
* Feature 006 Monitoring Tests: 509 assertions pass
* Feature 006 Monitoring Grok Review: 94/100
* ChatGPT Decision: Begin Feature 007 Planning only; Claude HOLD

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`9bf802d`

---

## Feature 007 Goal

Design the real execution mechanism for human-approved model config apply.
Feature 007 may allow real model config apply in a future implementation phase, but only through:
* explicit human approval
* strict service guard
* single Firestore transaction
* immutable settingsHistory write
* settings currentVersion update
* idempotency lock
* expectedCurrentVersion check
* historical hash validation
* complete audit trail append
* AI caller hard block

Rollback may be included only if Gemini Spec and Grok Review explicitly approve it. Otherwise, rollback should be separated into a later Feature.

---

## Allowed in this phase

* Feature 007 requirements discussion
* Gemini produces Feature 007 Spec
* Grok reviews Feature 007 Spec
* Define real apply transaction boundary
* Define persisted approval validation
* Define service guard entrance contract
* Define settings mutation rules
* Define immutable settingsHistory write strategy
* Define idempotency lock write strategy
* Define applyToken lock storage strategy
* Define expectedCurrentVersion race-condition guard
* Define audit event transaction strategy
* Define rollback inclusion / exclusion boundary
* Define cleanup job exclusion or future-feature boundary
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
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 007 must preserve human final control.
* AI may recommend config changes but cannot apply them.
* AI must be blocked even if invoked through Admin SDK / Service Account / Netlify Function / Cloud Function.
* Any real apply must require explicit persisted human approval.
* Any real apply must occur inside one Firestore transaction.
* Any real apply must be idempotency-protected.
* Any real apply must write immutable settingsHistory.
* Any real apply must update settings current config and currentVersion in the same transaction.
* Any real apply must append audit trail in the same transaction or use a clearly defined atomic audit strategy.
* No settings mutation may occur without approvalId, auditTrailId, tenantId, expectedCurrentVersion, and applyToken.
* expectedCurrentVersion must prevent race conditions.
* historical hash validation must prevent applying against stale or tampered config state.
* settingsHistory must remain immutable append-only.
* Feature 007 Spec must be reviewed by Grok before Claude can implement.
* Claude must remain HOLD until ChatGPT explicitly authorizes Phase 1.

---

## Priority Risks From Feature 006 Monitoring

These must be addressed in Feature 007 Spec:
1. Real cleanup query performance and rate-limiting if cleanup is included.
2. Large-volume expired lock handling.
3. Multi-version rollback chain production boundary testing.
4. Version chain consistency under repeated apply / rollback.
5. Audit metadata consistency under real transaction execution.
6. Admin SDK / Service Account cannot bypass business guard.

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 007 Spec
* Grok: GO - Prepare Feature 007 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 007 Spec.
Spec should define:
* real model config apply transaction flow
* persisted approval validation
* service guard entrance contract
* transaction pseudo-code
* idempotency lock collection / schema
* applyToken storage and duplicate handling
* settingsHistory immutable version write
* settings currentVersion update
* audit event transaction strategy
* rollback inclusion / exclusion boundary
* cleanup job inclusion / exclusion boundary
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
