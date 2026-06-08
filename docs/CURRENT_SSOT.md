# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5D: Final Production Rollout Readiness Planning

---

## Current Phase

Phase 5D Implementation — Production Readiness Validation (Staging / Readiness-only)

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
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C Post-Monitoring: PASSED
* Feature 009 Phase 5D Spec v1.1: PASSED
* Feature 009 Phase 5D Spec v1.1 Grok Review: 95/100
* ChatGPT Decision: Claude GO - Feature 009 Phase 5D Implementation only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`c97494d`

---

## Phase 5D Goal

Implement final production rollout readiness validation.
Phase 5D is strictly **production-readiness-only**.
Phase 5D must validate the final production rollout safety path without enabling real production writes.

Phase 5D must focus on:
1. Deployment Gate Atomicity in Real CI Pipeline
2. Observation Mode High-Concurrency Flag Consistency
3. Final production rollout readiness validation
4. Readiness checklist and blocker criteria
5. Monitoring and alerting contracts

---

## Phase 5D Priority Risks

Grok identified two medium risks that must be handled during implementation:

### 1. Deployment Gate Partial Failure / Orphaned Token Recovery
Claude must implement or model:
* interrupted CI job handling
* orphaned token detection
* orphaned token SELF_INVALIDATE behavior
* token injected but deployment_gate update failed
* deployment_gate updated but token invalid
* token expires mid-flow
* manual approval granted but deployment fails
* deployment job interrupted after token injection
* deployment job interrupted after gate update
* deployment aborted audit payload
* partial failure must fail closed
* no automatic retry without fresh manual approval
* no production write path introduced

### 2. Observation Mode High-Concurrency / Race Condition Validation
Claude must implement or model:
* observation mode optimistic locking
* observation mode version tracking
* concurrent reset + apply behavior
* concurrent emergency disable + observation mode behavior
* stale observation flag behavior
* missing observation flag behavior
* malformed observation flag behavior
* expired observation flag behavior
* race between observation expiry and apply attempt
* `CONCURRENCY_VIOLATION` / `CONCURRENCY_VIOLATION_ERR` behavior
* fallback to `HALT`
* monitoring payload for race / concurrency failure
* acceptance criteria for load / concurrency simulation

---

## Allowed in this phase

* `src/services/concurrencyManager.ts`
* `src/services/securityAudit.ts`
* `tests/integration/gate-e2e.test.ts`
* `docs/PROD_ROLLOUT_CHECKLIST.md`
* Deployment gate readiness validation contracts
* CI token lifecycle simulation
* Deployment gate partial failure simulation
* Orphaned token recovery modeling
* SELF_INVALIDATE modeling
* Observation mode concurrency manager
* Observation mode load / race simulation
* Security audit payload helpers
* Monitoring payload helpers
* Production readiness checklist
* Static guards
* Tests
* Docs
* SSOT update

---

## Forbidden in this phase

* Do not allow real production write
* Do not allow broad production rollout
* Do not enable canary rollout
* Do not enable production rollout
* Do not modify production deployment workflow unless explicitly scoped and still readiness-only
* Do not bypass deployment gate
* Do not bypass tenant allowlist
* Do not bypass operator allowlist
* Do not bypass operator confirmation
* Do not bypass kill switch
* Do not bypass emergency disable
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
* Do not allow AI to reset kill switch
* Do not allow AI to approve reset
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
* Do not modify Feature 009 Phase 5A / 5B / 5C behavior except through clearly isolated readiness validation contracts

---

## Required Guard Rails

* Production-readiness-only remains mandatory.
* Real production write remains forbidden.
* Broad rollout remains forbidden.
* Unknown environment must default-deny.
* Any deployment gate failure must fail closed.
* Any token lifecycle failure must fail closed.
* Orphaned token must not remain usable.
* CI retry must require fresh manual approval if scoped.
* SELF_INVALIDATE must be auditable.
* Deployment aborted event must be auditable.
* Observation mode missing state must default-deny.
* Observation mode malformed state must default-deny.
* Observation mode expired state must default-deny if apply depends on it.
* Observation mode concurrency violation must enter HALT or safe blocked state.
* Emergency disable must override observation mode.
* Emergency disable must override production enablement.
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

Phase 5D must include tests for:

### Deployment Gate / CI Atomicity
* CI interrupted before token injection
* CI interrupted after token injection
* CI interrupted after deployment_gate update
* orphaned token detected
* orphaned token SELF_INVALIDATE modeled
* token injected but gate update failed BLOCKED
* gate updated but token invalid BLOCKED
* token expires mid-flow BLOCKED
* manual approval granted but deploy fails BLOCKED / ABORTED
* retry without fresh manual approval BLOCKED if scoped
* `DEPLOYMENT_ABORTED` audit payload complete
* `GATE_AUTO_INVALIDATE` audit payload complete
* `SELF_INVALIDATE` audit payload complete
* partial failure fails closed
* no production write path introduced

### Observation Mode High-Concurrency
* concurrent reset + apply attempt
* concurrent emergency disable + observation mode
* concurrent observation expiry + apply attempt
* stale observation flag BLOCKED
* missing observation flag BLOCKED
* malformed observation flag BLOCKED
* expired observation flag BLOCKED where required
* version conflict triggers `CONCURRENCY_VIOLATION` / `CONCURRENCY_VIOLATION_ERR`
* concurrency violation enters HALT or safe blocked state
* monitoring payload complete for concurrency failure
* observation mode does not override emergency disable
* observation mode does not enable production write by itself

### Production Readiness Boundary
* real production write remains forbidden
* broad rollout remains forbidden
* canary rollout remains forbidden unless explicitly excluded as future work
* UI remains absent
* rollback remains absent
* cleanup remains absent
* AI cannot apply
* AI cannot reset
* AI cannot approve reset
* AI cannot modify production gate
* Service Account / Admin SDK cannot bypass
* tests pass
* typecheck pass
* build pass
* static guard pass

---

## Exit Criteria

Phase 5D may pass only if:
* all tests pass
* typecheck passes
* build passes
* static guard passes
* production-readiness-only boundary remains intact
* no real production write path is introduced
* no broad rollout path is introduced
* deployment gate partial failure cases fail closed
* orphaned token recovery is modeled
* observation mode concurrency behavior is modeled or tested
* emergency disable remains highest priority
* PROD_ROLLOUT_CHECKLIST is updated
* known limitations are documented

---

## Blocker Criteria

Phase 5D must be blocked if:
* any real production write path is introduced
* any broad rollout path is introduced
* deployment gate failure can fail open
* orphaned token can remain usable
* observation mode can enable production write
* observation mode can override emergency disable
* AI can apply / reset / approve reset / modify gate
* Service Account / Admin SDK can bypass business guard
* UI / rollback / cleanup is introduced without explicit approved scope
* tests fail
* typecheck fails
* build fails
* static guard fails

---

## Team State

* Claude: GO - Feature 009 Phase 5D Implementation only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5D Code Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5D implementation report:
* branch name
* commit hash
* changed files
* tests result
* typecheck result
* build result
* static guard result
* production-readiness-only confirmation
* no real production write confirmation
* deployment gate partial failure tests confirmation
* orphaned token recovery confirmation
* SELF_INVALIDATE confirmation
* DEPLOYMENT_ABORTED audit confirmation
* observation mode concurrency confirmation
* observation mode load / race simulation confirmation
* emergency disable override confirmation
* PROD_ROLLOUT_CHECKLIST update confirmation
* no broad rollout confirmation
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
