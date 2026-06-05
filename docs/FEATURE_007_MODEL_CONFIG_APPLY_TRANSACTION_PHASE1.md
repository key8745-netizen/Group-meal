# Feature 007 Phase 1 — Pure Logic & Validation
# Real Model Config Apply Transaction Execution

---

## Phase 1 Scope

Phase 1 establishes the pure logic and validation foundation for real model config apply transaction execution. No Firestore read/write. No `runTransaction`. No real apply or rollback.

Five core components delivered:
1. **Default-deny service guard** — `validateRealModelConfigApplyEntrance`
2. **Canonicalization validator** — `validateCanonicalModelConfigHashInput` + `canonicalizeModelConfigForTransaction`
3. **Idempotency lock schema validator** — `validateApplyIdempotencyLockSchema` + `buildApplyIdempotencyLockSchema` + `classifyLockDuplicateBehavior`
4. **Transaction pseudo-plan builder** — `buildRealModelConfigApplyTransactionPseudoPlan`
5. **Audit event pure helper** — `buildRealModelConfigApplyAuditEventPayload`
6. **Static guard script** — `scripts/check-feature007-forbidden-patterns.js`

---

## Changed Files

### New Types

- `catering-system/src/types/realModelConfigApplyExecution.ts` (NEW)
  - `RealApplyCallerType = 'HUMAN' | 'AI' | 'UNKNOWN'`
  - `RealModelConfigApplyCallerContext`
  - `RealModelConfigApplyRequest`
  - `RealModelConfigApplyGuardResult`
  - `RealModelConfigApplyTransactionContract` — `executable: false, aiCanExecute: false, requiresHumanApproval: true`
  - `PseudoPlanStep` — `executable: false`
  - `RealModelConfigApplyPseudoPlan` — `executable: false, aiCanExecute: false, dryRunOnly: true, containsRunTransaction: false`
  - `RealApplyLockStatus = 'PENDING' | 'CONSUMED' | 'ABANDONED' | 'EXPIRED'`
  - `RealModelConfigIdempotencyLockSchema` — `aiCanOwnLock: false`
  - `RealModelConfigSettingsHistoryWriteContract` — `executable: false, aiCanExecute: false, immutable: true`
  - `RealApplyAuditEventType` — 7 event types
  - `RealModelConfigAuditEventPayload` — `executable: false, aiCanExecute: false`
  - `CanonicalizedModelConfigHashInput`
  - `CanonicalizationGuardResult`

- `catering-system/src/types/aiBoundary.ts` (MODIFIED)
  - Added 31 new `BlockedReason` values for Feature 007 Phase 1

### New Services

- `catering-system/src/services/realModelConfigApplyGuardService.ts` (NEW)
  - `validateRealModelConfigApplyEntrance(request)` — 12-step default-deny guard

- `catering-system/src/services/realModelConfigCanonicalizationService.ts` (NEW)
  - `validateCanonicalModelConfigHashInput(input)` — deterministic canonical JSON
  - `canonicalizeModelConfigForTransaction(config, expectedHash)` — hash match validation

- `catering-system/src/services/realModelConfigIdempotencySchemaService.ts` (NEW)
  - `buildApplyIdempotencyLockSchema(input)` — schema builder
  - `validateApplyIdempotencyLockSchema(schema)` — schema validator
  - `classifyLockDuplicateBehavior(candidate, existing)` — duplicate classification

- `catering-system/src/services/realModelConfigTransactionPseudoPlanService.ts` (NEW)
  - `buildRealModelConfigApplyTransactionPseudoPlan(input)` — 7-step non-executable plan

- `catering-system/src/services/realModelConfigExecutionAuditService.ts` (NEW)
  - `buildRealModelConfigApplyAuditEventPayload(input)` — pure audit payload helper

### New Tests

| Test File | Assertions |
|---|---|
| `realModelConfigApplyGuardService.test.ts` | 21 |
| `realModelConfigCanonicalizationService.test.ts` | 23 |
| `realModelConfigIdempotencySchemaService.test.ts` | 30 |
| `realModelConfigTransactionPseudoPlanService.test.ts` | 36 |
| `realModelConfigExecutionAuditService.test.ts` | 29 |
| **Phase 1 new total** | **139** |
| **Cumulative (all features)** | **648** |

### Static Guard

- `scripts/check-feature007-forbidden-patterns.js` (NEW)
  - Scans all `realModelConfig*` and `modelConfigRealApply*` service/type files
  - Blocks: `firebase-admin` import, `google-cloud-firestore` import, `.runTransaction(` call
  - Exit 1 on any violation (CI-ready)
  - Current result: **✅ PASS** — 0 violations across all scanned files

---

## Default-Deny Guard

### `validateRealModelConfigApplyEntrance`

12-step validation — **default behavior: DENY**:

| Step | Check | Blocked Reason |
|---|---|---|
| 1 | `tenantId` present | `REAL_EXEC_TENANT_MISMATCH` (early exit) |
| 2 | `callerContext` present | `REAL_EXEC_MISSING_CALLER_CONTEXT` (early exit) |
| 3 | `callerType === 'HUMAN'` | `REAL_EXEC_AI_CALLER_BLOCKED` / `REAL_EXEC_UNKNOWN_CALLER_TYPE` |
| 4 | Service Account alone insufficient | `REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT` |
| 5 | Admin SDK alone insufficient | `REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT` |
| 6 | `callerUserId` present | `REAL_EXEC_MISSING_HUMAN_USER_ID` |
| 7 | `approvalId` present | `REAL_EXEC_MISSING_APPROVAL_ID` |
| 8 | `auditTrailId` present | `REAL_EXEC_MISSING_AUDIT_TRAIL_ID` |
| 9 | `expectedCurrentVersion` present | `REAL_EXEC_MISSING_EXPECTED_VERSION` |
| 10 | `applyToken` present | `REAL_EXEC_MISSING_APPLY_TOKEN` |
| 11 | `newVersion` present | `REAL_EXEC_MISSING_NEW_VERSION` |
| 12 | `sourceRecommendationId` present | `REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID` |

**Admin SDK + human userId → ALLOWED** (Admin SDK is a transport, not an identity bypass)
**AI + Admin SDK → BLOCKED** (AI caller blocked regardless of credential)

---

## Canonicalization

### Spec v1.2 Compliance

| Input Type | Behavior |
|---|---|
| `object` | Keys sorted lexicographically at every depth |
| `array` | Order preserved (not sorted) |
| `Date` | `toISOString()` — deterministic |
| `null` | Preserved as JSON `null` |
| `number` | Preserved (NaN/Infinity blocked) |
| `string`, `boolean` | Preserved |
| `BigInt` | `REAL_EXEC_CANONICAL_BIGINT_BLOCKED` |
| `NaN` | `REAL_EXEC_CANONICAL_NAN_BLOCKED` |
| `Infinity / -Infinity` | `REAL_EXEC_CANONICAL_INFINITY_BLOCKED` |
| `undefined` | `REAL_EXEC_CANONICAL_UNDEFINED_BLOCKED` |
| `function` | `REAL_EXEC_CANONICAL_FUNCTION_BLOCKED` |
| `symbol` | `REAL_EXEC_CANONICAL_SYMBOL_BLOCKED` |
| Circular reference | `REAL_EXEC_CANONICAL_CIRCULAR_REFERENCE` |
| Invalid `Date` | `REAL_EXEC_CANONICAL_DATE_NOT_SERIALIZABLE` |

Hash: djb2 variant — deterministic, no crypto dependency, pure sync.

---

## Idempotency Lock Schema

### Lock Duplicate Behavior Classification

| Scenario | Behavior | Blocked Reason |
|---|---|---|
| Same token + same payload | `SAME_TOKEN_SAME_PAYLOAD_IDEMPOTENT` | None (idempotent replay) |
| Same token + different payload | `SAME_TOKEN_DIFFERENT_PAYLOAD_BLOCKED` | `REAL_EXEC_LOCK_DUPLICATE_TOKEN` |
| Same approvalId + different token | `SAME_APPROVAL_DIFFERENT_TOKEN_BLOCKED` | `REAL_EXEC_LOCK_APPROVAL_REUSE` |
| Stale `expectedCurrentVersion` | `STALE_EXPECTED_VERSION_BLOCKED` | `REAL_EXEC_LOCK_VERSION_CONFLICT` |
| No conflict | `NO_CONFLICT` | None |

Lock TTL: 300s. Grace period: 60s. Cleanup owner: `SYSTEM_MAINTENANCE`. `aiCanOwnLock: false`.

---

## Transaction Pseudo-plan

### 7-step Plan (Non-executable)

| Step | Name | Description |
|---|---|---|
| 1 | `SERVICE_GUARD_VALIDATION` | Validate caller, tenant, required fields |
| 2 | `APPROVAL_VALIDATION` | Read persisted approval, validate status |
| 3 | `SETTINGS_CURRENT_VERSION_READ` | Read settings, validate currentVersion and configHash |
| 4 | `IDEMPOTENCY_LOCK_CHECK_AND_WRITE` | Check and write idempotency lock |
| 5 | `SETTINGS_HISTORY_WRITE` | Write immutable settingsHistory new version |
| 6 | `SETTINGS_CURRENT_VERSION_UPDATE` | Update settings currentVersion |
| 7 | `AUDIT_EVENT_WRITE` | Write audit event |

**Hard invariants on plan:**
- `executable: false`
- `aiCanExecute: false`
- `dryRunOnly: true`
- `containsRunTransaction: false`
- `containsWriteFunction: false`
- `containsDeleteFunction: false`
- `containsFirestoreReference: false`

---

## Firestore Confirmation

- No Firestore read
- No Firestore write
- No `firebase-admin` import
- No `google-cloud-firestore` import
- No `runTransaction` call
- No `settings` mutation
- No `settingsHistory` write
- No real apply executed
- No real rollback executed
- No real cleanup job created
- No real approval record created
- No UI added
- No Netlify Function added
- No Cloud Function added

---

## Phase 2 Forward Items

1. Caller reads persisted approval from Firestore inside `runTransaction` before calling guard — currently approval validation is structural only.
2. Settings current version read must occur inside `runTransaction` — currently modeled as a pseudo-plan step.
3. Idempotency lock write must occur inside `runTransaction` — currently schema only.
4. `settingsHistory` write must occur inside `runTransaction` — currently write contract only.
5. `settings` update must occur inside same `runTransaction` as `settingsHistory` write — currently pseudo-plan step.
6. Real audit event must be written inside `runTransaction` or via committed audit trail append — currently pure payload.
7. Phase 2 must define the `runTransaction` executor service that calls all Phase 1 validators in order.
