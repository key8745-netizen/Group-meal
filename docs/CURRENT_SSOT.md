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
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C Post-Monitoring: PASSED
* Feature 009 Phase 5D Spec v1.1: PASSED
* Feature 009 Phase 5D Implementation: PASSED
* Feature 009 Phase 5D Implementation Commit: `f589413`
* Feature 009 Phase 5D Post-Monitoring: PASSED
* Feature 009 Phase 5D Post-Monitoring Commit: `5334d15`
* Feature 009 Phase 5D Grok Monitoring Review: 97/100
* ChatGPT Decision: Phase 5D Monitoring PASSED; begin Phase 5E Planning only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`5334d15`

---

## Phase 5E Goal

Plan the next stage after final production-readiness validation.
Phase 5E must define whether the project remains:
1. production-readiness-only,
2. staging-only,
3. limited canary planning only,
4. limited production-gated canary,
5. or no production rollout.

Phase 5E must not begin implementation until Gemini produces a full Spec, Grok reviews it, and ChatGPT / ibi explicitly approve Claude to proceed.

---

## Phase 5E Required Risk Carry-over

Phase 5E Spec must explicitly address the following risks carried over from Phase 5D Monitoring:

### 1. Real CI Pipeline Network / Partial Failure E2E
Spec must define:
* real CI workflow mock or staging workflow validation strategy
* deployment token injection failure behavior
* deployment_gate update failure behavior
* network interruption after token injection
* network interruption after deployment_gate update
* orphaned token detection in workflow-like conditions
* SELF_INVALIDATE behavior in workflow-like conditions
* retry policy after partial deployment failure
* manual approval revalidation
* audit payload for failed deployment path
* whether Terraform / KMS remains operational assumption
* whether workflow YAML can be changed
* whether production DB remains untouched

### 2. Observation Mode Extreme High-Load Concurrency
Spec must define:
* load / race simulation strategy
* concurrency level or simulated request count
* concurrent reset + apply behavior
* concurrent emergency disable + observation mode behavior
* concurrent observation expiry + apply behavior
* stale / missing / malformed / expired flag behavior
* optimistic locking acceptance criteria
* version tracking acceptance criteria
* CONCURRENCY_VIOLATION / CONCURRENCY_VIOLATION_ERR handling
* fallback to HALT / safe blocked state
* monitoring payload completeness
* whether load testing is contract-level, emulator-level, or staging-level

---

## Allowed in this phase

* Gemini produces Phase 5E Spec
* Grok prepares Phase 5E Spec Review
* requirements discussion
* docs / SSOT update
* risk analysis
* acceptance criteria design
* monitoring / alerting design
* rollout boundary design
* canary boundary design
* kill criteria design
* Claude remains HOLD

---

## Forbidden in this phase

* Do not let Claude implement Phase 5E
* Do not enable real production write
* Do not enable broad production rollout
* Do not enable canary rollout unless a future Spec explicitly passes review
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
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D implementation behavior

---

## Required Phase 5E Spec Topics

Gemini must explicitly define:
1. Phase 5E scope decision
2. whether any production write is allowed
3. whether canary rollout is in scope
4. whether Phase 5E is planning-only, readiness-only, staging-only, or limited canary
5. real CI pipeline E2E validation strategy
6. network / partial failure handling
7. orphaned token workflow validation
8. SELF_INVALIDATE workflow validation
9. manual approval revalidation
10. observation mode extreme high-load simulation
11. emergency disable priority
12. monitoring and alerting
13. rollout kill criteria
14. rollback boundary
15. cleanup boundary
16. UI boundary
17. exact Claude implementation scope
18. exact allowed files
19. exact forbidden files
20. exit criteria
21. blocker criteria

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5E Spec
* Grok: GO - Prepare Phase 5E Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Phase 5E Spec.
Spec must include the two Phase 5D monitoring carry-over risks as explicit acceptance criteria.

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
