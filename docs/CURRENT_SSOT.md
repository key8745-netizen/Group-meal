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
* Feature 009 Post-Release Monitoring: PASSED
* Feature 009 Phase 5 Spec v1.1: PASSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Commit: `018dd34`
* Feature 009 Phase 5A Grok Code Review: 95/100
* Feature 009 Phase 5A Post-Emulator Monitoring: PASSED
* Feature 009 Phase 5A Monitoring Commit: `c1446f2`
* Feature 009 Phase 5A Monitoring Review: 96/100
* ChatGPT Decision: Begin Feature 009 Phase 5B Planning only; Claude HOLD

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`c1446f2`

---

## Phase 5B Goal

Design a production-gated rollout strategy for the real model config apply transaction executor.
Phase 5A proved the transaction executor works safely in Firebase Emulator.
Phase 5B must define how, whether, and under what strict gates this executor may be introduced toward production.
Phase 5B is Planning / Spec Design only.
No production write is allowed in this phase.
Claude must remain HOLD until Gemini Spec passes Grok review and ChatGPT / ibi explicitly approve implementation.

---

## Allowed in this phase

* Phase 5B requirements discussion
* Gemini produces Phase 5B Spec
* Grok reviews Phase 5B Spec
* Define production rollout gate
* Define production allowlist / tenant allowlist
* Define operator approval requirement
* Define production kill switch
* Define rollout mode:
  * emulator-only continuation
  * staging-only rollout
  * production canary
  * production disabled by default
* Define production environment guard extension
* Define production write enable flag
* Define dry-run-to-real comparison strategy
* Define audit / monitoring strategy
* Define failure / abort strategy
* Define rollback boundary
* Define cleanup boundary
* Define UI boundary
* Define post-rollout monitoring strategy
* Define Claude Phase 5B implementation scope
* Docs / SSOT update

---

## Forbidden in this phase

* Do not let Claude implement code
* Do not modify production code
* Do not allow production Firestore write
* Do not mutate production settings
* Do not write production settingsHistory
* Do not create production approval records
* Do not create production apply records
* Do not create production rollback records
* Do not create production cleanup jobs
* Do not apply config in production
* Do not rollback config in production
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not modify Feature 004 dry-run boundary
* Do not modify Feature 005 dry-run execution boundary
* Do not modify Feature 006 dry-run transaction-readiness boundary
* Do not modify Feature 007 dry-run real-apply readiness boundary
* Do not modify Feature 008 dry-run executor-readiness boundary
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not change `wasteFactorWarning` automatically
* Do not introduce production write paths before Spec approval

---

## Required Guard Rails For Phase 5B Spec

Gemini must define:
* Whether Phase 5B remains staging-only or allows limited production canary
* Production write flag strategy
* Tenant allowlist strategy
* Operator approval requirement
* Manual confirmation requirement
* Kill switch
* Default-deny behavior
* Production project ID hard-block behavior unless explicitly allowlisted
* Environment verification
* Verified human caller requirement
* Persisted approval requirement
* AI caller hard-block
* Service Account / Admin SDK bypass prevention
* Idempotency lock behavior in production-gated context
* Duplicate apply behavior
* expectedCurrentVersion guard
* canonical currentConfig hash validation
* immutable settingsHistory write strategy
* audit event atomicity
* failure / abort behavior
* rollback boundary
* cleanup boundary
* UI boundary
* post-rollout monitoring
* emergency disable procedure

---

## Required Phase 5B Risk Questions

Gemini must explicitly answer:
1. Is Phase 5B staging-only, production-canary, or production-disabled-by-default?
2. If production-canary is allowed, which tenant(s) are eligible?
3. Who is allowed to enable production writes?
4. What environment variables must be present?
5. What project IDs are allowed?
6. What project IDs are explicitly blocked?
7. What happens if the allowlist is missing?
8. What happens if the kill switch is ON?
9. What happens if production flag is accidentally ON in the wrong project?
10. How is dry-run output compared to real write intent?
11. How is final human confirmation recorded?
12. How are duplicate apply attempts handled in production?
13. How is audit event atomicity guaranteed?
14. How is failure rollback or abort handled?
15. How is post-rollout monitoring performed?
16. How can rollout be immediately disabled?
17. Does Phase 5B include rollback? If not, why?
18. Does Phase 5B include cleanup? If not, why?
19. Does Phase 5B include UI? If not, why?
20. What is Claude allowed to implement in the next phase?

---

## Recommended Default

Recommended Phase 5B design:
* Staging-first
* Production disabled by default
* Production canary only after explicit future approval
* No UI
* No rollback
* No cleanup
* No broad production rollout
* Tenant allowlist mandatory
* Kill switch mandatory
* Operator manual confirmation mandatory
* Dry-run-to-real comparison mandatory
* Post-rollout monitoring mandatory

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5B Spec
* Grok: GO - Prepare Phase 5B Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Phase 5B Spec.
Spec should define:
* Phase 5B scope decision
* staging / production rollout boundary
* production allowlist
* tenant allowlist
* operator confirmation
* kill switch
* production write flag
* environment guard
* dry-run-to-real comparison
* transaction executor rollout strategy
* audit and monitoring strategy
* failure / abort strategy
* rollback boundary
* cleanup boundary
* UI boundary
* Claude implementation scope

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
