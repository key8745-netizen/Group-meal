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

Phase 5F Implementation — Readiness-only / Zero Real Write

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
* Feature 009 Phase 5E Post-Monitoring Commit: `6c9f7c4`
* Feature 009 Phase 5F Spec v1.3: PASSED
* Feature 009 Phase 5F Grok Spec Review: PASS
* ChatGPT Decision: Claude GO - Feature 009 Phase 5F Implementation only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`6c9f7c4`

---

## Phase 5F Scope Decision

Phase 5F scope is: **Readiness Implementation only / Zero Real Write**

This means:
* defensive monitoring and validation logic is allowed
* readiness-only implementation is allowed
* staging / contract-level validation is allowed
* runtime schema hardening is allowed
* tracing / timing sampling is allowed only in isolated readiness paths
* tenant lock may only be modeled as a blocking decision
* audit payload generation is allowed
* real production write is forbidden
* production canary write is forbidden
* broad rollout is forbidden
* production mutation is forbidden
* UI / rollback / cleanup remain forbidden

---

## Phase 5F Goal

Implement the Phase 5F readiness layer for production-gated canary planning.
The implementation must validate or model:

1. HALT runtime timing validation
2. P99 `<50ms` readiness / staging / contract target
3. `Performance_Degradation_Risk` alert behavior
4. high-load concurrency at 500 req/s or equivalent simulation
5. token / flag runtime schema hardening
6. malformed / missing / stale token / flag default-deny
7. dry-run audit difference threshold: `Difference > 0 = Block`
8. emergency disable highest-priority hook
9. feature flag isolation
10. tenant lock as modeled blocking decision only
11. tenant lock non-write behavior
12. SOC / audit payload fields
13. rollout kill criteria
14. rollback / cleanup / UI exclusion
15. static guard enforcement for Zero Real Write

---

## Allowed in this phase

* readiness-only implementation
* defensive monitoring helpers
* validation helpers
* staging / contract-level timing validation
* high-load concurrency simulation
* runtime schema hardening
* token / flag validation
* tenant lock non-write modeling
* audit-only blocking decision modeling
* dry-run audit threshold modeling
* emergency disable priority check
* feature flag isolation
* monitoring / alerting payload helpers
* tests
* static guard updates
* docs
* SSOT update

Allowed files / areas:
* `src/monitoring/tracingInterceptor.ts`
* `src/schema/runtime_validator.ts`
* `src/services/canary_feature_flag.ts`
* `src/services/canaryManager.ts`
* `src/services/canaryAudit.ts`
* `integration/canary-e2e.test.ts`
* narrowly scoped test helpers
* narrowly scoped static guard updates
* docs
* `docs/CURRENT_SSOT.md`

`canaryManager.ts` and `canaryAudit.ts` changes must be additive-only and must not alter Phase 5E behavior.

---

## Forbidden in this phase

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
* Do not implement automated rollback
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
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D / 5E behavior except through isolated Phase 5F readiness contracts

---

## Static Guard Required Patterns

Static guard must block or detect:
* import from `src/core/`
* import from `src/database/`
* import from `src/production/`
* production write APIs
* production `runTransaction` path
* rollback / cleanup patterns
* UI / Netlify / Cloud Function patterns
* production canary execution patterns
* broad rollout patterns
* AI apply / reset / approve reset / modify gate patterns
* Service Account / Admin SDK bypass patterns
* Feature 001–008 modification patterns

---

## SOC / Audit Payload Required Fields

SOC / Audit payloads must include:
* `eventType`
* `tenantId`
* `operatorId`
* `decision`
* `blockedReason`
* `source`
* `occurredAt`
* `traceId`
* `version`
* `expectedState`
* `observedState`

---

## Mandatory Implementation Conditions

Claude must satisfy these before reporting completion:

1. `FATAL_SAFETY_VIOLATION` or equivalent hard block must remain active for any production write attempt.
2. `IS_PRODUCTION_READINESS_ONLY` or equivalent guard must remain hard-enforced.
3. Emergency Disable must be the highest-priority hook.
4. Runtime schema validation must default-deny malformed / missing / stale token or flag.
5. Dry-run audit threshold must remain `Difference > 0 = Block`.
6. Tenant lock must be modeled as blocking decision only.
7. Tenant lock must not write to production DB or production state.
8. TracingInterceptor must not import from or modify `src/core/`.
9. TracingInterceptor must be isolated under `src/monitoring/`.
10. Runtime validator must be isolated under `src/schema/`.
11. Feature flag isolation must prevent leakage into Feature 001–008 / core path.
12. Static guard must block forbidden production write / rollout / UI / rollback / cleanup patterns.
13. Known limitations must be documented.

---

## Required Tests

### Zero Real Write / Production Boundary
* production write attempt BLOCKED
* production canary write attempt BLOCKED
* broad rollout attempt BLOCKED
* production mutation attempt BLOCKED
* real rollout path absent
* `FATAL_SAFETY_VIOLATION` emitted on production write attempt
* `IS_PRODUCTION_READINESS_ONLY` or equivalent guard verified
* static guard catches forbidden production write / rollout patterns

### TracingInterceptor Isolation
* TracingInterceptor isolated under `src/monitoring/`
* TracingInterceptor does not import from `src/core/`
* TracingInterceptor does not import from `src/database/`
* TracingInterceptor does not import from `src/production/`
* TracingInterceptor only samples timing / metadata
* TracingInterceptor does not mutate business flow
* P99 `<50ms` target is modeled / validated / documented
* `Performance_Degradation_Risk` emitted when threshold exceeded

### Runtime Validator / Token / Flag Schema
* valid token / flag accepted only in allowed readiness context
* malformed token BLOCKED
* missing token BLOCKED
* stale token BLOCKED
* malformed flag BLOCKED
* missing flag BLOCKED
* stale flag BLOCKED
* version mismatch BLOCKED
* SOC payload emitted for rejected malformed / stale input

### Tenant Lock Non-write Behavior
* tenant lock modeled as blocking decision only
* ambiguous tenant lock state defaults to BLOCKED / DENY
* tenant lock does not write production DB
* tenant lock does not mutate production state
* audit-only payload emitted
* real tenant lock state mutation absent

### Dry-run Audit Difference Threshold
* difference = 0 allowed in dry-run readiness context
* difference > 0 BLOCKED
* audit payload complete
* threshold configurability absent unless modeled as GitOps + dual-sign
* no production mutation occurs from threshold decision

### Emergency Disable / Feature Flag Isolation
* emergency disable highest priority
* emergency disable cannot be bypassed
* feature flag isolation active
* feature flag cannot override core Feature 001–008 behavior
* feature flag cannot enable production write
* feature flag cannot enable production canary write

### Boundary
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

## Exit Criteria

Phase 5F may pass only if:
* all tests pass
* typecheck passes
* build passes
* static guard passes
* Zero Real Write boundary remains intact
* no production canary write path exists
* no broad rollout path exists
* no production mutation path exists
* TracingInterceptor isolation is verified
* runtime validator default-deny behavior is verified
* tenant lock non-write behavior is verified
* dry-run audit threshold behavior is verified
* emergency disable priority is enforced
* feature flag isolation is enforced
* SOC / audit payload fields are complete
* known limitations are documented

---

## Blocker Criteria

Phase 5F must be blocked if:
* any real production write path is introduced
* any production canary write path is introduced
* any broad rollout path is introduced
* any production mutation path is introduced
* Zero Real Write guard can be bypassed
* Emergency Disable can be bypassed
* token / flag malformed input can pass validation
* stale token / flag can pass validation
* dry-run audit difference > 0 does not block
* tenant lock writes production DB
* tenant lock mutates production state
* feature flag isolation fails
* TracingInterceptor imports from `src/core/`
* TracingInterceptor imports from `src/database/`
* TracingInterceptor imports from `src/production/`
* AI can apply / reset / approve reset / modify gate
* Service Account / Admin SDK can bypass business guard
* UI / rollback / cleanup is introduced
* tests fail
* typecheck fails
* build fails
* static guard fails

---

## Team State

* Claude: GO - Feature 009 Phase 5F Implementation only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5F Code Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5F implementation report:
1. branch
2. commit hash
3. changed files
4. tests result
5. typecheck result
6. build result
7. static guard result
8. Zero Real Write confirmation
9. no production canary write confirmation
10. no broad rollout confirmation
11. no production mutation confirmation
12. TracingInterceptor isolation confirmation
13. runtime validator default-deny confirmation
14. token / flag schema hardening confirmation
15. tenant lock non-write confirmation
16. dry-run audit threshold confirmation
17. emergency disable priority confirmation
18. feature flag isolation confirmation
19. monitoring / alerting payload confirmation
20. no UI / rollback / cleanup confirmation
21. no `src/core/` import / modification confirmation
22. known limitations
23. final recommendation

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
