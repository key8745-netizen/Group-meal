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
* Feature 009 Phase 5B Implementation: PASSED
* Feature 009 Phase 5B Post-Monitoring: PASSED
* Feature 009 Phase 5C Spec v1.2: PASSED
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C Implementation Commit: `b92f40b`
* Feature 009 Phase 5C Post-Monitoring: PASSED
* Feature 009 Phase 5C Post-Monitoring Commit: `c97494d`
* Feature 009 Phase 5C Post-Monitoring Review: 97/100
* ChatGPT Decision: Begin Feature 009 Phase 5D Planning only; Claude HOLD

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`c97494d`

---

## Phase 5D Goal

Design the next phase for final production rollout readiness.
Phase 5D must not immediately implement broad production rollout.
Phase 5D must define a conservative, auditable, staged path from the existing production-gated foundation toward real production readiness.

Phase 5D Planning must focus on:
1. Real CI deployment pipeline end-to-end verification
2. Deployment gate atomicity under network / partial failure
3. Observation mode high-concurrency validation
4. Final production rollout acceptance criteria
5. Production rollout kill criteria
6. Monitoring and alerting requirements
7. Explicit decision on whether Phase 5D remains staging-only, canary-only, or production-readiness-only

Claude must remain HOLD until Gemini Spec passes Grok review and ChatGPT / ibi explicitly approve implementation.

---

## Phase 5D Priority Risks

Grok identified two medium risks that must be carried into Phase 5D Planning:

### 1. Deployment Gate Atomicity in Real CI Pipeline
Phase 5D Spec must define:
* real CI workflow verification strategy
* token injection lifecycle under network failure
* Firestore deployment_gate lifecycle under partial failure
* behavior when token is injected but gate update fails
* behavior when gate is updated but token is invalid
* behavior when CI job is interrupted mid-flow
* behavior when manual approval is granted but deploy fails
* behavior when deployment token expires mid-flow
* audit payload for every blocked / failed deployment-gate path
* whether real workflow testing is in scope
* whether CI / workflow files may be modified
* whether Terraform / KMS assumptions remain external

### 2. Observation Mode High-Concurrency Flag Consistency
Phase 5D Spec must define:
* high-concurrency observation mode test strategy
* flag setting / reading race behavior
* optimistic locking or versioning strategy
* stale observation flag behavior
* malformed observation flag behavior
* missing observation flag behavior
* observation mode monitoring payload requirements
* observation mode expiry enforcement
* interaction with emergency disable
* interaction with production enablement
* load test or concurrency simulation acceptance criteria

---

## Allowed in this phase

* Phase 5D requirements discussion
* Gemini produces Phase 5D Spec
* Grok reviews Phase 5D Spec
* Define real CI pipeline verification strategy
* Define deployment gate E2E acceptance criteria
* Define observation mode high-concurrency acceptance criteria
* Define production readiness gate
* Define production rollout kill criteria
* Define canary / staging / production-readiness boundary
* Define monitoring and alerting strategy
* Define Claude Phase 5D implementation scope
* Define exact allowed files
* Define exact forbidden files
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not start Phase 5D implementation
* Do not allow broad production rollout
* Do not enable production write path
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
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A / 5B / 5C behavior before Spec approval

---

## Required Phase 5D Spec Topics

Gemini must explicitly define:

### 1. Phase 5D Scope Decision
* staging-only
* canary-only
* production-readiness-only
* production-gated limited rollout
* no production rollout

Gemini must choose one and justify it.

### 2. Real CI Deployment Pipeline Verification
* workflow file scope
* manual approval validation
* token injection lifecycle
* deployment_gate lifecycle
* network failure handling
* partial failure handling
* interrupted job behavior
* retry behavior
* stale token behavior
* token invalidation behavior
* deployment gate audit payload
* blocked deployment event payload
* recovery path

### 3. Deployment Gate Atomicity Acceptance Criteria
* token injected but gate missing
* gate updated but token invalid
* token expires mid-flow
* CI job crashes after token injection
* CI job crashes after gate update
* manual approval missing
* manual approval stale
* wrong project ID
* wrong environment
* local bypass
* CI bypass
* all must BLOCK or fail closed

### 4. Observation Mode High-Concurrency Acceptance Criteria
* concurrent reset attempts
* concurrent apply attempts during observation mode
* concurrent emergency disable during observation mode
* stale observation mode flag
* malformed observation mode flag
* missing observation mode flag
* expired observation mode flag
* race between observation expiry and apply attempt
* monitoring payload completeness
* no bypass on any observation mode failure

### 5. Production Readiness / Rollout Boundary
* whether any real production rollout is allowed
* whether only staging/canary is allowed
* whether broad rollout is still forbidden
* exact rollout approval requirements
* exact kill criteria
* exact rollback exclusion or inclusion
* exact cleanup exclusion or inclusion
* exact UI exclusion or inclusion

### 6. Monitoring and Alerting
* metrics
* alert thresholds
* SOC webhook assumptions
* failure event payload
* audit event payload
* observation mode alerting
* deployment gate alerting
* emergency disable alerting

### 7. Claude Phase 5D Implementation Scope
* exact allowed files
* exact forbidden files
* whether CI workflow files are allowed
* whether test files are allowed
* whether docs only
* whether production code can be touched
* whether Firestore emulator tests are required
* whether real production writes remain forbidden

---

## Required Phase 5D Risk Questions

Gemini must explicitly answer:
1. Is Phase 5D staging-only, canary-only, production-readiness-only, or limited production-gated rollout?
2. Is any real production write allowed?
3. If real production write is allowed, what exact tenant/operator/approval/canary gates are mandatory?
4. If real production write is not allowed, what is Phase 5D validating?
5. Can broad production rollout occur? If not, where is it blocked?
6. How is CI token injection verified end-to-end?
7. What happens if CI fails after token injection?
8. What happens if CI fails after deployment_gate update?
9. What happens if token expires mid-flow?
10. What happens if Firestore deployment_gate is stale?
11. How is manual approval verified?
12. How is manual approval audited?
13. How is observation mode tested under concurrency?
14. What happens if observation mode flag is missing?
15. What happens if observation mode flag is malformed?
16. What happens if observation mode expires during apply?
17. What happens if emergency disable fires during observation mode?
18. What alerts fire on deployment gate failure?
19. What alerts fire on observation mode failure?
20. Does Phase 5D include rollback? If not, why?
21. Does Phase 5D include cleanup? If not, why?
22. Does Phase 5D include UI? If not, why?
23. What is the exit criterion for Phase 5D?
24. What is the blocker criterion for Phase 5D?

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5D Spec
* Grok: GO - Prepare Phase 5D Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Phase 5D Spec.
Spec should define:
* Phase 5D scope decision
* deployment gate E2E verification strategy
* CI token injection lifecycle tests
* deployment_gate lifecycle tests
* network / partial failure behavior
* observation mode high-concurrency strategy
* production readiness boundary
* rollout kill criteria
* monitoring and alerting strategy
* rollback boundary
* cleanup boundary
* UI boundary
* Claude implementation scope
* Grok red team checklist

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
