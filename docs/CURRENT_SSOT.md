# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Phase 5B Monitoring: Feature 009 Production-Gated Rollout Foundation

---

## Current Phase

Post-Phase 5B Monitoring / Phase 5C Planning Pending

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
* Feature 009 Phase 5B Grok Code Review: 96/100
* ChatGPT Decision: Feature 009 Phase 5B PASSED; begin Post-Phase 5B Monitoring before Phase 5C Planning

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`b16eeda`

---

## Feature 009 Phase 5B Status

Feature 009 Phase 5B has successfully implemented the production-gated rollout foundation.
Production remains disabled-by-default.
Broad production rollout remains forbidden.
Production execution requires all gates:
* production gate config
* deployment gate
* kill switch OFF
* tenant allowlist
* operator allowlist
* operator confirmation
* dry-run-to-real comparison
* verified human caller
* persisted approval
* AI / Service Account / Admin SDK hard-block

---

## Allowed in this phase

* Post-Phase 5B monitoring
* Re-run tests
* Re-run typecheck / build
* Re-run static guard
* Verify production disabled-by-default
* Verify missing gate config BLOCKED
* Verify missing deployment gate BLOCKED
* Verify kill switch ON BLOCKED
* Verify kill switch reset audit payload
* Verify emergency disable contract
* Verify tenant allowlist enforcement
* Verify operator allowlist enforcement
* Verify operator confirmation enforcement
* Verify dry-run-to-real comparison
* Verify no broad production rollout
* Verify no UI
* Verify no rollback
* Verify no cleanup
* Documentation updates
* SSOT update
* Risk register update

---

## Forbidden in this phase

* Do not start Phase 5C implementation
* Do not allow broad production rollout
* Do not allow production write without explicit gate
* Do not allow production write without tenant allowlist
* Do not allow production write without operator allowlist
* Do not allow production write without operator confirmation
* Do not allow production write when kill switch is ON
* Do not allow production write when gate config is missing
* Do not allow production write when deployment gate is missing
* Do not allow production write in unknown environment
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

---

## Required Monitoring Checks

Post-Phase 5B Monitoring must confirm:
* production disabled-by-default remains intact
* missing gate config remains BLOCKED
* missing deployment gate remains BLOCKED
* kill switch ON remains BLOCKED
* kill switch missing remains BLOCKED
* kill switch reset audit remains complete
* kill switch reset failure does not leave inconsistent state
* emergency disable remains modeled
* emergency disabled state blocks future apply
* tenant allowlist remains mandatory
* operator allowlist remains mandatory
* operator confirmation remains mandatory
* dry-run-to-real comparison remains complete
* AI caller remains BLOCKED
* Service Account / Admin SDK bypass remains BLOCKED
* no broad production rollout exists
* no UI exists
* no rollback exists
* no cleanup exists
* tests pass
* typecheck pass
* build pass
* static guard passes

---

## Priority Monitoring Risks

Grok identified two medium risks to monitor:

### 1. Kill Switch Reset Transaction Protection

Monitoring should verify:
* reset audit event is complete
* reset cannot be performed with missing requestedBy
* reset cannot be performed with missing approvedBy
* reset cannot be performed with same requestedBy and approvedBy if TPI is required
* reset cannot be performed with missing reason
* reset cannot be performed with previousState / nextState mismatch
* reset failure does not leave inconsistent state
* reset flow is transaction-protected if implemented

### 2. Deployment Pipeline Gate CI / Terraform Enforcement

Monitoring should verify:
* deployment gate is not only app-level
* CI / deployment script includes hard-block logic
* manual approval step is documented if production enablement is ever attempted
* missing CI deployment gate blocks production-gated execution
* KMS / Terraform / CI gate assumptions are documented
* broad production rollout remains forbidden

---

## Team State

* Claude: HOLD / post-Phase 5B monitoring support only
* Gemini: HOLD / Phase 5C planning later
* Grok: GO - Prepare Post-Phase 5B Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5B Post-Monitoring report:
* observation window
* branch name
* commit hash
* tests result
* typecheck result
* build result
* static guard result
* production disabled-by-default confirmation
* missing gate config BLOCKED confirmation
* missing deployment gate BLOCKED confirmation
* kill switch ON BLOCKED confirmation
* kill switch reset audit confirmation
* kill switch reset failure consistency confirmation
* emergency disable confirmation
* tenant allowlist confirmation
* operator allowlist confirmation
* operator confirmation confirmation
* dry-run-to-real comparison confirmation
* no broad production rollout confirmation
* no UI confirmation
* no rollback confirmation
* no cleanup confirmation
* deployment gate / CI enforcement notes
* known limitations
* final recommendation: MONITORING_OK / NEEDS_PATCH / BLOCKED

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
