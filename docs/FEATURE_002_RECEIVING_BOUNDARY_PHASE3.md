# Feature 002 Phase 3 — UI Integration & End-to-End Testing

## Overview

Phase 3 connects the Phase 2 guarded receiving transaction service to the UI.
The UI never writes Firestore directly — all writes flow through
`purchaseOrderService.receiveAISourcedPurchaseOrder()` → `receivingTransactionService`.

---

## Component: ReceivingConfirmationDialog

**Path**: `src/components/receiving/ReceivingConfirmationDialog.tsx`

### Safety invariants (hard-coded, must not be removed)

1. **No direct Firestore writes** — service is called via dynamic import.
2. **Submit button disabled during submission** — `loading` state set on click; `submitted` flag prevents any re-submission after success.
3. **Irreversible warning always visible** — `data-testid="irreversible-warning"` rendered unconditionally.
4. **Delta > 15% requires note** — `canSubmit` gates on `receivingNote` when `deltaInfo.requiresNote`.
5. **Backend is the final gate** — UI guards are defence-in-depth; backend `validateReceivingBeforeWrite()` always runs inside the transaction.

### Unit conversion

All quantity parsing goes through `toGrams()` from `unitConversionService`:

| Unit | Conversion |
|---|---|
| kg | `Math.round(n * GRAMS_PER_KG)` → `toGrams(result, 'grams')` |
| 台斤 | `Math.round(n * GRAMS_PER_TAIJIN)` → `toGrams(result, 'grams')` |
| grams | `Math.round(n)` → `toGrams(result, 'grams')` |

**`taijin * 0.6` is never used.** The constant `GRAMS_PER_TAIJIN = 600` is used exclusively.

### Button labels

| Label | Allowed |
|---|---|
| `確認收貨並更新庫存` | ✅ Only allowed confirm action |
| `取消` | ✅ |
| `處理中…` (loading) | ✅ |
| `已送出` (post-submit) | ✅ |
| `完成` / `確認` / `OK` / `入庫` / `送出` / `自動採購` | ❌ Forbidden |

---

## Exported Pure Helpers

| Function | Description |
|---|---|
| `computeReceivingDelta(orderedGrams, receivedGrams)` | Computes delta, percent, requiresNote flag |
| `parseReceivingQtyToGrams(rawValue, unit)` | Parses input string + unit → Grams (null on invalid) |
| `formatGramsDisplay(grams)` | Display string with g / kg / 台斤 |

These are pure functions — no Firestore, no React — fully unit-tested.

---

## Duplicate Submit Prevention

**UI layer:**
- `loading` flag: button disabled while request is in flight.
- `submitted` flag: set after first successful submission; `canSubmit` remains false.
- A new `receivingToken` is generated per dialog instance via `Date.now()`.

**Backend layer (final guard):**
- Idempotency lock at `receiving_locks/{purchaseOrderId}_{receivingToken}`.
- CONSUMED lock → `DUPLICATE_RECEIVING_ATTEMPT` blocks any retry.

---

## Network Failure / Retry Behaviour

If the network fails mid-request:
- `loading` is cleared; error is displayed.
- The `submitted` flag is NOT set (submission didn't succeed).
- The user may retry, which generates a **new** `receivingToken` (new dialog instance) or reuses the same one.
- Backend idempotency ensures that even if the same token is retried and the first attempt succeeded (lock CONSUMED), the retry is blocked cleanly.

---

## E2E Scenarios Covered by Tests

| Scenario | Test location | Result |
|---|---|---|
| Normal receive: PENDING + human + exact qty | ReceivingConfirmationDialog.test.tsx | ✅ |
| Delta ≤15% without note: allowed | ReceivingConfirmationDialog.test.tsx | ✅ |
| Delta >15% without note: UI requiresNote=true | ReceivingConfirmationDialog.test.tsx | ✅ |
| Delta >15% without note: backend blocks | ReceivingConfirmationDialog.test.tsx | ✅ |
| Delta >15% with note: allowed end-to-end | ReceivingConfirmationDialog.test.tsx | ✅ |
| Duplicate/retry: CONSUMED lock blocks | ReceivingConfirmationDialog.test.tsx | ✅ |
| AI caller: blocked by backend | ReceivingConfirmationDialog.test.tsx | ✅ |
| DRAFT → RECEIVED: blocked | ReceivingConfirmationDialog.test.tsx | ✅ |
| 台斤 conversion: exact integer (not float drift) | ReceivingConfirmationDialog.test.tsx | ✅ |
| Irreversible warning visible | ReceivingConfirmationDialog.test.tsx (testId check) | ✅ |
| No performanceLogs written | Phase 2 + delegation chain | ✅ |

---

## Files Added / Modified

| File | Change |
|---|---|
| `src/components/receiving/ReceivingConfirmationDialog.tsx` | NEW — UI component with pure helpers |
| `src/components/receiving/__tests__/ReceivingConfirmationDialog.test.tsx` | NEW — 87 assertions |
| `docs/CURRENT_SSOT.md` | Updated to Phase 3 |
| `docs/FEATURE_002_RECEIVING_BOUNDARY_PHASE3.md` | This file |

---

## Test Summary

| Suite | Tests | Result |
|---|---|---|
| `ReceivingConfirmationDialog.test.tsx` | 87 | ✅ PASS |
| `receivingTransactionService.test.ts` | 81 | ✅ PASS |
| `purchaseOrderStatusGuard.test.ts` | 27 | ✅ PASS |
| `receivingBoundaryService.test.ts` | 35 | ✅ PASS |
| `receivingIdempotencyService.test.ts` | 23 | ✅ PASS |
| `receivingTransactionPlanService.test.ts` | 38 | ✅ PASS |
| **Total** | **291** | **✅ 0 failed** |
