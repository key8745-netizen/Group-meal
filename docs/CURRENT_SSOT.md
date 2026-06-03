# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

System Release Gate: Feature 001 + Feature 002 + Feature 003 Production Readiness Review

---

## Current Phase

Pre-Release Full-System Validation

---

## Current Basis

* Feature 001: CLOSED
* Feature 001 Final Commit: `48c57b0`
* Feature 002: CLOSED
* Feature 002 Final Commit: `2bf0769`
* Feature 003: CLOSED
* Feature 003 Final Commit: `1a5a381`
* Feature 003 Final Tests: 264/264 pass
* Feature 003 Final Integration Tests: 84/84 pass
* Feature 003 Production Checklist: 20/20 pass
* Feature 003 Grok Final Review: 95/100
* `docs/AI_TEAM_WORKFLOW.md`: CREATED
* ChatGPT Decision: Feature 003 CLOSED; run System Release Gate before Feature 004

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`1a5a381`

---

## Allowed in this phase

* Full-system integration tests across Feature 001 + Feature 002 + Feature 003
* End-to-end validation from AI suggestion to prediction preview to purchase receiving
* Audit trail continuity checks
* Permission boundary regression tests
* AI forbidden-action regression tests
* Transaction and idempotency regression tests
* Prediction preview non-executable regression tests
* Production readiness checklist consolidation
* Release risk register
* Documentation cleanup
* SSOT update

---

## Forbidden in this phase

* Do not start Feature 004 yet
* Do not introduce new business logic
* Do not modify Feature 001 core flow unless required by failing tests
* Do not modify Feature 002 inventory mutation logic unless required by failing tests
* Do not modify Feature 003 prediction logic unless required by failing tests
* Do not add Netlify Functions
* Do not add UI
* Do not bypass backend guards
* Do not bypass idempotency locks
* Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
* Do not allow AI approval, AI submit, AI receiving, or AI rule mutation
* Do not allow prediction output to become executable purchase action
* Do not return to old Feature phases unless explicitly required for a failing regression test

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
* `ai_performance_metrics` must remain isolated from operational performance logs.
* `docs/CURRENT_SSOT.md` remains the only current-state source of truth.
* `docs/AI_TEAM_WORKFLOW.md` governs role workflow but does not replace `CURRENT_SSOT.md`.

---

## Team State

* Claude: HOLD until System Release Gate instruction
* Gemini: HOLD
* Grok: Prepare full-system release review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start System Release Gate
2. Pause development and prepare merge/release
3. Start Feature 004 planning after release gate

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
