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

Planning / Spec Design

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Feature 004 dry-run version: CLOSED
* Production Release: COMPLETED
* Merge to Production Branch: COMPLETED
* Post-Merge Review: PASSED
* Post-Release Monitoring: PASSED
* Production Branch: `claude/fervent-dirac-HJT01`
* Merge Commit: `5f64916`
* Post-merge Tests: 1026/1026 pass
* Smoke Tests: 9/9 pass
* Grok Post-Merge / Post-Release Review: 96/100
* Feature 004 Dry-run Flow: STABLE
* Feature 004 Simulated Approval Isolation: INTACT
* Feature 004 Apply Plan Non-executable: CONFIRMED
* Feature 004 Rollback Plan Non-executable: CONFIRMED
* ChatGPT Decision: Production Release Completed; begin Feature 005 Planning only; Claude HOLD

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`5f64916`

---

## Current Status

Production Release Completed.
Feature 005 is now allowed to enter Planning / Spec Design only.
Claude must remain HOLD until Gemini Spec and Grok Red Team Review are complete and ChatGPT explicitly authorizes Phase 1.

---

## Feature 005 Goal

Design a safe, human-approved execution mechanism for applying model config changes.
Feature 005 may eventually allow real settings mutation, but only after:
* Gemini Spec
* Grok Red Team Review
* ChatGPT Gatekeeping
* strict phased implementation
* transaction / idempotency design
* immutable settingsHistory versioning
* rollback design
* complete audit trail design

---

## Allowed in this phase

* Feature 005 requirements discussion
* Gemini produces Feature 005 Spec
* Grok reviews Feature 005 Spec
* Define persisted human approval schema
* Define real model config apply flow
* Define settings mutation transaction boundary
* Define idempotency lock / applyToken strategy
* Define immutable settingsHistory versioning
* Define rollback strategy
* Define audit trail requirements
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
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change wasteFactorWarning automatically
* Do not introduce new production write paths

---

## Required Guard Rails

* Feature 005 must preserve human final control.
* AI may recommend config changes but cannot apply them.
* Any real apply must require explicit human approval.
* Any real apply must be transaction-protected.
* Any real apply must be idempotency-protected.
* Any real apply must write immutable settingsHistory.
* Any real apply must append audit trail.
* Any settings mutation must be versioned.
* Any rollback must also require human approval.
* Any rollback must be auditable, idempotent, and version-aware.
* No settings mutation may occur without approvalId, auditTrailId, tenantId, expectedVersion, and applyToken.
* AI cannot mutate settings, thresholds, confidence rules, prediction formula, or weighting formula.
* Feature 005 Spec must be reviewed by Grok before Claude can implement.

---

## Team State

* Claude: HOLD
* Gemini: GO — Produce Feature 005 Spec
* Grok: GO — Prepare Feature 005 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 005 Spec.
Spec should define:
* real model config apply flow
* persisted human approval schema
* approved config change schema
* settings mutation transaction boundary
* idempotency / applyToken lock strategy
* settingsHistory immutable versioning
* rollback strategy
* audit events
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
