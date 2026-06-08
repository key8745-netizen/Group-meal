# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5C: Production Deployment Gate Hardening + Kill Switch Reset Transaction Protection

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
* Feature 006: CLOSED
* Feature 007: CLOSED
* Feature 008: CLOSED
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Post-Emulator Monitoring: PASSED
* Feature 009 Phase 5B Spec v1.2: PASSED
* Feature 009 Phase 5B Implementation: PASSED
* Feature 009 Phase 5B Commit: `b16eeda`
* Feature 009 Phase 5B Post-Monitoring: PASSED
* Feature 009 Phase 5B Post-Monitoring Commit: `8fe7b31`
* Feature 009 Phase 5B Monitoring Review: 97/100
* ChatGPT Decision: Begin Feature 009 Phase 5C Planning only; Claude HOLD

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`8fe7b31`

---

## Phase 5C Goal

Design the next hardening layer for Feature 009 production-gated rollout.
Phase 5B established the production-gated rollout foundation:
* production disabled-by-default
* tenant allowlist mandatory
* operator allowlist mandatory
* operator confirmation mandatory
* kill switch mandatory
* emergency disable modeled
* dry-run-to-real comparison complete
* no broad production rollout
* no UI
* no rollback
* no cleanup

Phase 5C must focus on two remaining production-hardening areas:
1. Deployment Pipeline Gate physical enforcement
2. Kill Switch Reset end-to-end transaction protection

Phase 5C is Planning / Spec Design only.
Claude must remain HOLD until Gemini Spec passes Grok review and ChatGPT / ibi explicitly approve implementation.

---

## Allowed in this phase

* Phase 5C requirements discussion
* Gemini produces Phase 5C Spec
* Grok reviews Phase 5C Spec
* Define CI / deployment pipeline gate hardening
* Define Terraform / KMS / manual approval assumptions
* Define production enablement final physical gate
* Define deployment script hard-block behavior
* Define deployment audit payload
* Define deployment gate missing behavior
* Define kill switch reset transaction boundary
* Define kill switch reset audit atomicity
* Define two-person integrity reset flow
* Define reset failure consistency model
* Define emergency disable recovery strategy
* Define acceptance criteria for Phase 5C implementation
* Define Claude Phase 5C implementation scope
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not allow broad production rollout
* Do not allow production write without explicit gate
* Do not allow production write without tenant allowlist
* Do not allow production write without operator allowlist
* Do not allow production write without operator confirmation
* Do not allow production write when kill switch is ON
* Do not allow production write when deployment gate is missing
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not modify Feature 004 dry-run boundary
* Do not modify Feature 005 dry-run execution boundary
* Do not modify Feature 006 dry-run transaction-readiness boundary
* Do not modify Feature 007 dry-run real-apply readiness boundary
* Do not modify Feature 008 dry-run executor-readiness boundary
* Do not modify Feature 009 Phase 5A / 5B behavior before Spec approval

---

## Required Phase 5C Spec Topics

Gemini must explicitly define:

### 1. Deployment Pipeline Gate Physical Enforcement
* CI hard-block behavior
* deployment workflow gate
* manual approval requirement
* production enablement approval source
* Terraform / KMS / environment-secret assumptions
* whether production enablement flag can be injected only by CI
* blocked project IDs
* allowed project IDs
* staging-first behavior
* production-disabled-by-default behavior
* missing deployment gate behavior
* stale deployment gate behavior
* deployment gate audit payload
* deployment gate monitoring signal
* emergency disable interaction

### 2. Kill Switch Reset Transaction Protection
* reset transaction boundary
* reset read set
* reset write set
* reset audit event
* two-person integrity requirement
* requestedBy / approvedBy mismatch requirement
* previousState / nextState validation
* reset reason requirement
* reset timestamp requirement
* reset auditTrailId requirement
* reset failure behavior
* inconsistent state prevention
* reset idempotency behavior
* reset monitoring signal

### 3. Phase 5C Implementation Boundary
* exact allowed files
* exact forbidden files
* whether implementation is app-level contract only, CI-level scripts, or both
* whether any deployment workflow file may be modified
* whether Terraform/KMS files are in scope
* whether production write remains disabled-by-default
* whether broad production rollout remains forbidden

---

## Required Guard Rails For Phase 5C Spec

* Claude remains HOLD until Spec passes.
* AI cannot apply config.
* AI cannot mutate settings or rules.
* Production remains disabled-by-default.
* Broad production rollout remains forbidden.
* Tenant allowlist remains mandatory.
* Operator allowlist remains mandatory.
* Operator confirmation remains mandatory.
* Kill switch remains mandatory.
* Kill switch reset must be audited.
* Kill switch reset must not be single-person if TPI is required.
* Deployment gate must not be app-level only if Phase 5C chooses physical enforcement.
* Missing deployment gate must BLOCK.
* Missing reset audit payload must BLOCK.
* Reset failure must not leave inconsistent state.
* Rollback remains excluded unless fully specified.
* Cleanup remains excluded unless fully specified.
* UI remains excluded unless fully specified.

---

## Required Phase 5C Risk Questions

Gemini must explicitly answer:
1. Is Phase 5C app-level only, CI-level, Terraform/KMS-level, or mixed?
2. Which deployment files, if any, may be modified?
3. What is the final production enablement source of truth?
4. Can production enablement be set outside CI?
5. What happens if CI gate is missing?
6. What happens if manual approval is missing?
7. What happens if Terraform/KMS assumption is unavailable?
8. What happens if production flag is accidentally enabled?
9. How does emergency disable override production enablement?
10. Is kill switch reset implemented in this phase or only specified?
11. If reset is implemented, is it transaction-protected?
12. Does reset require two-person integrity?
13. How is reset audit written?
14. What happens if reset audit write fails?
15. What happens if reset state update succeeds but audit fails?
16. How is reset idempotency handled?
17. How is post-reset monitoring performed?
18. Does Phase 5C include rollback? If not, why?
19. Does Phase 5C include cleanup? If not, why?
20. Does Phase 5C include UI? If not, why?

---

## Recommended Default

Recommended Phase 5C design:
* Keep production disabled-by-default
* No broad production rollout
* Add deployment gate hardening
* Add CI/static/deployment script checks if in repo scope
* Keep Terraform/KMS as documented assumption unless files exist and are in scope
* Add kill switch reset transaction contract
* Require two-person integrity for reset
* Require full reset audit payload
* Block reset on audit failure
* Continue excluding UI
* Continue excluding rollback
* Continue excluding cleanup

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5C Spec
* Grok: GO - Prepare Phase 5C Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Phase 5C Spec.
Spec should define:
* Phase 5C scope decision
* deployment pipeline gate physical enforcement
* CI / workflow / Terraform / KMS boundary
* production enablement source of truth
* manual approval requirement
* deployment gate audit payload
* missing deployment gate behavior
* kill switch reset transaction boundary
* kill switch reset audit atomicity
* TPI reset flow
* reset failure consistency
* reset idempotency
* emergency disable interaction
* monitoring strategy
* rollback boundary
* cleanup boundary
* UI boundary
* Claude implementation scope

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
