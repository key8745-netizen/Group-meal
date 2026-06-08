# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5B: Production-Gated Real Model Config Apply Transaction Rollout

---

## Current Phase

Phase 5B: Implementation — Staging-first / Production-gated Foundation

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
* Feature 009 Phase 5B Spec v1.2: PASSED
* Feature 009 Phase 5B Spec v1.2 Grok Review: 95/100
* ChatGPT Decision: Claude GO - Feature 009 Phase 5B only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`c1446f2`

---

## Phase 5B Goal

Implement the production-gated rollout foundation for the real model config apply transaction executor.
Phase 5B must remain conservative:
* staging-first
* production-disabled-by-default
* tenant allowlist mandatory
* operator allowlist mandatory
* operator confirmation mandatory
* kill switch mandatory
* emergency disable mandatory
* dry-run-to-real comparison mandatory
* deployment pipeline hard-block mandatory
* no broad production rollout
* no UI
* no rollback
* no cleanup job

Phase 5B may extend the Phase 5A emulator-only executor with production-gate infrastructure, but it must not open broad production writes.

---

## Phase 5B Priority Risks

Grok identified two medium risks that must be handled in Phase 5B implementation:

### 1. Kill Switch Reset Audit Trail Integrity

* Kill switch reset must not be a casual single-operator action.
* Reset must require two-person integrity if scoped.
* Reset audit event must include: tenantId or global scope, reset requestedBy, reset approvedBy, previous state, next state, reason, timestamp, auditTrailId.
* Reset failure must not leave inconsistent state.
* If implemented, reset should be transaction-protected.
* Missing reset audit payload must BLOCK.

### 2. Final Physical Production Deployment Gate

* Production hard-block must not rely only on app-level runtime flags.
* CI / deployment gate must prevent accidental production enablement.
* Production write enablement must require explicit manual approval.
* Canary / staging gate must be documented.
* If pipeline gate is missing, production-gated execution must remain disabled.
* Broad production rollout remains forbidden.

---

## Allowed in this phase

* ProductionAccessManager implementation
* ProductionGate service
* Staging-first rollout guard
* Production disabled-by-default guard
* Tenant allowlist validator
* Operator allowlist validator
* Operator confirmation validator
* Kill switch validator
* Kill switch reset contract
* Two-person integrity reset contract if scoped
* Emergency disable contract
* DryRunToRealComparer
* ProductionEnvironmentGuard extension
* Production write enable flag validation
* Staging environment validation
* Deployment pipeline gate contract
* CI / static guard enforcement
* Audit payload for operator confirmation
* Audit payload for blocked production attempt
* Audit payload for kill switch block
* Audit payload for kill switch reset
* Audit payload for emergency disable
* Monitoring metric payload helpers
* Tests for production hard-block
* Tests for tenant allowlist
* Tests for operator allowlist
* Tests for operator confirmation
* Tests for kill switch
* Tests for kill switch reset audit
* Tests for emergency disable
* Tests for dry-run-to-real comparison
* Tests for deployment gate hard-block
* Docs
* SSOT update

---

## Forbidden in this phase

* Do not allow broad production rollout
* Do not allow production write without explicit gate
* Do not allow production write without tenant allowlist
* Do not allow production write without operator allowlist
* Do not allow production write without operator confirmation
* Do not allow production write when kill switch is ON
* Do not allow production write when gate config is missing
* Do not allow production write when deployment gate is missing
* Do not allow production write in unknown environment
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
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

* Production rollout must be disabled by default.
* Unknown environment must default-deny.
* Missing production gate config must BLOCK.
* Missing deployment pipeline gate must BLOCK.
* Missing tenant allowlist must BLOCK.
* Missing operator allowlist must BLOCK.
* Missing operator confirmation must BLOCK.
* Kill switch ON must BLOCK.
* Kill switch missing must BLOCK.
* Production write enable flag must be explicit.
* Tenant must be explicitly allowlisted.
* Operator must be explicitly allowlisted.
* Operator confirmation must bind: tenantId, approvalId, applyToken, expectedCurrentVersion, configBeforeHash, configAfterHash, diffHash, operatorUserId, timestamp.
* Dry-run-to-real comparison must validate: tenantId, approvalId, sourceRecommendationId, auditTrailId, expectedCurrentVersion, configBeforeHash, configAfterHash, diffHash, applyToken, payloadHash.
* Any mismatch must BLOCK.
* AI caller must remain hard-blocked.
* Service Account / Admin SDK must not imply business permission.
* Verified human caller remains mandatory.
* Persisted approval remains mandatory.
* expectedCurrentVersion remains mandatory.
* Canonical hash validation remains mandatory.
* Idempotency lock behavior remains mandatory.
* settingsHistory remains immutable append-only.
* Audit event atomicity remains mandatory.
* Kill switch reset must be audited if implemented.
* Emergency disable must be auditable.
* Rollback remains excluded.
* Cleanup remains excluded.
* UI remains excluded.

---

## Required Tests

Phase 5B must include tests for:
* production disabled by default
* unknown environment BLOCKED
* missing gate config BLOCKED
* missing deployment gate BLOCKED
* production disabled flag BLOCKED
* production enabled without tenant allowlist BLOCKED
* production enabled without operator allowlist BLOCKED
* production enabled without operator confirmation BLOCKED
* kill switch ON BLOCKED
* kill switch missing BLOCKED
* kill switch OFF + all gates valid passes
* kill switch reset requires complete audit payload
* kill switch reset missing audit payload BLOCKED
* emergency disable modeled
* emergency disabled state blocks future apply
* tenant allowlisted passes
* tenant not allowlisted BLOCKED
* missing tenant allowlist BLOCKED
* operator allowlisted passes
* operator not allowlisted BLOCKED
* missing operator allowlist BLOCKED
* valid operator confirmation passes
* missing operator confirmation BLOCKED
* malformed operator confirmation BLOCKED
* tenant mismatch BLOCKED
* approvalId mismatch BLOCKED
* applyToken mismatch BLOCKED
* expectedCurrentVersion mismatch BLOCKED
* configBeforeHash mismatch BLOCKED
* configAfterHash mismatch BLOCKED
* diffHash mismatch BLOCKED
* operatorUserId mismatch BLOCKED
* dry-run-to-real exact match passes
* dry-run-to-real tenantId mismatch BLOCKED
* dry-run-to-real approvalId mismatch BLOCKED
* dry-run-to-real sourceRecommendationId mismatch BLOCKED
* dry-run-to-real auditTrailId mismatch BLOCKED
* dry-run-to-real expectedCurrentVersion mismatch BLOCKED
* dry-run-to-real configBeforeHash mismatch BLOCKED
* dry-run-to-real configAfterHash mismatch BLOCKED
* dry-run-to-real diffHash mismatch BLOCKED
* dry-run-to-real applyToken mismatch BLOCKED
* dry-run-to-real payloadHash mismatch BLOCKED
* AI caller BLOCKED
* Service Account / Admin SDK bypass BLOCKED
* no broad production rollout
* no UI
* no rollback
* no cleanup
* tests pass
* typecheck pass
* build pass

---

## Team State

* Claude: GO - Feature 009 Phase 5B only
* Gemini: HOLD / support clarification only
* Grok: Prepare Feature 009 Phase 5B code review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Feature 009 Phase 5B report:
* branch name
* commit hash
* changed files
* tests result
* typecheck result
* build result
* production disabled-by-default confirmation
* tenant allowlist validator confirmation
* operator allowlist validator confirmation
* operator confirmation validator confirmation
* kill switch validator confirmation
* kill switch reset audit confirmation
* emergency disable contract confirmation
* deployment gate hard-block confirmation
* dry-run-to-real comparison confirmation
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
