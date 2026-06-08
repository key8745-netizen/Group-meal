# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5F: Production Readiness Next-Step Planning

---

## Current Phase

Planning / Spec Design

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Post-Emulator Monitoring: PASSED
* Feature 009 Phase 5B: PASSED / Post-Monitoring: PASSED
* Feature 009 Phase 5C: PASSED / Post-Monitoring: PASSED
* Feature 009 Phase 5D: PASSED / Post-Monitoring: PASSED
* Feature 009 Phase 5E Spec v1.3 Final: PASSED
* Feature 009 Phase 5E Implementation: PASSED
* Feature 009 Phase 5E Implementation Commit: `784fd01b73cf55c3d4ecfbcb052ce2b93870c123`
* Feature 009 Phase 5E Grok Code Review: PASS
* Feature 009 Phase 5E Post-Monitoring: PASSED (commit `6c9f7c4`, MONITORING_OK)
* Feature 009 Phase 5E Grok Monitoring Review: PASS
* ChatGPT Decision: Begin Feature 009 Phase 5F Planning / Spec Design only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`6c9f7c4`

---

## Phase 5F Status

Phase 5F is in Planning / Spec Design only. No implementation has begun.
Gemini is to produce Feature 009 Phase 5F Spec v1.0 (full text, with explicit scope decision
among: readiness-only / staging-only / extended dry-run canary / production-gated canary
planning only / limited production-gated canary / no rollout), carrying forward Phase 5E
known limitations (HALT timing validation, high-load concurrency, token/flag runtime schema
hardening, dry-run audit difference threshold strategy) for resolution in the spec.
Grok is to prepare the Phase 5F Spec Review once Gemini's Spec v1.0 is produced.

---

## Allowed in this phase

* Gemini: produce Feature 009 Phase 5F Spec v1.0 (full text)
* Grok: prepare Phase 5F Spec Review
* Claude: read/discuss spec drafts when provided; documentation support; SSOT update when explicitly instructed
* Discussion of Phase 5F scope decision and design tradeoffs

---

## Forbidden in this phase

* Do not start any Phase 5F implementation
* Do not add any Phase 5F code/files
* Do not modify production / canary / rollout related behavior
* Do not allow real production write
* Do not allow production canary write
* Do not allow broad production rollout
* Do not enable real canary rollout in production
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config / reset kill switch / approve reset / modify production gate
* Do not bypass deployment gate, tenant allowlist, operator allowlist, operator confirmation, kill switch, or emergency disable
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A–5E behavior except through monitoring documentation

---

## Required Safety Position for Phase 5F Spec

Unless explicitly and sufficiently justified in the Spec, Phase 5F should default to conservative:
* no real production write
* no broad rollout
* no UI
* no rollback automation
* no cleanup automation
* AI cannot apply / reset / approve reset / modify gate
* Service Account / Admin SDK cannot bypass business guard
* emergency disable always highest priority

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5F Spec v1.0
* Grok: GO - Prepare Phase 5F Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

1. Gemini's full Feature 009 Phase 5F Spec v1.0 body (not summary/verdict)
2. Grok's full Phase 5F Spec Review body (itemized, not score-only)
3. ChatGPT/ibi formal verdict + new SSOT content authorizing any phase transition

Claude will remain HOLD and will not transition to Implementation until all three of the
above appear in-conversation as substantive bodies (per the established three-artifact rule),
and a formal Gatekeeper verdict with new SSOT content explicitly authorizes the transition.

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
