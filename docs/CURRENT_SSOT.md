# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Phase 5D Monitoring: Feature 009 Final Production Rollout Readiness Planning

---

## Current Phase

Post-Phase 5D Monitoring / Phase 5E Planning Pending

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
* Feature 009 Phase 5D Implementation: PASSED
* Feature 009 Phase 5D Implementation Commit: `f589413`
* Feature 009 Phase 5D SSOT Commit: `c6ab2f7`
* Feature 009 Phase 5D Grok Code Review: 96/100
* ChatGPT Decision: Phase 5D PASSED; begin Post-Phase 5D Monitoring before Phase 5E Planning

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`f589413`

---

## Phase 5D Status

Phase 5D has successfully implemented production-readiness validation.
Confirmed:
* production-readiness-only maintained
* no real production write path introduced
* no broad rollout path introduced
* no canary rollout path introduced
* deployment gate partial failure handling implemented / modeled
* orphaned token SELF_INVALIDATE implemented / modeled
* DEPLOYMENT_ABORTED audit payload implemented / modeled
* GATE_AUTO_INVALIDATE audit payload implemented / modeled
* observation mode high-concurrency behavior implemented / modeled
* CONCURRENCY_VIOLATION routes to HALT / safe blocked state
* emergency disable remains highest priority
* PROD_ROLLOUT_CHECKLIST updated
* tests / typecheck / build / static guard pass

---

## Allowed in this phase

* Post-Phase 5D monitoring
* Re-run tests
* Re-run typecheck
* Re-run build
* Re-run static guard
* Verify production-readiness-only boundary
* Verify no real production write path
* Verify no broad rollout path
* Verify no canary rollout path
* Verify deployment gate partial failure recovery
* Verify orphaned token SELF_INVALIDATE
* Verify DEPLOYMENT_ABORTED audit payload
* Verify GATE_AUTO_INVALIDATE audit payload
* Verify SELF_INVALIDATE audit payload
* Verify observation mode high-concurrency behavior
* Verify observation mode stale / missing / malformed / expired flag default-deny
* Verify CONCURRENCY_VIOLATION / CONCURRENCY_VIOLATION_ERR safe fallback
* Verify emergency disable priority
* Verify PROD_ROLLOUT_CHECKLIST
* Documentation updates
* Monitoring report
* SSOT update

---

## Forbidden in this phase

* Do not start Phase 5E implementation
* Do not begin Phase 5E planning until monitoring passes and ChatGPT / ibi explicitly approve it
* Do not allow real production write
* Do not allow broad production rollout
* Do not allow canary rollout
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
* Do not allow AI to reset kill switch
* Do not allow AI to approve reset
* Do not allow AI to modify production gate
* Do not bypass deployment gate
* Do not bypass tenant allowlist
* Do not bypass operator allowlist
* Do not bypass operator confirmation
* Do not bypass kill switch
* Do not bypass emergency disable
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A / 5B / 5C behavior except through monitoring documentation

---

## Required Monitoring Checks

### 1. Deployment Gate Partial Failure / Orphaned Token
Monitoring must verify:
* interrupted CI job remains fail-closed
* orphaned token detection remains effective
* orphaned token SELF_INVALIDATE remains effective
* token injected but deployment_gate update failed remains BLOCKED
* deployment_gate updated but token invalid remains BLOCKED
* token expires mid-flow remains BLOCKED
* manual approval granted but deploy fails remains BLOCKED / ABORTED
* retry without fresh manual approval remains BLOCKED if scoped
* DEPLOYMENT_ABORTED audit payload remains complete
* GATE_AUTO_INVALIDATE audit payload remains complete
* SELF_INVALIDATE audit payload remains complete
* no production write path exists

### 2. Observation Mode High-Concurrency / Race Condition
Monitoring must verify:
* observation mode optimistic locking remains effective
* observation mode version tracking remains effective
* concurrent reset + apply remains BLOCKED / safe
* concurrent emergency disable + observation mode remains safe
* concurrent observation expiry + apply remains safe
* stale observation flag remains BLOCKED
* missing observation flag remains BLOCKED
* malformed observation flag remains BLOCKED
* expired observation flag remains BLOCKED where required
* CONCURRENCY_VIOLATION / CONCURRENCY_VIOLATION_ERR enters HALT / safe blocked state
* observation mode does not override emergency disable
* observation mode does not enable production write by itself
* monitoring payload remains complete

### 3. Boundary
Monitoring must verify:
* no real production write
* no broad rollout
* no canary rollout
* no UI
* no Netlify Function
* no Cloud Function
* no rollback
* no cleanup
* AI cannot apply
* AI cannot reset
* AI cannot approve reset
* AI cannot modify production gate
* Service Account / Admin SDK cannot bypass business guard
* tests pass
* typecheck pass
* build pass
* static guard pass

---

## Priority Monitoring Risks

Grok identified two follow-up items:
1. Deployment Gate partial failure in real CI pipeline network / partial failure end-to-end behavior
2. Observation Mode high-concurrency load / race simulation extreme cases

These are not blockers for Phase 5D, but must be tracked in monitoring.

---

## Team State

* Claude: HOLD / post-Phase 5D monitoring support only
* Gemini: HOLD
* Grok: GO - Prepare Post-Phase 5D Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5D Post-Monitoring report:
1. observation window
2. branch
3. commit hash
4. tests result
5. typecheck result
6. build result
7. static guard result
8. production-readiness-only confirmation
9. no real production write confirmation
10. no broad rollout confirmation
11. no canary rollout confirmation
12. deployment gate partial failure monitoring confirmation
13. orphaned token SELF_INVALIDATE monitoring confirmation
14. DEPLOYMENT_ABORTED audit monitoring confirmation
15. GATE_AUTO_INVALIDATE audit monitoring confirmation
16. SELF_INVALIDATE audit monitoring confirmation
17. observation mode concurrency monitoring confirmation
18. observation mode load / race simulation confirmation
19. emergency disable priority confirmation
20. PROD_ROLLOUT_CHECKLIST confirmation
21. no UI / rollback / cleanup confirmation
22. known limitations
23. final recommendation: MONITORING_OK / NEEDS_PATCH / BLOCKED

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
