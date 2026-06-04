# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 004: Model Config Apply Boundary — **CLOSED**

---

## Current Phase

Feature 004 dry-run version 正式結案

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* Production Release: COMPLETED
* Post-Release Monitoring First Window: PASSED
* Feature 004 Spec v1.2: CONDITIONALLY PASSED
* Feature 004 Phase 1: PASSED — Commit `340ee9d` — 158 assertions — Grok 94/100
* Feature 004 Phase 2: PASSED — Commit `58623a9` — 52 assertions (210 cumulative) — Grok 93/100
* Feature 004 Phase 3: PASSED — Commit `9b20e4c` — 276 assertions — Grok 94/100
* Feature 004 Phase 4: PASSED — Commit `52ef10e` — 109 assertions (414 cumulative) — Grok 95/100
* Feature 004: **CLOSED** — All phases passed — 414 total assertions — dry-run only

---

## Feature 004 Closeout Summary

### What was built

A complete dry-run boundary system ensuring AI can never self-apply model config changes:

```
Feature 003 ModelConfigRecommendation
  → SimulatedHumanModelConfigApproval  (persisted: false, executable: false)
  → ModelConfigApplyPlan              (_kind: 'model_config_apply_plan_dry_run', executable: false, aiCanApply: false)
  → ModelConfigRollbackPlan           (_kind: 'model_config_rollback_plan_dry_run', executable: false, aiCanRollback: false)
  + ModelConfigAuditEvent             (aiCanApply: false, aiCanRollback: false, executable: false)
```

### Guard invariants (all permanent)

* `aiCanApply: false` — on all output objects, all paths
* `aiCanRollback: false` — on all output objects, all paths
* `executable: false` — on all plan and approval objects
* `requiresHumanApproval: true` — on apply plan
* `humanApprovalRequired: true` — on rollback plan
* `persisted: false` — on simulated approval
* Tenant hard guard — first check in all validate functions

### What is NOT built (intentional scope boundary)

* No Firestore write — Feature 004 is dry-run only
* No real approval record creation
* No real settings mutation
* No real config apply
* No real config rollback
* No UI
* No Netlify Function

### Future work (Feature 005+)

* Real human-in-the-loop apply with Firestore transaction
* Real rollback with version conflict check and idempotency lock
* UI approval interface for reviewing apply plans

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`52ef10e`

---

## Team State

* Claude: HOLD — awaiting Feature 005 planning directive
* Gemini: HOLD
* Grok: HOLD — standby for Feature 005 review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi 總監 Feature 005 規劃指令 / Post-Release Monitoring directive。

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
