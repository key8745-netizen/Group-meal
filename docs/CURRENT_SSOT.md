# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Post-Merge Verification / Production Deployment Checklist

---

## Current Phase

Post-Merge Validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 001 Final Commit: `48c57b0`
* Feature 002: CLOSED
* Feature 002 Final Commit: `2bf0769`
* Feature 003: CLOSED
* Feature 003 Final Commit: `1a5a381`
* System Release Gate: PASSED
* System Release Gate Commit: `4473127`
* Merge / Release Preparation: PASSED
* Merge Preparation Commit: `95a79ec`
* Merge Commit (target branch): `948e639`
* Source Branch: `claude/busy-heisenberg-HcwYg`
* Target Branch: `claude/fervent-dirac-HJT01`
* Merge Conflicts: None
* Full-system Integration Tests: 223/223 pass
* Critical Safety Gates: 16/16 pass
* Production Readiness Checklist: 20/20 pass
* Grok Final Release Gate Review: 96/100
* Release Recommendation: RELEASE_READY
* ChatGPT Decision: Merge APPROVED; Claude — Report merge result

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`948e639`

---

## Allowed in this phase

* Post-merge test run on target branch
* Post-merge typecheck on target branch
* Post-merge build on target branch
* Verify docs/CURRENT_SSOT.md reflects post-merge state
* Verify docs/AI_TEAM_WORKFLOW.md exists
* Verify docs/RELEASE_RISK_REGISTER.md exists and complete
* Produce merge report
* Push target branch

---

## Forbidden in this phase

* Do not start Feature 004 yet
* Do not introduce new business logic
* Do not add UI
* Do not add Netlify Functions
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not bypass backend guards
* Do not bypass idempotency locks
* Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
* Do not allow AI approval, AI submit, AI receiving, or AI rule mutation
* Do not allow prediction output to become executable purchase action
* Do not change production behavior

---

## Required Guard Rails

* Feature 001 human-in-the-loop purchase boundary must remain intact.
* Feature 002 receiving and inventory update must remain transaction-only.
* Feature 003 prediction engine must remain pure computation.
* AI cannot approve, submit, receive, mutate inventory, write settings, or apply model config.
* Prediction output must remain dry-run and non-executable.
* Audit trail must remain traceable across snapshot, suggestion, prediction, purchase order, receiving, and inventory transaction.
* Duplicate receiving must remain blocked.
* Retry must not duplicate inventory updates.
* ai_performance_metrics must remain isolated from operational performance logs.
* docs/CURRENT_SSOT.md remains the only current-state source of truth.
* docs/AI_TEAM_WORKFLOW.md governs role workflow but does not replace CURRENT_SSOT.md.

---

## Team State

* Claude: Report merge result
* Gemini: HOLD
* Grok: HOLD / Prepare post-merge quick review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Confirm merge and begin Feature 004 planning
2. Request Grok post-merge quick review
3. Pause

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
