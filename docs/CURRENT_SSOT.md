# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Phase 5F Monitoring: Feature 009 Production Readiness Next-Step Planning

---

## Current Phase

Phase 5F Post-Implementation Monitoring / Readiness Verification

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
* Feature 009 Phase 5F Spec v1.3: PASSED
* Feature 009 Phase 5F Implementation: PASSED
* Feature 009 Phase 5F Implementation Commit: `54d2d87`
* Feature 009 Phase 5F Grok Code Review: PASS
* ChatGPT Decision: Phase 5F Implementation PASSED; begin Phase 5F Post-Implementation Monitoring / Readiness Verification

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`54d2d87`

---

## Phase 5F Status

Phase 5F has successfully implemented the Readiness-only / Zero Real Write layer.
Confirmed by Grok Code Review:
* Zero Real Write maintained
* Readiness-only boundary maintained
* no production canary write
* no broad rollout
* no production mutation
* no `src/core/`, `src/database/`, or `src/production/` imports
* `FATAL_SAFETY_VIOLATION` / equivalent hard block exists
* `IS_PRODUCTION_READINESS_ONLY` / equivalent guard remains hard-enforced
* TracingInterceptor isolated under `src/monitoring/`
* TracingInterceptor only samples timing / metadata
* runtime validator default-deny behavior implemented
* malformed / missing / stale token / flag BLOCKED
* tenant lock modeled as non-write / audit-only
* ambiguous tenant lock state defaults to BLOCKED / DENY
* dry-run audit difference > 0 BLOCKED
* emergency disable remains highest priority
* feature flag isolation maintained
* SOC / audit payload fields complete
* static guard blocks forbidden patterns
* rollback / cleanup / UI excluded
* tests / typecheck / build / static guard pass

---

## Allowed in this phase

* Phase 5F post-implementation monitoring
* Re-run tests
* Re-run typecheck
* Re-run build
* Re-run static guard
* Verify Zero Real Write boundary
* Verify Readiness-only boundary
* Verify no production canary write
* Verify no broad rollout
* Verify no production mutation
* Verify TracingInterceptor isolation
* Verify runtime validator default-deny behavior
* Verify token / flag schema hardening
* Verify tenant lock non-write / audit-only behavior
* Verify dry-run audit Difference > 0 = Block
* Verify emergency disable highest priority
* Verify feature flag isolation
* Verify SOC / audit payload completeness
* Verify old Phase 5A–5E no regression
* Documentation updates
* Monitoring report
* SSOT update

---

## Forbidden in this phase

* Do not start Phase 5G Planning until monitoring passes and ChatGPT / ibi explicitly approve it
* Do not start any next implementation phase
* Do not allow real production write
* Do not allow production canary write
* Do not allow broad production rollout
* Do not enable real production rollout
* Do not enable real production canary execution
* Do not mutate production tenant lock state
* Do not touch production DB
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
* Do not modify `src/core/`
* Do not import from `src/core/`
* Do not import from `src/database/`
* Do not import from `src/production/`
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D / 5E behavior except through monitoring documentation

---

## Required Monitoring Checks

### 1. Zero Real Write / Production Boundary
Monitoring must verify:
* production write attempt remains BLOCKED
* production canary write attempt remains BLOCKED
* broad rollout attempt remains BLOCKED
* production mutation attempt remains BLOCKED
* real rollout path remains absent
* `FATAL_SAFETY_VIOLATION` or equivalent remains active
* `IS_PRODUCTION_READINESS_ONLY` or equivalent remains active
* static guard continues blocking forbidden production write / rollout patterns

### 2. TracingInterceptor Isolation
Monitoring must verify:
* TracingInterceptor remains isolated under `src/monitoring/`
* no import from `src/core/`
* no import from `src/database/`
* no import from `src/production/`
* no business flow mutation
* timing / metadata sampling only
* `Performance_Degradation_Risk` behavior remains modeled / documented

### 3. Runtime Validator / Token / Flag Schema
Monitoring must verify:
* malformed token remains BLOCKED
* missing token remains BLOCKED
* stale token remains BLOCKED
* malformed flag remains BLOCKED
* missing flag remains BLOCKED
* stale flag remains BLOCKED
* version mismatch remains BLOCKED
* SOC / audit payload emitted for rejected malformed / stale input

### 4. Tenant Lock Non-write Behavior
Monitoring must verify:
* tenant lock remains modeled as blocking decision only
* ambiguous tenant lock state defaults to BLOCKED / DENY
* tenant lock does not write production DB
* tenant lock does not mutate production state
* audit-only payload remains complete
* real tenant lock state mutation remains absent

### 5. Dry-run Audit Difference Threshold
Monitoring must verify:
* difference = 0 allowed only in dry-run readiness context
* difference > 0 remains BLOCKED
* audit payload remains complete
* no production mutation occurs from threshold decision

### 6. Emergency Disable / Feature Flag Isolation
Monitoring must verify:
* emergency disable remains highest priority
* emergency disable cannot be bypassed
* feature flag isolation remains active
* feature flag cannot override core Feature 001–008 behavior
* feature flag cannot enable production write
* feature flag cannot enable production canary write

### 7. Boundary
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
* old Phase 5A–5E regressions remain absent

---

## Known Monitoring Focus

Grok identified only low-risk known limitations:
* P99 `<50ms` in staging remains partly simulation / contract-level
* Tenant Lock remains non-write in Phase 5F, but future production stage must re-validate
* contract-level readiness behavior must not be mistaken for production canary execution

These do not block monitoring but must be documented.

---

## Team State

* Claude: HOLD / Phase 5F post-monitoring support only
* Gemini: HOLD
* Grok: GO - Prepare Phase 5F Post-Monitoring Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5F Post-Monitoring report:
1. observation window
2. branch
3. commit hash
4. tests result
5. typecheck result
6. build result
7. static guard result
8. Zero Real Write confirmation
9. no production canary write confirmation
10. no broad rollout confirmation
11. no production mutation confirmation
12. TracingInterceptor isolation monitoring confirmation
13. runtime validator default-deny monitoring confirmation
14. token / flag schema hardening monitoring confirmation
15. tenant lock non-write monitoring confirmation
16. dry-run audit threshold monitoring confirmation
17. emergency disable priority monitoring confirmation
18. feature flag isolation monitoring confirmation
19. SOC / audit payload monitoring confirmation
20. no UI / rollback / cleanup confirmation
21. no `src/core/`, `src/database/`, `src/production/` import confirmation
22. old Phase 5A–5E regression confirmation
23. known limitations
24. final recommendation: MONITORING_OK / NEEDS_PATCH / BLOCKED

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
