# AI Context Snapshot — Phase 2 Architecture

> Feature 001 v1.3 | Phase 2 | Last updated: 2026-06-03

## Data Flow

```
verified Firestore input (pre-fetched, tenant-scoped)
  ↓
buildAIContextSummary()          ← aiContextSummaryService.ts
  ↓
AIContextSummary                 ← pure value, no raw data
  ↓
generateAIContextSnapshot()      ← THE ONLY AUTHORISED ENTRY POINT
  · validateAIOperationOrThrow() ← identity guard first
  · createAIContextSnapshot()    ← wraps summary in snapshot envelope
  · createAuditEvent('SNAPSHOT_GENERATED')
  ↓
GenerateAIContextSnapshotResult  ← { snapshot, auditEvent }
  ↓
validateSnapshotForSuggestion()  ← before any AI suggestion use
```

Phase 3 will add Firestore persistence between `generateAIContextSnapshot` and
`validateSnapshotForSuggestion`. The interface is stable; only the persistence
step is missing.

---

## The Snapshot Is a Frosted Window, Not a Surveillance Camera

`AIContextSnapshot` contains only aggregated summary data:

| Allowed in Snapshot | Forbidden in Snapshot |
|---|---|
| `AIContextSummary` | Raw inventory transactions |
| Per-ingredient grams totals | Raw performance logs |
| Record counts per collection | Raw purchase order line items |
| Contamination flags | Raw OCR text or images |
| Source collection names | Customer personal data |
| Cache key | Supplier sensitive data |
| Mode / expiry metadata | Unverified BOM details |

Any field that would expose raw operational data must never appear in
`AIContextSnapshot` or `AIContextSummary`.

---

## Unique Entry Point Rule

`generateAIContextSnapshot()` in `aiContextSnapshotService.ts` is the **only**
authorised way to create an `AIContextSnapshot`. All other code must call this
function — never construct a snapshot object directly.

This ensures:
1. `validateAIOperationOrThrow()` always runs before snapshot creation
2. A `SNAPSHOT_GENERATED` audit event is always produced
3. OCR contamination from summary is always promoted to the snapshot level

---

## Guard Rails (Enforced at Runtime)

### Identity Checks (via `validateAIOperationOrThrow`)
- `callerType` must be present and valid (`'human'`, `'ai'`, or `'system'`)
- `tenantId` must be present and non-empty — no env var fallback
- `callerId` must be present and non-empty
- `requestId` must be present and non-empty

### OCR / Contamination
- `source: 'ocr'` items are **always** excluded from summary, even if `verified: true`
- `isOcr: true && verified !== true` items are excluded and flagged
- `sourceCollections` containing `ocr_staging` or `pending_menu_imports` → `contaminationDetected: true`
- `summary.blockedReasons` including `UNVERIFIED_OCR_SOURCE` → promotes `contaminationDetected` on snapshot

### Snapshot Validation (`validateSnapshotForSuggestion`)
| Check | Blocked Reason |
|---|---|
| `tenantId` missing | `MISSING_TENANT_ID` |
| `snapshotId` missing | `MISSING_SNAPSHOT_ID` |
| `mode === 'debug'` | `SNAPSHOT_DEBUG_NOT_ALLOWED` |
| `expiresAt ≤ now` | `EXPIRED_SNAPSHOT` |
| `contaminationDetected` | `UNVERIFIED_OR_CONTAMINATED_SOURCE` |
| Total records > 500 (summary) / 2000 (debug) | `SNAPSHOT_TOO_LARGE` |
| `summary` missing | `INCOMPLETE_BOM` |
| `summary.tenantId ≠ snapshot.tenantId` | `TENANT_MISMATCH` |
| `summary.blockedReasons` non-empty | propagated |

### Debug Mode
- Debug snapshots require `requireDebugModePermission({ callerType, hasAdminPermission: true })`
- AI callers (`callerType: 'ai'`) are always blocked from creating debug snapshots
- Debug snapshots **always** fail `validateSnapshotForSuggestion` with `SNAPSHOT_DEBUG_NOT_ALLOWED`
- No debug snapshot may ever be used to generate an AI suggestion

### Grams Integrity
All quantity fields in `AIContextSummary` use the `Grams` branded type and are
produced via `asGrams()` runtime assertion. A bare `number` cannot be assigned
to any grams field without explicit validation.

Fields covered:
- `InventoryIngredientSummary.currentStockGrams`
- `InventoryIngredientSummary.safetyStockGrams`
- `requiredQtyGramsByIngredient[*]`
- `shortageQtyGramsByIngredient[*]`
- `recentPurchaseTotalsGramsByIngredient[*]`
- `averageDailyUsageGramsByIngredient[*]`
- `WasteRiskSummary.recentWasteGrams`

---

## Aggregation Formulas

```
requiredQtyGrams[ingredient] =
  Σ over meal plans:
    toGrams(bom.quantity, bom.unit) × headCount × (1 + wasteFactor)

shortageQtyGrams[ingredient] =
  max(requiredQtyGrams + safetyStockGrams − currentStockGrams, 0)

averageDailyUsageGrams[ingredient] =
  Σ verified+finalized usedGrams (last 30 days) / 30
  [if < 30 days of data → warning added, HIGH confidence not supported]

recentPurchaseTotals[ingredient] =
  Σ RECEIVED purchase order quantities (last 30 days, verified only, no OCR)
```

---

## Phase 3 Checklist

- [ ] `generateAIContextSnapshot()` writes snapshot to `ai_context_snapshots/{snapshotId}`
- [ ] `auditEvent` from `GenerateAIContextSnapshotResult` persisted to `ai_audit_trails`
- [ ] `validateAuditAppend()` called before persisting audit event
- [ ] `invalidateSnapshotCache(tenantId)` wired to RECEIVED purchase orders
- [ ] `computeAuditEventHash()` upgraded from djb2 to Web Crypto SHA-256
- [ ] Snapshot fetch (by cacheKey) added to `generateAIContextSnapshot` to avoid duplicates
- [ ] `ai_context_snapshots` added to `AI_ALLOWED_WRITE_COLLECTIONS` in `aiBoundaryService.ts`
