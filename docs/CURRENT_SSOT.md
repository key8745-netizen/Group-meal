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

Phase 1: Types / Guard / Validation / Transaction Dry-run

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: 48c57b0
- Feature 001 Tests: 581/581 pass
- Feature 002 Gemini Spec: v1.2
- Feature 002 Grok Review: 94/100
- ChatGPT Decision: Claude GO - Feature 002 Phase 1 only

---

## Current Branch

claude/busy-heisenberg-HcwYg

---

## Current Commit

ec0a874

---

## Allowed in this phase

- receivingBoundary types
- purchaseOrder status guard
- receiving validation service
- idempotency lock helper
- transaction dry-run plan
- ai_performance_metrics type/schema
- tests
- docs

---

## Forbidden in this phase

- Do not write production Firestore data
- Do not execute real runTransaction writes
- Do not modify inventoryService
- Do not modify inventory.currentStockGrams
- Do not create real inventoryTransactions
- Do not connect UI
- Do not add Netlify Functions
- Do not return to Feature 001 Phase 8
- Do not return to Feature 002 v1.1
- Do not implement real receiving
- Do not update purchaseOrders.status to RECEIVED

---

## Team State

- Claude: GO - Feature 002 Phase 1 only
- Gemini: HOLD
- Grok: Prepare Feature 002 Phase 1 code review
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

Claude Feature 002 Phase 1 report:

- branch name
- commit hash
- changed files
- whether only allowed files were modified
- tests result
- typecheck result
- build result
- confirmation that no production data was written
- confirmation that no real runTransaction write was executed
- confirmation that inventoryService was not modified
- confirmation that inventory.currentStockGrams was not modified
- confirmation that no real inventoryTransactions were created

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
