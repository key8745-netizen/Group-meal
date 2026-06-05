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

Phase 1: PASSED — Awaiting Phase 2 SSOT

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
* Feature 007 Spec v1.2 Grok Review: 96/100
* Feature 007 Phase 1: PASSED
* Feature 007 Phase 1 Commit: `380e645`
* Feature 007 Phase 1 Grok Code Review: 94/100
* ChatGPT Decision: Feature 007 Phase 2 authorized pending new SSOT

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`380e645`

---

## Allowed in this phase

* TypeScript interfaces
* transaction contract validators
* service guard entrance validators
* default-deny guard helpers
* canonicalization validators
* idempotency lock schema validators
* transaction pseudo-plan builder
* security boundary test helpers
* audit event pure helper
* CI / static guard rules for forbidden imports and forbidden calls
* tests
* docs
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

* Phase 1 must remain pure logic only.
* No real Firestore read/write may occur.
* No real transaction may be executed.
* Transaction plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Service guard must be default-deny.
* Context parsing failure must BLOCK.
* Unknown caller type must BLOCK.
* Missing human user id must BLOCK.
* AI caller must BLOCK.
* Service Account / Admin SDK must not imply permission.
* Tenant hard guard must execute before all other validation.
* Canonicalization must be deterministic.
* BigInt / NaN / Infinity / circular references must follow Spec v1.2 rules.
* currentConfigHash / configBeforeHash / configAfterHash / diffHash validation must be modeled.
* Idempotency lock schema must be modeled but not written.
* Audit event helper must be pure payload generation only.
* Static guards / CI rules must prevent forbidden imports and forbidden calls.

---

## Team State

* Claude: HOLD — awaiting Phase 2 SSOT
* Gemini: HOLD
* Grok: HOLD — Phase 2 review on standby
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Phase 2 Medium Risks (Must Address)

From Grok Phase 1 review — both must be Phase 2 mandatory items:
1. Default-deny guard spoofed context / malformed token regression tests
2. Canonicalization hash consistency integration in pseudo-plan builder

---

## Next Expected Input

ibi / ChatGPT: Feature 007 Phase 2 SSOT and authorization.

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
