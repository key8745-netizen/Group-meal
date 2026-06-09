# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5G: Production Readiness Final Boundary Planning

---

## Current Phase

Phase 5G Spec / Simulation Design: PASSED — Awaiting Next Phase Planning

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
* Feature 009 Phase 5G Spec v1.1: PASSED
* Feature 009 Phase 5G Grok Final Validation: PASS
* ChatGPT Decision: Phase 5G Planning / Spec Design PASSED; Claude updates SSOT only and remains HOLD

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`ef821be`

---

## Phase 5G Status

Phase 5G completed as **Simulation Design & Planning Only**.

Confirmed:
* Zero Real Write continues
* no production mutation
* no production canary write
* no rollout
* no implementation
* no `src/` changes
* Claude remains HOLD
* any future implementation requires a new Gatekeeper-approved phase

---

## Phase 5G Final Boundary

Phase 5G defines the final planning boundary before any future production-readiness decision.
Phase 5G does **not** authorize:
* real production write
* production canary write
* tenant lock mutation
* production gate mutation
* runtime implementation
* source code implementation
* UI
* rollback
* cleanup
* Netlify Function
* Cloud Function

---

## Allowed Now

* SSOT update
* documentation update only if strictly needed
* planning discussion
* Gemini next-phase spec drafting if ibi approves
* Grok next-phase review preparation
* Claude remains HOLD

---

## Forbidden Now

* Do not implement Phase 5G
* Do not modify `src/`
* Do not modify production / canary / rollout code
* Do not add runtime validation code
* Do not add tracing interceptor code
* Do not add tenant lock code
* Do not add production gate code
* Do not enable production write
* Do not enable production canary write
* Do not enable rollout
* Do not add UI / rollback / cleanup
* Do not allow AI apply / reset / approve / modify gate

---

## Team State

* Claude: HOLD
* Gemini: HOLD / await next instruction
* Grok: HOLD / await next instruction
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi / ChatGPT decision on whether to begin Feature 009 Phase 5H Planning / Spec Design.
No agent may start Phase 5H until instructed by ibi / ChatGPT.

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
