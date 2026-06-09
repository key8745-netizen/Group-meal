# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009: Real Model Config Apply Transaction Implementation

---

## Current Phase

CLOSED / ARCHIVED

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5B: PASSED
* Feature 009 Phase 5C: PASSED
* Feature 009 Phase 5D: PASSED
* Feature 009 Phase 5E: PASSED
* Feature 009 Phase 5F: PASSED
* Feature 009 Phase 5G Spec / Simulation Design: PASSED
* Feature 009 Closure Plan v1.0: PASSED
* Feature 009 Grok Final Integrity Review: PASS
* ChatGPT Decision: Feature 009 CLOSED / ARCHIVED; documentation-only archive allowed; Claude enters Permanent HOLD

---

## Final Safety State

* Zero Real Write maintained
* No production write
* No production canary write
* No rollout
* No production mutation
* No UI
* No rollback
* No cleanup
* No Netlify Function
* No Cloud Function
* AI cannot apply / reset / approve / modify gate
* Feature 001–008 core flow remains unchanged
* Feature 009 is closed as an archived engineering safety asset

---

## Allowed

* Documentation archive only
* `docs/CURRENT_SSOT.md`
* `docs/legacy/feature_009_safe_architecture.md`
* `docs/archive/feature_009_final_state.md`
* closure documentation

---

## Forbidden

* No `src/` changes
* No production write
* No production canary write
* No rollout
* No UI
* No rollback
* No cleanup
* No Netlify Function
* No Cloud Function
* No AI apply / reset / approve / modify gate
* No branch deletion
* No `.claude/` deletion
* No git tag unless ibi separately approves
* No next phase work
* No new feature work

---

## Team State

* Claude: Permanent HOLD after archive documentation commit
* Gemini: HOLD
* Grok: HOLD
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decides the next Feature, project direction, or whether to pause development.

---

## Agent Reading Rule

Before starting any future work, every agent must read this file and follow only this current state.
Old conversations, previous specs, previous phases, and archived Feature 009 materials are historical context only.
