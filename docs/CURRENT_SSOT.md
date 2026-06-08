# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5: Real Model Config Apply Transaction Execution

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
* Feature 008 Post-Release Monitoring: PASSED
* Feature 009 Spec v1.1: PASSED
* Feature 009 Phase 1: PASSED (commit `d2add5a`, Grok 96/100)
* Feature 009 Phase 2: PASSED (commit `4c0d96d`, Grok 96/100)
* Feature 009 Phase 3: PASSED (commit `56f3dfb`, Grok 96/100)
* Feature 009 Phase 4: PASSED (commit `1bdc805`, Grok 96/100)
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Post-Release Monitoring: PASSED
* Feature 009 Post-Release Monitoring Commit: `78f7965`
* Feature 009 Post-Release Monitoring Review: 96/100
* Feature 009 Post-Release Monitoring Recommendation: MONITORING_OK
* ChatGPT Decision: Feature 009 Post-Release Monitoring PASSED; begin Feature 009 Phase 5 Planning / Spec Design

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`78f7965`

---

## Feature 009 Phase 5 Goal

Design (NOT implement) the first controlled real transaction execution boundary that
will eventually allow a verified HUMAN-approved config apply to execute inside a real
Firestore `runTransaction`, replacing the contract-only simulation built in Phases 1–4.
This phase produces a spec and review only — recommended split into:
* Phase 5A — emulator-only execution boundary
* Phase 5B — production-gated execution boundary
* Phase 5C — post-execution monitoring

---

## Allowed in this phase

* Spec discussion and design documentation
* Gemini may produce the Feature 009 Phase 5 Spec
* Grok may prepare the Feature 009 Phase 5 Spec Review
* Defining boundaries, contracts, and risk coverage for Phase 5
* SSOT update
* Documentation updates related to planning only

---

## Forbidden in this phase

* Do not let Claude implement any Phase 5 code
* Do not let Claude write, modify, or scaffold any real transaction executor
* Do not write Firestore
* Do not mutate Firestore
* Do not modify `settings`
* Do not write `settingsHistory`
* Do not create real approval records
* Do not create real apply records
* Do not create real rollback records
* Do not create real cleanup jobs
* Do not actually apply config
* Do not actually rollback config
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not modify Feature 001–008 core flows or boundaries
* Do not modify the Feature 009 contract-readiness boundary (Phases 1–4)
* Do not allow AI to apply config
* Do not allow AI to mutate settings or rules
* Do not begin Phase 5 implementation under any circumstance until explicit ChatGPT/ibi GO

---

## Required Guard Rails

* Claude remains HOLD until the Feature 009 Phase 5 Spec passes Grok review and ChatGPT/ibi explicitly authorize implementation.
* Feature 009 contract-readiness boundary (Phases 1–4) must remain intact and untouched.
* `executable` and `aiCanExecute` must remain `false` on all existing contracts.
* AI cannot apply config; AI cannot mutate settings or rules.
* Any future real transaction executor must be a new approved phase with Gemini spec, Grok review, and ChatGPT gatekeeping.
* Static guards / CI rules must continue blocking forbidden imports and forbidden calls.

---

## Priority Risks For Phase 5 Spec

Gemini's spec must explicitly address:
1. Real `admin.auth().verifyIdToken(token)` integration and failure modes
2. Real Firestore read of `settings/{tenantId}` inside `runTransaction`
3. Real read of approval record and its consistency with the contract read-set order
4. Real read of idempotency lock record and atomic check-and-write
5. Atomicity of PENDING→ABANDONED abort transition (flagged race condition risk in Phase 4)
6. Real `settingsHistory` immutable append semantics
7. Real `settings` current version update and optimistic concurrency handling
8. Real audit event write (transactional vs. committed-after)
9. Emulator-only vs. production-gated execution boundary separation (5A/5B split)
10. Rollback boundary scope (explicitly deferred from Feature 009)
11. Cleanup job boundary scope (explicitly deferred from Feature 009)
12. Tenant hard guard execution order in the real transaction
13. Service Account / Admin SDK caller hard-block enforcement at execution time
14. Three-way Firebase token / middleware / request consistency at execution time
15. Concurrent modification detection (version + hash) at execution time
16. Duplicate apply / idempotent replay handling at execution time
17. FAILED audit payload completeness on real abort paths
18. Static guard / CI updates required to scan new Phase 5 executor files
19. Test strategy for real `runTransaction` execution (emulator suite design)
20. Rollout / feature-flag strategy and kill-switch design for first real execution

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5 Spec
* Grok: GO - Prepare Phase 5 Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini's Feature 009 Phase 5 Spec, which must include at minimum:
1. Scope boundary definition (5A emulator-only / 5B production-gated / 5C monitoring)
2. Real `runTransaction` executor service design orchestrating Phase 1–4 validators
3. Real Firebase Admin SDK `admin.auth().verifyIdToken(token)` middleware integration design
4. Real Firestore read design for `settings/{tenantId}`, approval, and lock inside `runTransaction`
5. Real idempotency lock check-and-write design inside `runTransaction`
6. Real `settingsHistory` immutable append design
7. Real `settings` current version update design
8. Real audit event write design (transactional or committed-after)
9. Atomicity design for PENDING→ABANDONED abort transition
10. File list (new files, modified files) with explicit allowed/forbidden boundaries
11. Static guard / CI update plan for new executor files
12. Test strategy (emulator suite, assertion counts, coverage targets)
13. Rollout / feature-flag / kill-switch design
14. Risk register addressing all 20 Priority Risks above
15. Explicit non-goals (what Phase 5 will NOT do)
16. Required Grok review checklist items

After Gemini's Spec is produced, Grok prepares the Phase 5 Spec Review, and ChatGPT/ibi
will gate authorization for any Claude implementation work.

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
