# Feature 002 Phase 2 — Real Receiving Transaction Implementation

## Overview

Phase 2 implements the complete PENDING → RECEIVED transition for AI-sourced purchase orders
via a single Firestore `runTransaction`. All six writes are atomic: either all succeed or
all roll back.

---

## Transaction Structure

All writes happen inside **one** `runTransaction` callback in this order:

```
runTransaction(db, async (tx) => {
  // READS (must precede all writes)
  const [poSnap, inventorySnap, lockSnap] = await Promise.all([...tx.get(...)]);

  // VALIDATE
  validateReceivingBeforeWrite({ request, poData, lockData, now })
  // throws on any block → Firestore rolls back all writes

  // WRITES
  1. tx.set(receivingLockRef, { status: 'CONSUMED', ... })
  2. tx.set(inventoryTransactionRef, { type: 'restock', quantity (kg), ... })
  3. tx.update(inventoryRef, { currentStock: increment(kg), currentStockGrams: increment(grams) })
  4. tx.update(purchaseOrderRef, { status: 'RECEIVED', receivedAt, inventoryTransactionId, ... })
  5. tx.set(auditTrailRef, auditEvent)
  6. tx.set(aiPerformanceMetricRef, { aiCanMutateRules: false, createdBy: 'system', ... })
})
```

---

## Idempotency Lock Design

**Collection path**: `receiving_locks/{purchaseOrderId}_{receivingToken}`

| Lock status | Meaning | Action on encounter |
|---|---|---|
| `ACTIVE` (within TTL) | Another attempt is in flight | Block: `RECEIVING_LOCK_ACTIVE` |
| `ACTIVE` (past TTL) | Stale — previous attempt timed out | Block: `RECEIVING_LOCK_EXPIRED` |
| `CONSUMED` | Successfully received | Block: `DUPLICATE_RECEIVING_ATTEMPT` |
| `EXPIRED` | Explicitly marked expired | Block: `RECEIVING_LOCK_EXPIRED` |
| absent | No prior attempt | Allow |

### TTL Policy

| Constant | Value | Purpose |
|---|---|---|
| `RECEIVING_LOCK_TTL_MS` | 10 min | Max lifetime for an ACTIVE (in-flight) lock |
| `RECEIVING_CONSUMED_LOCK_RETENTION_MS` | 30 min | How long a CONSUMED lock is retained as idempotency proof |

**Phase 2 does not implement a cleanup job.**

Cleanup policy (future Phase):
- CONSUMED locks older than 30 minutes MAY be deleted by a maintenance job.
  They are safe to delete after retention expires because the purchase order's own
  `inventoryTransactionId` field serves as the permanent duplicate check.
- ACTIVE / stale locks older than 10 minutes may be deleted by the same job.
- This job must never delete a CONSUMED lock within the retention window.

---

## Inventory Update Strategy

The `inventory.currentStock` field (kg) is updated using Firestore's `increment()` operator:

```ts
tx.update(inventoryRef, {
  currentStock:      increment(receivedQtyKg),   // existing schema field
  currentStockGrams: increment(receivedQtyGrams), // new grams field
  lastUpdated:       serverTimestamp(),
})
```

`increment()` is Firestore's built-in atomic increment — it does **not** require a
read-modify-write and is safe under concurrent writes. The transaction's read of the
inventory document provides `currentStockBeforeGrams` for the inventoryTransaction record.

### Known Limitation

The `currentStockGrams` field may not exist on older inventory documents.
Firestore's `increment()` on a missing field initialises it to the increment value,
so the first receiving operation stamps the field correctly.

If `currentStock` (kg) is fractional and rounding differs from the grams value,
there may be a sub-gram discrepancy. This is logged in the inventoryTransaction record
via `currentStockBeforeGrams` / `currentStockAfterGrams` for audit purposes.

---

## AI Performance Metrics Isolation

Phase 2 writes **only** to `ai_performance_metrics/{metricId}`.

| Collection | Written? |
|---|---|
| `ai_performance_metrics` | ✅ Yes |
| `performanceLogs` | ❌ Never |
| `finalizedPerformanceLogs` | ❌ Never |
| `operationalReports` | ❌ Never |

The metric includes `aiCanMutateRules: false` as a compile-time literal invariant.

---

## Hard Guard Summary

| Guard | Blocked reason |
|---|---|
| `callerType !== 'human'` | `AI_RECEIVING_FORBIDDEN`, `AI_INVENTORY_UPDATE_FORBIDDEN` |
| PO not PENDING | `PURCHASE_ORDER_NOT_PENDING` / `PURCHASE_ORDER_ALREADY_RECEIVED` |
| DRAFT → RECEIVED | `PURCHASE_ORDER_STATUS_TRANSITION_INVALID` |
| CONSUMED lock exists | `DUPLICATE_RECEIVING_ATTEMPT` |
| ACTIVE lock within TTL | `RECEIVING_LOCK_ACTIVE` |
| Delta > 15% without note | `RECEIVING_DELTA_NOTE_REQUIRED` |
| Zero / negative receivedQtyGrams | `INVALID_RECEIVED_QTY` |

---

## Files Added / Modified

| File | Change |
|---|---|
| `src/services/receivingTransactionService.ts` | NEW — main transaction service |
| `src/services/purchaseOrderService.ts` | NEW method `receiveAISourcedPurchaseOrder()` |
| `src/services/purchaseOrderStatusGuard.ts` | Fix: `fromStatus=RECEIVED` → always `PURCHASE_ORDER_ALREADY_RECEIVED` |
| `src/types/receivingBoundary.ts` | Add `RECEIVING_CONSUMED_LOCK_RETENTION_MS` constant |
| `src/services/__tests__/receivingTransactionService.test.ts` | NEW — 81 assertions |
| `docs/CURRENT_SSOT.md` | Updated to Phase 2 |
| `docs/FEATURE_002_RECEIVING_BOUNDARY_PHASE2.md` | This file |

---

## Test Summary

| Suite | Tests | Result |
|---|---|---|
| `receivingTransactionService.test.ts` | 81 | ✅ PASS |
| `purchaseOrderStatusGuard.test.ts` | 27 | ✅ PASS |
| `receivingBoundaryService.test.ts` | 35 | ✅ PASS |
| `receivingIdempotencyService.test.ts` | 23 | ✅ PASS |
| `receivingTransactionPlanService.test.ts` | 38 | ✅ PASS |
| **Total** | **204** | **✅ 0 failed** |
