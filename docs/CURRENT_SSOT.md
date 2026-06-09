# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5H: Production Readiness Decision Planning

---

## Current Phase

Planning / Spec Design

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Post-Emulator Monitoring: PASSED
* Feature 009 Phase 5B Implementation: PASSED
* Feature 009 Phase 5B Post-Monitoring: PASSED
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C Post-Monitoring: PASSED
* Feature 009 Phase 5D Implementation: PASSED
* Feature 009 Phase 5D Post-Monitoring: PASSED
* Feature 009 Phase 5E Implementation: PASSED
* Feature 009 Phase 5E Post-Monitoring: PASSED
* Feature 009 Phase 5F Implementation: PASSED
* Feature 009 Phase 5F Post-Monitoring: PASSED
* Feature 009 Phase 5F Post-Monitoring Commit: `ef821be`
* Feature 009 Phase 5G Spec / Simulation Design: PASSED
* Feature 009 Phase 5G SSOT Commit: `9258cf6`
* ChatGPT Decision: Phase 5G CLOSED / PASSED; begin Phase 5H Planning / Spec Design only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`9258cf6`

---

## Phase 5G Final Status

Phase 5G completed as Simulation Design & Planning Only. Confirmed:
* Zero Real Write continued
* no production mutation
* no production canary write
* no rollout
* no implementation
* no `src/` changes
* any future implementation requires a new Gatekeeper-approved phase

---

## Phase 5H Goal

Decide whether Feature 009 should:
1. no rollout / stop here
2. readiness-only continuation
3. extended simulation design
4. production-gated canary proposal only
5. limited production-gated canary design
6. production-gated implementation planning

No implementation is allowed until Gemini produces a full Phase 5H Spec, Grok reviews it, and ChatGPT / ibi explicitly approve Claude to proceed.

---

## Phase 5H Required Carry-over Topics

Gemini Phase 5H Spec must explicitly address:
1. Whether Zero Real Write continues
2. Whether no production mutation continues
3. Whether no production canary write continues
4. Whether to enter production-gated canary proposal
5. Whether to stop Feature 009 Phase 5 series
6. Whether to return to Product / Business decision rather than continue engineering phases

---

## Allowed in this phase

* Gemini produces Phase 5H Spec
* Grok prepares Phase 5H Spec Review
* requirements discussion
* docs / SSOT update
* Claude remains HOLD

---

## Forbidden in this phase

* Do not let Claude implement Phase 5H
* Do not enable real production write
* Do not enable production canary write
* Do not enable production mutation
* Do not enable broad production rollout
* Do not add UI / rollback / cleanup
* Do not allow AI apply / reset / approve reset / modify gate
* Do not modify `src/`
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A–5G implementation behavior

---

## Required Safety Position for Phase 5H Spec

Unless explicitly and sufficiently justified in the Spec:
* no real production write
* no production canary write
* no production mutation
* no broad rollout
* no UI / rollback automation / cleanup automation
* AI cannot apply / reset / approve reset / modify gate
* Service Account / Admin SDK cannot bypass business guard
* emergency disable always highest priority
* Claude remains HOLD unless Gatekeeper explicitly approves a future implementation phase

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5H Spec
* Grok: Prepare Phase 5H Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini's full Feature 009 Phase 5H Spec v1.0 body, then Grok's full independent Spec Review body, then ChatGPT/ibi formal Gatekeeper verdict + new SSOT. Claude will not transition until all three appear as substantive bodies in-conversation (established three-artifact rule).

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
