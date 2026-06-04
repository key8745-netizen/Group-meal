# Feature 004 — Model Config Apply Boundary
## Phase 1: Pure Logic & Validation

---

## Scope

Phase 1 delivers the pure-logic ground layer for the Model Config Apply Boundary.
No Firestore reads or writes. No settings mutations. No real apply or rollback.
All helpers are deterministic pure functions covered by unit tests.

---

## Delivered Files

### New Types
- `src/types/modelConfigApply.ts` — all Feature 004 branded types, interfaces, and constants

### New Services
- `src/services/modelConfigDiffService.ts` — canonical JSON, pure SHA-256, diff calculator
- `src/services/modelConfigValidationService.ts` — tenant hard guard, caller guard, weight validator, apply/rollback plan validators
- `src/services/modelConfigVersionService.ts` — version generation helper, version builder
- `src/services/modelConfigApplyPlanService.ts` — `simulateModelConfigApplyPlan()` dry-run helper
- `src/services/modelConfigRollbackPlanService.ts` — `simulateModelConfigRollbackPlan()` dry-run helper
- `src/services/modelConfigApplyAuditService.ts` — `buildModelConfigAuditEvent()` pure helper

### New Tests
- `src/services/__tests__/modelConfigDiffService.test.ts` — 22 assertions
- `src/services/__tests__/modelConfigValidationService.test.ts` — 35 assertions
- `src/services/__tests__/modelConfigVersionService.test.ts` — 9 assertions
- `src/services/__tests__/modelConfigApplyPlanService.test.ts` — 21 assertions
- `src/services/__tests__/modelConfigRollbackPlanService.test.ts` — 20 assertions
- `src/services/__tests__/modelConfigApplyAuditService.test.ts` — 51 assertions

### Modified
- `src/types/aiBoundary.ts` — added 24 new `BlockedReason` members for Feature 004
- `docs/CURRENT_SSOT.md` — updated to Phase 1 state

### Docs
- `docs/FEATURE_004_MODEL_CONFIG_APPLY_PHASE1.md` (this file)

---

## Phase 1 Test Tally

| File | Assertions | Result |
|---|---|---|
| modelConfigDiffService | 22 | ✅ PASS |
| modelConfigValidationService | 35 | ✅ PASS |
| modelConfigVersionService | 9 | ✅ PASS |
| modelConfigApplyPlanService | 21 | ✅ PASS |
| modelConfigRollbackPlanService | 20 | ✅ PASS |
| modelConfigApplyAuditService | 51 | ✅ PASS |
| **Phase 1 Total** | **158** | **✅ PASS** |

Existing tests (Feature 001+002+003): 1026/1026 still passing.

---

## Key Design Decisions

### Tenant Hard Guard
All validate functions execute `assertTenantMatch` / `assertRollbackTenantMatch` as the **first** check.
On mismatch, validation returns immediately with a single `CONFIG_APPLY_TENANT_MISMATCH` or `CONFIG_ROLLBACK_TENANT_MISMATCH` error. No other errors are computed.

### Pure SHA-256 (no Node.js crypto)
`sha256Hash()` implements SHA-256 in pure TypeScript to avoid Node.js `crypto` module dependency, ensuring compatibility with the Vite browser build target.

### Weight Modes
Two weight modes are supported:
- `independent_multiplier`: each factor must be in `[0.5, 2.0]`; no sum constraint
- `normalized`: each factor must be a finite number; sum of all provided factors must be within epsilon (`0.0001`) of `1.0`

Bounds only apply in `independent_multiplier` mode. Normalized weights are not bounded per-factor (values like 0.35 are valid).

### Canonical JSON Determinism
`canonicalizeObject()` recursively sorts object keys before serialization. Array order is preserved. `undefined`, functions, and symbols are stripped. This guarantees `sha256Hash(canonicalJson(weights))` is identical regardless of object key insertion order.

### Rollback Design (Phase 1)
Rollback is modeled as a **dry-run plan only**:
- `simulateModelConfigRollbackPlan()` returns a `ModelConfigRollbackPlan` with `executable: false`, `aiCanRollback: false`, `humanApprovalRequired: true`
- Rollback requires its own human approval, auditTrailId, rollbackToken, and rollbackReason
- Rolling back to the same version is blocked (`CONFIG_ROLLBACK_SAME_VERSION`)
- No history is deleted or overwritten
- No Firestore write occurs

### AI Caller Blocked
`assertHumanCaller()` blocks `'ai'` and `'system'` callerTypes. This means even Admin SDK / service account callers that are not explicitly typed as `'human'` are blocked at the service guard level.

---

## Guard Rail Verification

| Guard Rail | Implementation | Evidence |
|---|---|---|
| AI cannot apply config | `assertHumanCaller` in `validateApplyPlanInput` | `modelConfigValidationService.test.ts` — AI caller test |
| AI cannot rollback | `assertHumanCaller` in `validateRollbackPlanInput` | `modelConfigRollbackPlanService.test.ts` — AI/system caller tests |
| Tenant mismatch → first error | `assertTenantMatch` returns immediately | Both validation test files — tenant mismatch: only 1 error returned |
| No Firestore read/write | No firebase import in any Phase 1 file | Import scan: CLEAN |
| No runTransaction | No runTransaction call anywhere | Import scan: CLEAN |
| `executable: false` | TypeScript literal type in interfaces | Apply + Rollback plan tests |
| `aiCanApply: false` | TypeScript literal type in interface | Apply plan tests |
| `aiCanRollback: false` | TypeScript literal type in interface | Rollback plan tests |
| `requiresHumanApproval: true` | TypeScript literal type in interface | Apply plan tests |
| `humanApprovalRequired: true` | TypeScript literal type in interface | Rollback plan tests |
| Diff hash is deterministic | canonical JSON + pure SHA-256 | Diff service tests: key-order independence |
| Weight bounds enforced | `validateWeights()` | Validation service weight tests |
| Normalized epsilon enforced | `NORMALIZED_WEIGHT_EPSILON = 0.0001` | Validation service normalized weight tests |

---

## Known Limitations

1. **Phase 1 is dry-run only** — no real Firestore write, no actual settings mutation
2. **SHA-256 pure TS implementation** — not FIPS-certified; acceptable for deterministic diffHash in this context; if FIPS compliance is required in future, replace with WebCrypto or Node crypto at Phase 2
3. **No UI** — apply/rollback UI is Phase 2+ scope
4. **No real approval record creation** — `HumanModelConfigApproval` is a type only; Firestore write is Phase 2+ scope
5. **No version conflict check against live Firestore** — Phase 1 validates structure only; live version conflict check requires Firestore read (Phase 2+)

---

## Phase 1 Boundary Confirmation

- [x] No `firebase-admin` import
- [x] No `google-cloud-firestore` import
- [x] No `runTransaction`
- [x] No `settings` mutation
- [x] No `settingsHistory` write
- [x] No real approval record creation
- [x] No real apply executed
- [x] No real rollback executed
- [x] No UI added
- [x] No Netlify Function added
- [x] No Feature 001 / 002 / 003 core flow changes
- [x] Tenant hard guard is first validation step
- [x] Canonical diff hash is deterministic
- [x] applyToken / rollbackToken are validation-only (not real idempotency locks)
- [x] Weight bounds implemented (both modes)
- [x] All 158 Phase 1 tests pass
- [x] Typecheck: 0 errors
- [x] Build: PASS
