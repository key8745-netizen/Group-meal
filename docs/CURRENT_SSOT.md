# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Phase 5E Monitoring: Feature 009 Limited Staging-only Canary / Dry-run Readiness

---

## Current Phase

Phase 5E Post-Implementation Monitoring / Readiness Verification

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
* Feature 009 Phase 5D Post-Monitoring: PASSED
* Feature 009 Phase 5E Spec v1.3 Final: PASSED
* Feature 009 Phase 5E Implementation: PASSED
* Feature 009 Phase 5E Implementation Commit: `784fd01b73cf55c3d4ecfbcb052ce2b93870c123`
* Feature 009 Phase 5E Grok Code Review: PASS
* ChatGPT Decision: Phase 5E Implementation PASSED; begin Phase 5E Post-Implementation Monitoring / Readiness Verification

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`784fd01b73cf55c3d4ecfbcb052ce2b93870c123`

---

## Phase 5E Status

Phase 5E has successfully implemented Limited Staging-only Canary / Dry-run Enabled readiness.
Confirmed by Grok Code Review:
* Limited Staging-only Canary / Dry-run Enabled boundary maintained
* Zero Real Write maintained
* no production canary write path
* no broad rollout path
* no UI / rollback / cleanup
* `IS_PRODUCTION_READINESS_ONLY` or equivalent guard maintained
* `FATAL_SAFETY_VIOLATION` or equivalent hard block exists
* dry-run audit difference logging implemented
* real CI E2E partial failure modeled / tested
* token injection failure BLOCKED
* deployment_gate update failure BLOCKED
* orphaned token SELF_INVALIDATE maintained
* manual approval revalidation exists
* observation mode high-load concurrency covered
* HALT recovery version alignment implemented / modeled
* emergency disable remains highest priority
* feature flag isolation exists
* tests / typecheck / build / static guard pass

---

## Allowed in this phase

* Phase 5E post-implementation monitoring
* Re-run tests
* Re-run typecheck
* Re-run build
* Re-run static guard
* Verify Zero Real Write boundary
* Verify staging-only dry-run boundary
* Verify no production canary write
* Verify no broad rollout
* Verify dry-run audit difference logging
* Verify feature flag isolation
* Verify `FATAL_SAFETY_VIOLATION` or equivalent hard block
* Verify real CI E2E partial failure modeling
* Verify token injection failure behavior
* Verify deployment_gate update failure behavior
* Verify orphaned token SELF_INVALIDATE
* Verify manual approval revalidation
* Verify observation mode high-load concurrency
* Verify HALT recovery version alignment
* Verify emergency disable priority
* Verify static guard remains 0 violations
* Verify 30min zero WARN/FATAL monitoring target if modeled
* Documentation updates
* Monitoring report
* SSOT update

---

## Forbidden in this phase

* Do not start any next implementation phase
* Do not begin Phase 5F planning until monitoring passes and ChatGPT / ibi explicitly approve it
* Do not allow real production write
* Do not allow production canary write
* Do not allow broad production rollout
* Do not enable real canary rollout in production
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
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D behavior except through monitoring documentation

---

## Required Monitoring Checks

### 1. Zero Real Write / Canary Boundary
Monitoring must verify:
* production write attempt remains BLOCKED
* production canary write attempt remains BLOCKED
* broad rollout attempt remains BLOCKED
* canary without dry-run remains BLOCKED
* staging-only dry-run remains allowed
* `FATAL_SAFETY_VIOLATION` or equivalent hard block remains active
* static guard catches forbidden write / rollout patterns
* `IS_PRODUCTION_READINESS_ONLY` or equivalent guard remains active
* `canary_feature_flag_gate` or equivalent feature flag isolation remains active

### 2. Real CI E2E / Partial Failure
Monitoring must verify:
* token injection failure remains BLOCKED
* deployment_gate update failure remains BLOCKED
* network interruption after token injection remains BLOCKED
* network interruption after deployment_gate update remains BLOCKED
* orphaned token remains detected
* orphaned token SELF_INVALIDATE remains effective
* retry requires manual approval revalidation
* failed deployment audit payload remains complete
* no production DB touched
* no automatic retry after failed CI path

### 3. Observation Mode High-load / HALT Recovery
Monitoring must verify:
* high-load concurrency simulation remains stable
* concurrency threshold exceeded triggers HALT or safe blocked state
* HALT recovery requires version alignment
* GATE_RESET after HALT requires version alignment check
* concurrent reset + apply remains BLOCKED / safe
* concurrent emergency disable + observation mode remains BLOCKED / safe
* concurrent observation expiry + apply remains BLOCKED / safe
* stale / missing / malformed / expired flag remains default-deny
* emergency disable remains highest priority
* observation mode does not enable production write

### 4. Audit / Monitoring / Alerting
Monitoring must verify:
* SOC / monitoring payload remains complete
* dry-run audit payload remains complete
* HALT event payload remains complete
* recovery payload remains complete
* audit difference payload remains complete
* Expected vs Actual difference logging remains complete
* tenant block on dry-run audit difference > 0 remains modeled / tested
* 30min zero WARN/FATAL monitoring target is verified or limitation documented

### 5. Boundary
Monitoring must verify:
* no UI
* no rollback
* no cleanup
* no Netlify Function
* no Cloud Function
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

## Known Monitoring Focus

Grok identified only low-risk known limitations:
* `<50ms HALT` and `500 req/s` are contract-level modeled in this phase
* future production-stage runtime load testing would require a new Spec
* dry-run audit difference threshold is intentionally strict in Phase 5E

These do not block monitoring but must be documented.

---

## Team State

* Claude: HOLD / Phase 5E post-monitoring support only
* Gemini: HOLD
* Grok: GO - Prepare Phase 5E Post-Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5E Post-Monitoring report:
1. observation window
2. branch
3. commit hash
4. tests result
5. typecheck result
6. build result
7. static guard result
8. zero real write confirmation
9. staging-only dry-run confirmation
10. no production canary write confirmation
11. no broad rollout confirmation
12. dry-run audit difference logging monitoring confirmation
13. feature flag isolation monitoring confirmation
14. real CI E2E partial failure monitoring confirmation
15. orphaned token SELF_INVALIDATE monitoring confirmation
16. manual approval revalidation monitoring confirmation
17. observation mode high-load simulation confirmation
18. HALT recovery version alignment confirmation
19. emergency disable priority confirmation
20. 30min zero WARN/FATAL target confirmation or limitation
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
