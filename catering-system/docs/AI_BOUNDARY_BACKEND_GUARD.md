# AI Decision Boundary — Backend Guard

> Feature 001 v1.3 | Phase 1 Patch | Last updated: 2026-06-03

## Why This Document Exists

Firestore Security Rules are enforced only for client SDK connections.
**Admin SDK (used by all Netlify Functions) bypasses Security Rules entirely.**

This means every AI-initiated Netlify Function that writes to Firestore must
manually call `validateAIOperationOrThrow()` before any write.
There is no automated safety net at the Firebase layer.

---

## Mandatory Guard Pattern

Every AI Netlify Function that performs a Firestore write must follow this pattern:

```typescript
import { validateAIOperationOrThrow, AIOperationBlockedError } from '@/services/aiBoundaryService';
import type { AIOperationRequest } from '@/types/aiBoundary';

export const handler = async (event) => {
  const request: AIOperationRequest = {
    operationId:      generateOperationId(),   // unique per call
    tenantId:         tenantId,
    callerType:       'ai',
    callerId:         'netlify-ai-suggestion-fn',
    targetCollection: 'ai_suggestions',
    targetPath:       `ai_suggestions/${suggestionId}`,
    action:           'create',
    payloadSummary:   { tenantId, /* summarised fields only */ },
    sourceSnapshotId: snapshotId,   // REQUIRED for all AI writes
    auditTrailId:     auditTrailId, // REQUIRED for all AI writes
    suggestionId:     suggestionId,
    requestId:        requestId,
    createdAt:        new Date(),
  };

  // MUST be called before any Firestore write. Throws if blocked.
  try {
    validateAIOperationOrThrow(request);
  } catch (err) {
    if (err instanceof AIOperationBlockedError) {
      return { statusCode: 403, body: JSON.stringify({ blocked: true, reasons: err.blockedReasons }) };
    }
    throw err;
  }

  // Only reaches here if the operation is permitted.
  await db.collection('ai_suggestions').doc(suggestionId).set({ ... });
};
```

---

## Collections the AI May Write

| Collection | Requires |
|---|---|
| `ai_suggestions` | `sourceSnapshotId` + `auditTrailId` + `suggestionId` |
| `ai_suggestion_feedback` | `suggestionId` + `auditTrailId` |
| `draft_purchase_suggestions` | `suggestionId` + `auditTrailId` |
| `ai_audit_trails` | nothing extra (first event bootstraps the trail) |

## Collections the AI May NEVER Write

`inventory`, `settings`, `confirmedMenus`, `confirmedBOM`, `inventoryTransactions`

The AI must also never set:
- `currentStockGrams` / `currentStockKg` (any collection)
- `status = 'RECEIVED'` on `purchaseOrders`
- `finalized = true` (any collection)

---

## Phase 2 / Phase 3 Integration Checklist

- [ ] All Netlify Functions that perform AI writes call `validateAIOperationOrThrow()` at entry
- [ ] `aiAuditTrailHelper.computeAuditEventHash()` upgraded from djb2 to SHA-256 (Web Crypto)
- [ ] `validateAuditAppend()` called before every `events.push()` in audit trail updates
- [ ] Snapshot freshness checked (`expiresAt > Date.now()`) before generating any suggestion
- [ ] `invalidateSnapshotCache(tenantId)` called after every RECEIVED / approved purchase order
- [ ] OCR-sourced data blocked from AI suggestions until `verified = true` is set by a human
- [ ] Admin SDK service account follows least-privilege: read-only on all collections except the allowed write list above
