# AI Decision Boundary

This document defines what the AI layer **can** and **cannot** do in the Group-meal system.
It is the authoritative reference for all AI-related feature development.

## Three-Layer Architecture

```
大腦層 (Brain)      — Strategy, specs, business rules  → Gemini
感知層 (Perception) — Data facts, anomaly detection    → Grok (audit)
執行層 (Execution)  — React / TypeScript / Firebase    → Claude
```

---

## AI Read Permissions

The AI context snapshot (`aiContextService.ts`) may only expose the following data:

| Allowed                        | Forbidden                     |
|-------------------------------|-------------------------------|
| `menus` collection (BOM data)  | Firebase API keys / secrets   |
| `ingredients` collection       | Netlify env vars              |
| `inventory` current stock      | Unauthenticated user PII      |
| `purchaseOrders` (DRAFT/PENDING)| Auth tokens / session data    |
| `mealPlans` (date + headCount) | Raw OCR image data            |
| `performanceLogs` aggregates   | Other tenants' data           |
| `settings` (thresholds only)   | Payment / billing data        |

---

## Hard Rules — Cannot Be Overridden by AI

These rules are **absolute** and must be enforced in code, not configuration:

| Rule | Enforcement |
|------|-------------|
| AI may only create DRAFT purchase orders | `purchaseOrderService.createDraftOrder()` — status always `'draft'` |
| AI cannot mark purchase orders RECEIVED | Only human action via UI |
| AI cannot directly update `inventory/{id}.currentStock` | All writes via `inventoryService` transactions |
| AI cannot deduct stock | Only via `inventoryService.deductStock()` |
| AI cannot restock ingredients | Only via `purchaseOrderService.completeOrder()` |
| AI cannot delete `inventory/{id}/transactions` | Audit trail is permanent |
| AI cannot modify `settings` documents | Human-only via `SettingsPanel` |
| OCR results cannot be written to `menus` without human confirmation | UI gate required |
| AI suggestions with confidence BLOCKED must not produce DRAFT orders | Enforced in `aiSuggestionConfidence.ts` |

---

## Confidence Levels

Purchase suggestions carry a confidence level computed by `aiSuggestionConfidence.ts`:

| Level   | Meaning | Can Create DRAFT? |
|---------|---------|-------------------|
| HIGH    | BOM complete, inventory valid, has purchase history | Yes |
| MEDIUM  | BOM complete but sparse history, or minor gaps | Yes (with warning) |
| LOW     | OCR source, multiple data gaps, unit ambiguity | Yes (with warning) |
| BLOCKED | Missing ingredientId, negative stock, unit conversion failure, qty overflow | **No** |

---

## Three Human Controls

### 1. Filtering Right (篩選權)
The `AIContextSnapshot` interface in `aiContextService.ts` is the only contract through which
AI functions receive data. New fields must be explicitly added — AI cannot self-extend its scope.

### 2. Meaning Right (意義權)
Business rules (waste factors, safety stock levels, ordering thresholds) live in Firestore `settings`
and are set by humans. AI reads them as input but cannot write them.

### 3. Kill Switch (斷線權)
`settings/{tenantId}.aiAutomation.purchaseSuggestionEnabled` — when `false`, the suggestion
engine returns an empty result without writing anything.

---

## Audit Trail

Every AI-generated DRAFT order must record:
- `aiGenerated: true`
- `confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'`
- `confidenceReasons: string[]`
- Human overrides stored in `aiSuggestionFeedback` sub-collection (future Sprint 3)
