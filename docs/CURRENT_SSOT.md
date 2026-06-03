# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 003 Pre-Spec Gap Analysis

---

## Current Phase

Pre-Spec / Red Team Gap Analysis

---

## Current Basis

- Feature 001: CLOSED
- Feature 001 Final Commit: `48c57b0`
- Feature 001 Final Tests: 581/581 pass
- Feature 002: CLOSED
- Feature 002 Final Commit: `2bf0769`
- Feature 002 Final Tests: 384/384 pass
- Feature 002 Grok Final Review: 92/100
- System Integration Gate: CONDITIONALLY PASSED
- Integration Gate Commit: `3b0a3ee`
- Integration Gate Tests: 662/662 pass (139 new integration assertions)
- ChatGPT Decision: Integration Gate conditionally passed; Grok Gap Analysis before Feature 003 Spec

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`3b0a3ee`

---

## Feature 003 Positioning

Feature 003 is NOT a redo of Feature 001 suggestion logic.

Feature 003 = **Predictive Purchasing Optimization Engine**

```
Feature 001: can generate suggestions
Feature 003: makes suggestions smarter — but still cannot place orders
```

Feature 003 must be built on top of existing AIContextSummary and aiSuggestionService.
It is a pure computation layer — no Firestore writes, no order execution, no rule mutation.

---

## Allowed in this phase

- Grok: Feature 003 Gap Analysis (data overflow, false positive, prediction boundary, learning contamination)
- Gemini: Feature 003 Spec (after Grok Gap Analysis is complete)
- SSOT update when instructed by ibi or ChatGPT

---

## Forbidden in this phase

- Do not let Claude start Feature 003 implementation
- Do not rewrite or duplicate Feature 001 aiSuggestionService
- Do not introduce new Firestore write paths
- Do not add Netlify Functions
- Do not modify AI confidence rules
- Do not modify inventory mutation logic
- Do not bypass Feature 001 / Feature 002 guards
- Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
- Do not allow AI to auto-adjust purchasing thresholds or confidence rules
- Do not return to Feature 001 or Feature 002 old phases

---

## Feature 003 Hard Rules (pre-decided, must appear in Spec)

- Feature 003 is pure computation only — no Firestore reads of raw collections
- Input must come from Summary Pattern (AIContextSummary, ai_performance_metrics summary, etc.)
- Output is prediction + recommendation only — not an executable draft
- All weight adjustments require human review before becoming settings
- `aiCanMutateRules: false` must be enforced at output level
- Audit trail event: `PREDICTION_GENERATED` or `PREDICTION_BLOCKED`
- Data lineage must be traceable from prediction input to output

---

## Required Guard Rails (carry-forward from F001 + F002)

- AI cannot approve, submit, receive, or mutate inventory.
- All receiving writes must remain inside one transaction.
- Duplicate receiving must remain blocked.
- Retry must not duplicate inventory updates.
- Audit trail must remain traceable from snapshot to inventoryTransaction.
- `ai_performance_metrics` must remain isolated from operational performance logs.

---

## Team State

- Claude: HOLD
- Gemini: HOLD — prepare Feature 003 Spec after Grok Gap Analysis
- Grok: GO — Feature 003 Gap Analysis
- ChatGPT: Gatekeeper + SSOT maintainer
- ibi: Final authority

---

## Next Expected Input

1. Grok: Feature 003 Gap Analysis report (data overflow, emulator false positive, prediction boundary, learning contamination)
2. Gemini: Feature 003 Spec (after Grok clears)
3. ibi: decision to open Claude Feature 003 Phase 1

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
