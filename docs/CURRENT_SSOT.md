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

Phase 3: UI Integration & End-to-End Testing

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 002 Gemini Spec: v1.2
- Feature 002 Phase 1: PASSED
- Feature 002 Phase 1 Commit: `ec0a874`
- Feature 002 Phase 2: CONDITIONALLY PASSED
- Feature 002 Phase 2 Commit: `425dd22`
- Feature 002 Phase 2 Grok Review: 91/100
- ChatGPT Decision: Claude GO - Feature 002 Phase 3 only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`7ef739f`

---

## Allowed in this phase

- Phase 2 risk fixes
- Receiving confirmation UI
- `ReceivingConfirmationDialog.tsx`
- UI-level receiving quantity input
- UI-level kg / 台斤 / grams conversion through existing safe conversion helpers
- UI-level delta warning
- "不可撤銷 / irreversible" warning
- Integration with existing guarded receiving transaction service
- E2E tests
- Regression tests
- Docs
- SSOT update

---

## Forbidden in this phase

- Do not remove irreversible receiving warnings
- Do not allow AI auto-receiving
- Do not bypass `validateAIOperationOrThrow`
- Do not bypass receiving validation
- Do not bypass idempotency lock
- Do not bypass single transaction receiving service
- Do not update inventory outside transaction
- Do not modify inventory directly from UI
- Do not create inventoryTransactions outside transaction
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not add Netlify Functions
- Do not implement receiving cleanup jobs
- Do not return to Feature 001
- Do not return to Feature 002 v1.1 / old phases

---

## Required Guard Rails

- UI must call only the guarded receiving transaction service.
- UI must not directly write Firestore.
- UI must not directly modify inventory or purchaseOrders.
- Receiving quantity must be converted using existing safe grams conversion helpers.
- Delta >15% must show warning and require receiving note.
- Delta >15% without note must remain blocked by backend validation.
- Duplicate submit must be prevented in UI and still blocked by backend idempotency.
- Network failure / retry must not cause duplicate receiving.
- The receiving action must clearly show:
  - This action is irreversible.
  - This will mark the purchase order as RECEIVED.
  - This will update inventory.
  - This must be done only after actual human receiving confirmation.

---

## Phase 3 Pre-flight Risks

- Transaction retry and final rollback behavior must be covered by E2E tests.
- Idempotency lock TTL cleanup is documented only; cleanup job is not implemented in this phase.
- UI must not weaken backend protections.

---

## Team State

- Claude: GO - Feature 002 Phase 3 only
- Gemini: HOLD
- Grok: Prepare Feature 002 Phase 3 code review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Claude Feature 002 Phase 3 report:

- branch name
- commit hash
- changed files
- whether only allowed files were modified
- tests result
- typecheck result
- build result
- confirmation that UI does not write Firestore directly
- confirmation that UI only calls guarded receiving transaction service
- confirmation that no Netlify Function was added
- confirmation that no inventory update happens outside transaction
- confirmation that irreversible warning is visible
- confirmation that delta >15% requires note in UI
- confirmation that duplicate submit is guarded
- confirmation that E2E tests cover duplicate submit / network failure / delta warning

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
