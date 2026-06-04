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

Phase 1: Pure Logic & Validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004 dry-run version: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring: PASSED
* Feature 005 Spec v1.1: PASSED
* Feature 005 Spec v1.1 Grok Review: 94/100
* ChatGPT Decision: Claude GO — Feature 005 Phase 1 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`395d3bf`

---

## Allowed in this phase

* TypeScript interfaces for real model config apply boundary
* Persisted approval validators
* Apply preflight validator
* Rollback preflight validator
* Transaction plan builder
* Rollback transaction plan helper
* Idempotency lock schema helper
* applyToken generation / validation helper
* rollbackToken generation / validation helper
* settingsHistory version schema helper
* immutable version metadata helper
* canonical JSON / SHA-256 hash helper hardening
* audit event pure helper
* static import / forbidden syntax guard config
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

* Phase 1 must remain pure logic only.
* Claude may define transaction plans but must not execute transactions.
* Claude may define schemas and validators but must not persist records.
* AI caller must be blocked from any future apply / rollback plan.
* Tenant hard guard must execute before all other validation.
* `tenantId` mismatch must be BLOCKED.
* Missing `approvalId` must be BLOCKED.
* Missing `auditTrailId` must be BLOCKED.
* Missing `expectedCurrentVersion` must be BLOCKED.
* Missing `applyToken` must be BLOCKED.
* Missing `rollbackToken` must be BLOCKED for rollback plans.
* rollback must be modeled as a new human-approved change.
* rollback must not delete or overwrite settings history.
* settingsHistory must be modeled as immutable append-only.
* `configBeforeHash`, `configAfterHash`, and `diffHash` must be deterministic.
* canonical JSON must define behavior for nested arrays, BigInt, NaN, Infinity, Date, undefined, function, symbol, and circular references.
* applyToken / rollbackToken must be deterministic and bind to tenantId, version, auditTrailId, and diff / rollback target.
* Phase 1 must include tests proving no Firestore imports, no `runTransaction`, no UI, and no Netlify Function changes.

---

## Team State

* Claude: GO — Feature 005 Phase 1 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 005 Phase 1 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 005 Phase 1 report:
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
* confirmation that tenant hard guard is first validation step
* confirmation that applyToken / rollbackToken generation rules are implemented
* confirmation that canonical JSON extreme cases are tested
* confirmation that settingsHistory is modeled as immutable append-only
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
