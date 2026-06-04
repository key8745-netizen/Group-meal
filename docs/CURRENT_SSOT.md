# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 004: Model Config Apply Boundary

---

## Current Phase

Planning / Spec Design

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring First Window: PASSED
* Deployed Branch: `claude/fervent-dirac-HJT01`
* Deployed Commit: `ffbabe8`
* Post-Release Monitoring Review: 96/100
* Final Recommendation: MONITORING_OK
* ChatGPT Decision: Begin Feature 004 Planning only; Claude HOLD

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`ffbabe8`

---

## Allowed in this phase

* Feature 004 requirements discussion
* Gemini produces Feature 004 Spec
* Grok reviews Feature 004 Spec
* Define safe human-approved model config apply flow
* Define config recommendation approval boundary
* Define audit trail requirements
* Define settings mutation guard
* Define rollback / versioning strategy
* Define forbidden actions
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not add UI
* Do not add Netlify Functions
* Do not modify settings
* Do not apply model config
* Do not allow AI to apply model config
* Do not allow AI to mutate rules
* Do not change wasteFactorWarning automatically
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not introduce new Firestore write paths
* Do not bypass backend guards
* Do not bypass audit trail

---

## Required Guard Rails

* Feature 004 must preserve human final control.
* AI may recommend model config changes but cannot apply them.
* Any config apply must require explicit human approval.
* Any config apply must be auditable.
* Any settings mutation must be versioned.
* Any settings mutation must support rollback or previous-version traceability.
* AI cannot mutate settings, thresholds, confidence rules, or weighting formula.
* Feature 004 Spec must be reviewed by Grok before Claude can implement.

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 004 Spec
* Grok: GO - Prepare Feature 004 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 004 Spec.
Spec should define:
* model config recommendation approval flow
* human approval schema
* settings mutation boundary
* versioning / rollback strategy
* audit events
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
