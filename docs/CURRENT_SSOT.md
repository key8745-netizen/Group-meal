# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Production Release Completed: Feature 001 + Feature 002 + Feature 003

---

## Current Phase

Post-Release Monitoring / Feature 004 Planning Pending

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
* Merge Commit: `948e639`
* Production Branch: `claude/fervent-dirac-HJT01`
* Production Deployment Checklist: 20/20 PASS
* Full-system Integration Tests: 223/223 pass
* Critical Safety Gates: 16/16 pass
* Grok Release Gate Score: 96/100
* Release Status: RELEASED

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`948e639` (merge) + SSOT/checklist commit (see below)

---

## Allowed in this phase

* Post-release monitoring
* Feature 004 planning (when ibi authorizes)
* Bug fixes if production issues are reported

---

## Forbidden in this phase

* Do not start Feature 004 until explicitly authorized by ibi
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

* Claude: HOLD — await Feature 004 planning authorization
* Gemini: HOLD
* Grok: HOLD / Prepare post-release quick check if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Begin Feature 004 planning (authorize Gemini Spec)
2. Request Grok post-release quick check
3. Pause / monitor production

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
