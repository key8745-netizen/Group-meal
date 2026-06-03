# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

System Integration Gate: Feature 001 + Feature 002 End-to-End Validation

---

## Current Phase

Pre-Feature 003 Integration Gate

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 001 Final Tests: 581/581 pass
- Feature 002: CLOSED
- Feature 002 Phase 1 Commit: `ec0a874`
- Feature 002 Phase 2 Commit: `425dd22`
- Feature 002 Phase 3 Commit: `7ef739f`
- Feature 002 Final Commit: `2bf0769`
- Feature 002 SSOT Commit: `30b2b48`
- Feature 002 Final Tests: 384/384 pass
- Feature 002 Grok Final Review: 92/100
- ChatGPT Decision: Feature 002 CLOSED; run integration gate before Feature 003

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`2bf0769`

---

## Allowed in this phase

- End-to-end integration tests across Feature 001 + Feature 002
- Full flow verification:
  - AI suggestion
  - confidence grading
  - human override
  - draft purchase suggestion
  - human approval
  - purchaseOrders.status = DRAFT
  - human submit
  - purchaseOrders.status = PENDING
  - human receiving confirmation
  - purchaseOrders.status = RECEIVED
  - inventory.currentStockGrams update
  - inventoryTransaction creation
  - ai_performance_metrics creation
- Audit trail continuity checks
- Idempotency checks
- Retry / duplicate submit checks
- Documentation cleanup
- Production readiness checklist consolidation
- SSOT update

---

## Forbidden in this phase

- Do not start Feature 003 yet
- Do not introduce new business logic
- Do not modify AI confidence rules unless required by failing tests
- Do not modify inventory mutation logic unless required by failing tests
- Do not add Netlify Functions
- Do not bypass backend guards
- Do not bypass idempotency locks
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not allow AI approval, AI submit, or AI receiving
- Do not return to Feature 001 or Feature 002 old phases

---

## Required Guard Rails

- All AI-origin purchase flows must remain human-in-the-loop.
- AI cannot approve, submit, receive, or mutate inventory.
- All receiving writes must remain inside one transaction.
- Duplicate receiving must remain blocked.
- Retry must not duplicate inventory updates.
- Audit trail must remain traceable from snapshot to inventoryTransaction.
- `ai_performance_metrics` must remain isolated from operational performance logs.

---

## Team State

- Claude: HOLD until integration gate instruction
- Gemini: HOLD
- Grok: Prepare integration gate review if requested
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start System Integration Gate
2. Start Feature 003 planning
3. Pause development and merge/release current branch

Recommended next input:
Claude integration gate report or instruction to run Feature 001 + Feature 002 E2E validation.

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
