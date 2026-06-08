# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5E: Limited Production Readiness / Canary Planning

---

## Current Phase

Phase 5E Implementation — Limited Staging-only Canary / Dry-run Enabled

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
* Feature 009 Phase 5D Post-Monitoring Commit: `5334d15`
* Feature 009 Phase 5E Spec v1.3 Final: PASSED
* Feature 009 Phase 5E Grok Spec Review: PASS
* ChatGPT Decision: Claude GO - Feature 009 Phase 5E Implementation only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`5334d15`

---

## Phase 5E Scope Decision

Phase 5E scope is:
**Limited Staging-only Canary / Dry-run Enabled**

This means:
* staging-only validation is allowed
* dry-run canary simulation is allowed
* limited canary planning is allowed
* real production write is forbidden
* production canary write is forbidden
* broad rollout is forbidden
* UI / rollback / cleanup remain forbidden

---

## Phase 5E Goal

Implement the Phase 5E limited staging-only canary / dry-run enabled readiness layer.
The implementation must validate:
1. real CI pipeline E2E failure behavior in staging / mock mode
2. deployment token injection failure handling
3. deployment_gate update failure handling
4. network interruption after token injection
5. network interruption after deployment_gate update
6. orphaned token workflow behavior
7. SELF_INVALIDATE under workflow-like conditions
8. manual approval revalidation
9. observation mode extreme high-load concurrency
10. HALT recovery version alignment
11. dry-run audit difference logging
12. static guard enforcement for zero real write
13. feature flag isolation for future canary expansion
14. emergency disable priority hook

---

## Mandatory Implementation Conditions

Claude must satisfy these before reporting completion:
1. Static Guard tests must pass before the implementation report is considered valid.
2. Feature Flag isolation must be implemented or explicitly modeled.
3. `IS_PRODUCTION_READINESS_ONLY` or equivalent zero-write guard must remain hard-enforced.
4. Any production write attempt must trigger `FATAL_SAFETY_VIOLATION` or equivalent hard block.
5. Dry-run audit differences must be recorded.
6. HALT recovery must include version alignment check.
7. Emergency Disable must remain the highest-priority hook.
8. Exit criteria must be automatable.

---

## Allowed in this phase

* Limited staging-only canary simulation
* Dry-run enabled canary validation
* CI E2E mock / staging workflow validation
* network / partial failure simulation
* orphaned token workflow validation
* SELF_INVALIDATE workflow validation
* manual approval revalidation modeling
* observation mode high-load concurrency simulation
* HALT recovery version alignment
* dry-run audit difference logging
* feature flag isolation
* emergency disable priority hook
* static guard expansion
* monitoring payload helpers
* tests
* docs
* SSOT update

Allowed files / areas:
* `canaryManager.ts`
* `canaryAudit.ts`
* `integration/canary-e2e.test.ts`
* `src/services/canary_feature_flag.ts`
* narrowly scoped static guard updates if required
* docs
* `docs/CURRENT_SSOT.md`

---

## Forbidden in this phase

* Do not allow real production write
* Do not allow production canary write
* Do not allow broad production rollout
* Do not enable real canary rollout in production
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
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D behavior except through isolated Phase 5E readiness contracts
* Do not modify `src/core/` business logic
* Do not touch production DB

---

## Required Tests

### Zero Real Write / Canary Boundary
* production write attempt BLOCKED
* production canary write attempt BLOCKED
* broad rollout attempt BLOCKED
* canary without dry-run BLOCKED
* staging-only dry-run allowed
* dry-run audit difference recorded
* `FATAL_SAFETY_VIOLATION` or equivalent emitted on write attempt
* static guard catches forbidden write / rollout patterns
* `IS_PRODUCTION_READINESS_ONLY` or equivalent guard verified
* `canary_feature_flag_gate` isolation verified

### Real CI E2E / Partial Failure
* token injection failure BLOCKED
* deployment_gate update failure BLOCKED
* network interruption after token injection BLOCKED
* network interruption after deployment_gate update BLOCKED
* orphaned token detected
* orphaned token SELF_INVALIDATE
* retry requires manual approval revalidation
* failed deployment audit payload complete
* no production DB touched
* no automatic retry after failed CI path

### Observation Mode High-load / HALT Recovery
* 500 req/s or equivalent high-load simulation modeled / tested
* concurrency threshold exceeded triggers HALT
* violation enters HALT within defined acceptance target
* HALT recovery requires version alignment
* GATE_RESET after HALT requires version alignment check
* concurrent reset + apply BLOCKED / safe
* concurrent emergency disable + observation mode BLOCKED / safe
* concurrent observation expiry + apply BLOCKED / safe
* stale / missing / malformed / expired flag default-deny
* emergency disable remains highest priority
* observation mode does not enable production write

### Monitoring / Alerting
* SOC / monitoring payload complete
* dry-run audit payload complete
* HALT event payload complete
* recovery payload complete
* audit difference payload complete
* Expected vs Actual difference logging complete
* tenant block on dry-run audit difference > 0 modeled / tested

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

Phase 5E may pass only if:
* all tests pass
* typecheck passes
* build passes
* static guard passes
* zero real write boundary remains intact
* dry-run enabled canary remains staging-only
* no production canary write path exists
* no broad rollout path exists
* Phase 5D carry-over risks are covered
* CI E2E partial failure is modeled or tested
* observation mode high-load simulation is modeled or tested
* HALT recovery version alignment is implemented or modeled
* dry-run audit difference logging is implemented or modeled
* feature flag isolation is implemented or modeled
* emergency disable priority hook is implemented or modeled
* monitoring payloads are complete
* known limitations are documented

Target exit criteria from Spec v1.3:
* 100% Audit Reconciliation
* `<50ms` HALT response target, or documented safe fallback if only contract-level timing is possible
* ≥95% test coverage target where measurable
* 30 minutes zero WARN/FATAL monitoring target, if simulated or modeled

---

## Blocker Criteria

Phase 5E must be blocked if:
* any real production write path is introduced
* any production canary write path is introduced
* any broad rollout path is introduced
* zero-write guard can be bypassed
* dry-run can mutate production state
* observation mode can enable production write
* emergency disable can be overridden
* HALT recovery can proceed without version alignment
* orphaned token can remain usable
* feature flag isolation fails
* AI can apply / reset / approve reset / modify gate
* Service Account / Admin SDK can bypass business guard
* UI / rollback / cleanup is introduced
* tests fail
* typecheck fails
* build fails
* static guard fails

---

## Team State

* Claude: GO - Feature 009 Phase 5E Implementation only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5E Code Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5E implementation report:
1. branch
2. commit hash
3. changed files
4. tests result
5. typecheck result
6. build result
7. static guard result
8. zero real write confirmation
9. staging-only dry-run confirmation
10. no production canary write confirmation
11. no broad rollout confirmation
12. real CI E2E partial failure confirmation
13. orphaned token SELF_INVALIDATE confirmation
14. manual approval revalidation confirmation
15. observation mode high-load simulation confirmation
16. HALT recovery version alignment confirmation
17. dry-run audit difference logging confirmation
18. feature flag isolation confirmation
19. emergency disable priority confirmation
20. no UI / rollback / cleanup confirmation
21. known limitations
22. final recommendation

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
