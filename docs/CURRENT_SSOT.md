# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 002: Receiving & Inventory Update Boundary

---

## Current Phase

Phase 4: E2E Testing, Production Readiness, Final Polish

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 002 Gemini Spec: v1.2
- Feature 002 Phase 1: PASSED
- Feature 002 Phase 1 Commit: `ec0a874`
- Feature 002 Phase 2: CONDITIONALLY PASSED
- Feature 002 Phase 2 Commit: `425dd22`
- Feature 002 Phase 3: CONDITIONALLY PASSED
- Feature 002 Phase 3 Commit: `7ef739f`
- Feature 002 Phase 3 Grok Review: 89/100
- ChatGPT Decision: Claude GO - Feature 002 Phase 4 only
- Feature 002 Phase 4: PENDING REVIEW
- Feature 002 Phase 4 Commit: `2bf0769`

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`2bf0769`

---

## Allowed in this phase

- Phase 3 risk fixes
- Replace `Date.now()` receivingToken with UUID v4 or equivalent collision-resistant token
- E2E / integration tests for receiving flow
- Tests for direct service call bypassing UI
- Tests for duplicate submit
- Tests for network failure / retry safety
- Tests for delta >15% without note blocked by backend
- Tests for idempotency lock behavior
- Tests confirming receiving writes remain in one transaction
- Production readiness checklist
- Documentation updates
- SSOT update

---

## Forbidden in this phase

- Do not add Netlify Functions
- Do not introduce new production write paths
- Do not bypass guarded receiving transaction service
- Do not bypass `validateAIOperationOrThrow`
- Do not bypass receiving validation
- Do not bypass idempotency lock
- Do not update inventory outside transaction
- Do not create inventoryTransactions outside transaction
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not remove irreversible receiving warnings
- Do not allow AI auto-receiving
- Do not add receiving lock cleanup jobs
- Do not return to Feature 001
- Do not return to Feature 002 v1.1 / old phases

---

## Required Guard Rails

- UI must call only the guarded receiving transaction service.
- Backend service must still block invalid calls even if UI is bypassed.
- receivingToken must be collision-resistant.
- Duplicate submit must be blocked by UI and backend idempotency.
- Network failure / retry must not cause duplicate receiving.
- Delta >15% without receiving note must be blocked by UI and backend.
- All receiving writes must remain inside one `runTransaction`.
- `inventory.currentStockGrams` must only update inside transaction.
- `inventoryTransactions` must only be created inside transaction.
- `purchaseOrders.status = RECEIVED` must only happen inside transaction.
- No operational performance logs may be written in this feature phase.

---

## Team State

- Claude: GO - Feature 002 Phase 4 only
- Gemini: HOLD
- Grok: Prepare Feature 002 Phase 4 code review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Claude Feature 002 Phase 4 report:

- branch name
- commit hash
- changed files
- whether only allowed files were modified
- tests result
- typecheck result
- build result
- confirmation that receivingToken no longer uses `Date.now()` only
- confirmation that direct service-call bypass tests pass
- confirmation that duplicate submit tests pass
- confirmation that network failure / retry tests pass
- confirmation that delta >15% without note is blocked by backend
- confirmation that all receiving writes remain in one transaction
- confirmation that no Netlify Function was added
- confirmation that no performanceLogs / finalizedPerformanceLogs / operationalReports were written
- production readiness checklist summary

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
