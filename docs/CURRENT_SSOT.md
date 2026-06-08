# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5C: Deployment Gate Hardening + Kill Switch Reset Transaction Protection

---

## Current Phase

Phase 5C Implementation — Deployment Pipeline Hardening & TPI Reset Transaction

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
* Feature 009 Phase 5C Spec v1.2 Grok Review: 96/100
* ChatGPT Decision: Claude GO - Feature 009 Phase 5C Implementation only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`f5f7343`

---

## Phase 5C Goal

Implement deployment gate hardening and kill switch reset transaction protection.
Phase 5C must harden the final two production-gate layers:
1. Deployment Pipeline Gate physical enforcement
2. Kill Switch Reset end-to-end transaction protection

Phase 5C must remain strictly staging-first and production-disabled-by-default.
Broad production rollout remains forbidden.

---

## Phase 5C Required Priority Fixes

Grok identified two medium risks that must be handled during implementation:

### 1. Deployment Gate Atomicity in Real CI Pipeline
Claude must ensure:
* CI token injection and Firestore deployment gate lifecycle are consistently modeled.
* Missing deployment token must hard-block.
* Stale deployment token must hard-block.
* Malformed deployment token must hard-block.
* Invalid HMAC must hard-block.
* KMS mismatch must hard-block.
* Local bypass must hard-block.
* CI bypass must hard-block.
* Token injected but Firestore gate missing must hard-block.
* Firestore gate updated but token invalid must hard-block.
* Network / partial failure scenarios must be modeled.
* Development fallback must never create a production write path.
* Deployment gate failure must be auditable.

### 2. Observation Mode High-Concurrency and Flag Consistency
Claude must ensure:
* Post-reset observation mode cannot become a bypass channel.
* Observation mode flag failure must default-deny.
* Observation mode malformed state must default-deny.
* Observation mode missing state must block if required.
* Observation mode must not enable production writes by itself.
* Observation mode must produce monitoring payload.
* Observation mode expiry must be explicit.
* Observation mode must not override emergency disable.
* High-concurrency observation-mode edge cases must be tested or modeled.
* Negative tests must cover observation mode failure cases.

---

## Allowed in this phase

* Deployment gate validator
* Deployment token HMAC / KMS contract
* SecurityCoordinator contract
* CI token injection lifecycle model
* Firestore deployment_gate lifecycle contract
* CI security-check script
* Workflow YAML example or hardening file if explicitly scoped
* Manual approval integration contract
* Deployment gate audit payload
* Local bypass hard-block
* CI bypass hard-block
* Missing / stale / malformed deployment token blocking logic
* Invalid HMAC / KMS mismatch blocking logic
* Kill switch reset service
* Kill switch reset transaction contract
* Kill switch reset audit payload
* Two-person integrity reset validation
* requestedBy / approvedBy mismatch enforcement
* reset idempotency via auditTrailId
* previousState / nextState validation
* reset failure consistency modeling
* post-reset observation mode
* observation mode monitoring payload
* observation mode negative tests
* emergency disable override
* static guards
* docs
* tests
* SSOT update

---

## Forbidden in this phase

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

## Required Guard Rails

* Production remains disabled-by-default.
* Broad production rollout remains forbidden.
* Unknown environment must default-deny.
* Missing deployment gate must BLOCK.
* Missing deployment token must BLOCK.
* Stale deployment token must BLOCK.
* Malformed deployment token must BLOCK.
* Invalid deployment token must BLOCK.
* Invalid HMAC must BLOCK.
* KMS mismatch must BLOCK.
* Local bypass must BLOCK.
* CI bypass must BLOCK.
* Emergency disable must override production enablement.
* Emergency disable must override kill switch reset.
* Kill switch reset must be transaction-protected if implemented.
* Kill switch reset audit must be atomic with reset state transition.
* Kill switch reset must require two-person integrity.
* `requestedBy !== approvedBy` must be enforced.
* Reset reason must be mandatory.
* previousState / nextState must be mandatory.
* reset auditTrailId must be mandatory.
* reset idempotency must be modeled.
* reset failure must not leave inconsistent state.
* observation mode must not create a write bypass.
* observation mode failure must default-deny.
* observation mode must not override emergency disable.
* AI cannot apply config.
* AI cannot reset kill switch.
* AI cannot approve reset.
* AI cannot modify production gate.
* Service Account / Admin SDK must not imply business permission.
* UI remains excluded.
* Rollback remains excluded.
* Cleanup remains excluded.

---

## Required Tests

Phase 5C must include tests for:

### Deployment Pipeline Gate
* valid deployment token passes only with all other gates
* missing deployment token BLOCKED
* stale deployment token BLOCKED
* malformed deployment token BLOCKED
* invalid HMAC BLOCKED
* KMS mismatch BLOCKED
* wrong project ID BLOCKED
* wrong environment BLOCKED
* local bypass BLOCKED
* CI bypass BLOCKED
* token injected but Firestore gate missing BLOCKED
* Firestore gate updated but token invalid BLOCKED
* token injected but gate update failed BLOCKED / token invalidated
* missing deployment gate BLOCKED
* deployment gate audit payload complete
* deployment gate blocked event payload complete

### Kill Switch Reset Transaction Protection
* valid reset with TPI passes
* requestedBy === approvedBy BLOCKED
* missing requestedBy BLOCKED
* missing approvedBy BLOCKED
* missing reason BLOCKED
* missing previousState BLOCKED
* missing nextState BLOCKED
* previousState mismatch BLOCKED
* nextState mismatch BLOCKED
* missing auditTrailId BLOCKED
* duplicate reset idempotency modeled
* reset audit failure blocks state transition
* reset state failure blocks audit completion
* reset failure leaves no inconsistent state
* reset transaction read set modeled
* reset transaction write set modeled

### Observation Mode
* post-reset observation mode created
* observation mode has explicit expiry
* observation mode payload complete
* observation mode missing state BLOCKED if required
* observation mode malformed state BLOCKED
* observation mode failure default-deny
* observation mode high-concurrency behavior modeled or tested
* observation mode does not override emergency disable
* observation mode does not enable production write by itself

### Emergency Disable
* emergency disable overrides production enablement
* emergency disable overrides reset
* emergency disable clears / supersedes observation mode
* emergency disable blocks future apply
* emergency disable audit payload complete

### Boundary
* no broad production rollout
* no UI
* no Netlify Function
* no Cloud Function
* no rollback
* no cleanup
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

## Team State

* Claude: GO - Feature 009 Phase 5C Implementation only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5C Code Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5C implementation report:
* branch name
* commit hash
* changed files
* tests result
* typecheck result
* build result
* static guard result
* deployment gate hard-block confirmation
* deployment token HMAC / KMS contract confirmation
* SecurityCoordinator contract confirmation
* CI token injection lifecycle confirmation
* CI / workflow security-check confirmation
* local bypass hard-block confirmation
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
