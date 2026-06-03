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

Phase 2: Real Transaction Implementation

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 001 Tests: 581/581 pass
- Feature 002 Gemini Spec: v1.2
- Feature 002 Grok Review: 94/100
- Feature 002 Phase 1: PASSED
- Feature 002 Phase 1 Commit: `ec0a874`
- Feature 002 Phase 1 Grok Code Review: 91/100
- ChatGPT Decision: Claude GO - Feature 002 Phase 2 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`425dd22`

---

## Allowed in this phase

- Real receiving transaction service
- Firestore `runTransaction` implementation
- Idempotency lock read/create inside transaction
- Inventory transaction creation inside transaction
- `inventory.currentStockGrams` update inside transaction
- `purchaseOrders.status = RECEIVED` update inside transaction
- Audit event append inside transaction
- `ai_performance_metrics` creation inside transaction
- Receiving validation integration
- Purchase order status transition guard integration
- Tests
- Docs

---

## Forbidden in this phase

- Do not connect UI
- Do not add Netlify Functions
- Do not allow AI caller to receive
- Do not allow AI caller to update inventory
- Do not write `performanceLogs`
- Do not write `finalizedPerformanceLogs`
- Do not write `operationalReports`
- Do not split receiving into multiple independent writes
- Do not update purchaseOrder to RECEIVED outside the transaction
- Do not update inventory outside the transaction
- Do not create inventoryTransactions outside the transaction
- Do not allow DRAFT → RECEIVED
- Do not allow duplicate receiving
- Do not bypass idempotency lock
- Do not bypass `validateAIOperationOrThrow`
- Do not return to Feature 001 phases
- Do not return to Feature 002 v1.1

---

## Required Guard Rails

- All writes must happen inside one Firestore `runTransaction` callback.
- The transaction must read and validate purchaseOrder, inventory, and receiving lock before writing.
- Idempotency lock key must be based on `purchaseOrderId + receivingToken`.
- Duplicate receiving must be blocked.
- Already RECEIVED purchaseOrder must be blocked.
- `callerType === 'ai'` must be blocked.
- Receiving delta greater than 15% without valid `receivingNote` must be blocked and rollback.
- Inventory update must use atomic increment semantics or transaction-safe equivalent.
- AI performance feedback must only write `ai_performance_metrics`.
- `performanceLogs` and finalized operational logs are forbidden in this feature phase.
- All `purchaseOrders.status` transitions must call the status transition guard.

---

## Team State

- Claude: GO - Feature 002 Phase 2 only
- Gemini: HOLD
- Grok: Prepare Feature 002 Phase 2 code review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Claude Feature 002 Phase 2 report:

- branch name
- commit hash
- changed files
- whether only allowed files were modified
- tests result
- typecheck result
- build result
- confirmation that all receiving writes are in one `runTransaction`
- confirmation that idempotency lock is created inside the same transaction
- confirmation that duplicate receiving is blocked
- confirmation that AI caller is blocked
- confirmation that delta >15% without note is blocked
- confirmation that `inventory.currentStockGrams` is updated only inside transaction
- confirmation that inventory transaction is created only inside transaction
- confirmation that purchaseOrder status is updated to RECEIVED only inside transaction
- confirmation that no `performanceLogs` / `finalizedPerformanceLogs` / `operationalReports` are written
- confirmation that no UI / Netlify Function was added

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
