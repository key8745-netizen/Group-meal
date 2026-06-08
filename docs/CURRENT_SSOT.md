# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Phase 5C Monitoring: Feature 009 Deployment Gate Hardening + Kill Switch Reset Transaction Protection

---

## Current Phase

Post-Phase 5C Monitoring / Phase 5D Planning Pending

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
* Feature 009 Phase 5B Implementation: PASSED
* Feature 009 Phase 5B Post-Monitoring: PASSED
* Feature 009 Phase 5C Spec v1.2: PASSED
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C SSOT Commit: `67e362d`
* Feature 009 Phase 5C Implementation Commit: `b92f40b`
* Feature 009 Phase 5C Grok Code Review: 96/100
* ChatGPT Decision: Feature 009 Phase 5C PASSED; begin Post-Phase 5C Monitoring before Phase 5D Planning

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`b92f40b`

---

## Feature 009 Phase 5C Status

Feature 009 Phase 5C has successfully implemented:
1. Deployment Gate Hardening
2. Kill Switch Reset Transaction Protection
3. SecurityCoordinator contract
4. Deployment token HMAC / KMS contract
5. CI token injection lifecycle model
6. Kill switch reset transaction contract
7. Two-person integrity reset validation
8. Observation mode boundary
9. Emergency disable override

Production remains disabled-by-default.
Broad production rollout remains forbidden.
UI, rollback, and cleanup remain excluded.
AI cannot apply config, reset kill switch, approve reset, or modify deployment gate.

---

## Allowed in this phase

* Post-Phase 5C monitoring
* Re-run tests
* Re-run typecheck
* Re-run build
* Re-run static guard
* Verify deployment gate hard-block
* Verify deployment token HMAC / KMS contract
* Verify SecurityCoordinator contract
* Verify CI token injection lifecycle
* Verify deployment gate atomicity edge cases
* Verify token / gate mismatch blocked cases
* Verify kill switch reset transaction protection
* Verify TPI reset validation
* Verify reset audit atomicity
* Verify reset failure consistency
* Verify observation mode expiry
* Verify observation mode monitoring payload
* Verify observation mode failure default-deny
* Verify observation mode high-concurrency behavior
* Verify emergency disable override
* Verify no broad production rollout
* Verify no UI
* Verify no rollback
* Verify no cleanup
* Documentation updates
* Monitoring report
* SSOT update

---

## Forbidden in this phase

* Do not start Phase 5D implementation
* Do not begin Phase 5D planning until monitoring passes
* Do not allow broad production rollout
* Do not allow production write without deployment gate
* Do not allow production write without tenant allowlist
* Do not allow production write without operator allowlist
* Do not allow production write without operator confirmation
* Do not allow production write when kill switch is ON
* Do not allow production write when emergency disable is active
* Do not allow production write when deployment token is missing, stale, invalid, or bypassed
* Do not allow production write in unknown environment
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
* Do not allow AI to reset kill switch
* Do not allow AI to approve kill switch reset
* Do not allow AI to modify production gate
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

Post-Phase 5C Monitoring must confirm:

### Deployment Gate
* deployment gate hard-block remains intact
* missing deployment token remains BLOCKED
* stale deployment token remains BLOCKED
* malformed deployment token remains BLOCKED
* invalid HMAC remains BLOCKED
* KMS mismatch remains BLOCKED
* wrong project ID remains BLOCKED
* wrong environment remains BLOCKED
* local bypass remains BLOCKED
* CI bypass remains BLOCKED
* token injected but Firestore gate missing remains BLOCKED
* Firestore gate updated but token invalid remains BLOCKED
* token injected but gate update failed remains BLOCKED / token invalidated
* deployment gate audit payload remains complete
* deployment gate blocked event payload remains complete

### Kill Switch Reset
* valid reset with TPI remains valid
* requestedBy === approvedBy remains BLOCKED
* missing requestedBy remains BLOCKED
* missing approvedBy remains BLOCKED
* missing reason remains BLOCKED
* missing previousState remains BLOCKED
* missing nextState remains BLOCKED
* previousState mismatch remains BLOCKED
* nextState mismatch remains BLOCKED
* missing auditTrailId remains BLOCKED
* duplicate reset idempotency remains modeled
* reset audit failure blocks state transition
* reset state failure blocks audit completion
* reset failure leaves no inconsistent state
* reset transaction read set remains modeled
* reset transaction write set remains modeled

### Observation Mode
* post-reset observation mode is created correctly
* observation mode has explicit expiry
* observation mode payload remains complete
* observation mode missing state remains BLOCKED if required
* observation mode malformed state remains BLOCKED
* observation mode failure remains default-deny
* observation mode high-concurrency behavior remains modeled or tested
* observation mode does not override emergency disable
* observation mode does not enable production write by itself

### Emergency Disable
* emergency disable overrides production enablement
* emergency disable overrides reset
* emergency disable clears / supersedes observation mode
* emergency disable blocks future apply
* emergency disable audit payload remains complete

### Boundary
* no broad production rollout exists
* no UI exists
* no Netlify Function exists
* no Cloud Function exists
* no rollback exists
* no cleanup exists
* AI cannot apply
* AI cannot reset
* AI cannot approve reset
* AI cannot modify gate
* Service Account / Admin SDK cannot bypass
* tests pass
* typecheck pass
* build pass
* static guard pass

---

## Priority Monitoring Risks

Grok identified two medium risks to monitor:

### 1. Deployment Gate Atomicity in Real CI Pipeline
Monitoring should verify:
* CI token injection lifecycle remains consistent
* Firestore deployment_gate lifecycle remains consistent
* network / partial failure scenarios remain BLOCKED
* token injected but gate missing remains BLOCKED
* gate updated but token invalid remains BLOCKED
* gate update failed invalidates or blocks token
* no development fallback creates a production path
* deployment gate failure remains auditable

### 2. Observation Mode High-Concurrency Flag Consistency
Monitoring should verify:
* observation mode high-concurrency behavior remains safe
* flag setting / reading race conditions do not create bypass
* observation mode missing state default-denies
* observation mode malformed state default-denies
* observation mode failure default-denies
* observation mode monitoring payload remains complete
* observation mode never overrides emergency disable
* observation mode never enables production write by itself

---

## Team State

* Claude: HOLD / post-Phase 5C monitoring support only
* Gemini: HOLD
* Grok: GO - Prepare Post-Phase 5C Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5C Post-Monitoring report:
* observation window
* branch name
* commit hash
* tests result
* typecheck result
* build result
* static guard result
* deployment gate hard-block confirmation
* deployment token HMAC / KMS contract confirmation
* SecurityCoordinator contract confirmation
* CI token injection lifecycle confirmation
* token / gate mismatch negative cases confirmation
* kill switch reset transaction confirmation
* TPI reset confirmation
* reset audit atomicity confirmation
* reset failure consistency confirmation
* observation mode confirmation
* observation mode negative tests confirmation
* observation mode high-concurrency behavior confirmation
* emergency disable override confirmation
* no broad production rollout confirmation
* no UI confirmation
* no rollback confirmation
* no cleanup confirmation
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
