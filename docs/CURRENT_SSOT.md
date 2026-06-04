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

Phase 4: COMPLETED — awaiting Grok review

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
* Feature 006 Phase 2: PASSED
* Feature 006 Phase 2 Commit: `6ed438f`
* Feature 006 Phase 2 Grok Code Review: 92/100
* Feature 006 Phase 3: PASSED
* Feature 006 Phase 3 Commit: `403231f`
* Feature 006 Phase 3 Grok Code Review: 92/100
* ChatGPT Decision: Claude GO - Feature 006 Phase 4 only
* Feature 006 Phase 4: PASSED
* Feature 006 Phase 4 Commit: pending

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`403231f` (Phase 3) → Phase 4 pending commit

---

## Phase 4 Priority Risks

Grok identified two remaining medium risks that must be handled in Phase 4:
1. Lock cleanup query criteria and maintenance audit payload completeness:
   * Phase 3 documented cleanup owner / trigger / TTL.
   * Phase 4 must define concrete dry-run query criteria and maintenance audit payload structure.
2. Multi-version rollback snapshot mapping:
   * Phase 3 modeled settingsHistory snapshot mapping.
   * Phase 4 must validate multi-version rollback chains and version consistency.

These are mandatory Phase 4 work items.

---

## Allowed in this phase

* Final transaction-readiness hardening
* Lock cleanup query criteria modeling
* Lock cleanup dry-run query plan helper
* Maintenance audit event payload helper
* Maintenance audit event payload tests
* Multi-version settingsHistory snapshot mapping
* Multi-version rollback chain validation
* Version chain consistency tests
* Historical hash propagation tests
* Dry-run release gate checklist
* Final boundary regression tests
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
* Do not create real cleanup jobs
* Do not add Cloud Functions
* Do not add Netlify Functions
* Do not add UI
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

* Phase 4 must remain transaction-readiness only.
* No real Firestore read/write may occur.
* No real cleanup job may be created.
* No real transaction may be executed.
* Transaction plans must remain non-executable.
* Cleanup plans must remain non-executable.
* `executable` must remain `false`.
* `aiCanExecute` must remain `false`.
* Idempotency locks remain plan-only.
* Cleanup query criteria must be descriptive only.
* Cleanup query criteria must not contain executable Firestore query objects.
* Maintenance audit event payload must be pure data only.
* Maintenance audit event must not be written.
* settingsHistory snapshot mapping must be deterministic.
* Multi-version rollback chain must validate version chain semantics.
* historicalConfigHash mismatch must be BLOCKED.
* Missing settingsHistory snapshot must be BLOCKED.
* Deleted / overwritten / mutable history snapshot must be BLOCKED.
* Lock cleanup owner must not be AI.
* Lock cleanup must not delete active locks.
* AI caller must be blocked.
* Tenant hard guard must execute before all other validation.
* Admin SDK / Service Account must not bypass business guard.
* All helpers must be pure and covered by tests.

---

## Team State

* Claude: GO - Feature 006 Phase 4 only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 006 Phase 4 code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Grok Feature 006 Phase 4 code review.

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
