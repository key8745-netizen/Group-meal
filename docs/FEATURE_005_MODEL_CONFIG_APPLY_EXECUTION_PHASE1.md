# Feature 005 Phase 1 — Model Config Apply Execution (Pure Logic & Validation)

## Phase 1 Objective

Establish the pure TypeScript foundation for safe, auditable, human-gated model config apply and rollback execution. All logic is side-effect-free, no Firestore writes, no real apply/rollback. Every execution path enforces `aiCanExecute: false`, `executable: false`, `requiresHumanApproval: true`.

## Files Created / Modified

### Modified
| File | Change |
|---|---|
| `src/types/aiBoundary.ts` | Added 34 new `BlockedReason` members for Feature 005 (already present) |

### Created (Types)
| File | Purpose |
|---|---|
| `src/types/modelConfigApplyExecution.ts` | All Phase 1 execution types (already present) |

### Created (Services)
| File | Purpose |
|---|---|
| `src/services/modelConfigCanonicalHashService.ts` | Canonical JSON + pure SHA-256 hashing (already present) |
| `src/services/modelConfigIdempotencyService.ts` | Apply/rollback token generation + idempotency lock plan builder (already present) |
| `src/services/modelConfigApplyPreflightService.ts` | Apply execution preflight validation (already present) |
| `src/services/modelConfigRollbackPreflightService.ts` | Rollback execution preflight validation (NEW) |
| `src/services/modelConfigSettingsHistoryService.ts` | Settings history version + write plan + update plan builders (NEW) |
| `src/services/modelConfigTransactionPlanService.ts` | Apply + rollback transaction plan builders (NEW) |
| `src/services/modelConfigExecutionAuditService.ts` | Execution audit event builder (NEW) |

### Created (Tests)
| File | Assertions |
|---|---|
| `src/services/__tests__/modelConfigCanonicalHashService.test.ts` | 22 |
| `src/services/__tests__/modelConfigApplyPreflightService.test.ts` | 15 |
| `src/services/__tests__/modelConfigRollbackPreflightService.test.ts` | 14 |
| `src/services/__tests__/modelConfigTransactionPlanService.test.ts` | 26 |
| `src/services/__tests__/modelConfigIdempotencyService.test.ts` | 13 |
| `src/services/__tests__/modelConfigSettingsHistoryService.test.ts` | 20 |
| `src/services/__tests__/modelConfigExecutionAuditService.test.ts` | 33 |

**Total assertions: 143**

## AI Safety Invariants Confirmed

All generated objects and plans enforce the following hard invariants at the TypeScript type level and at runtime:

| Invariant | Where enforced |
|---|---|
| `aiCanExecute: false` | `ModelConfigApplyTransactionPlan`, `ModelConfigRollbackTransactionPlan`, `AuditEventPlan`, `ModelConfigExecutionAuditEvent.metadata` |
| `executable: false` | Same as above |
| `requiresHumanApproval: true` | `ModelConfigApplyTransactionPlan`, `ModelConfigRollbackTransactionPlan`, `ModelConfigExecutionAuditEvent.metadata` |
| `aiCanApprove: false` | `PersistedHumanModelConfigApproval`, `PersistedHumanModelConfigRollbackApproval` |
| `persisted: true` | Both persisted approval types (distinguishes from simulated approvals) |
| `immutable: true` | `SettingsHistoryWritePlan`, `SettingsHistoryVersion` |
| `appendOnly: true` | `SettingsHistoryWritePlan` |
| `planOnly: true` | `IdempotencyLockPlan` |
| Tenant guard FIRST | Both preflight services return early on tenant mismatch before any other checks |
| AI caller block | Both preflight services push `EXEC_AI_CALLER_BLOCKED` / `ROLLBACK_EXEC_AI_CALLER_BLOCKED` when `callerType === 'ai'` |

## Known Limitations

- No actual Firestore writes — all plans are pure data structures describing *what would be done*
- No real transaction execution — `runTransaction` is never called anywhere in Phase 1
- Token generation uses pure in-process SHA-256 (no Node.js crypto) — browser-compatible
- `SettingsHistoryWritePlan.sourceRecommendationId` falls back to empty string (`''`) when null (for rollback plans); Phase 2 may tighten this

## No Firestore / No Real Apply / No Real Rollback Confirmation

- Zero imports of `firebase-admin`, `google-cloud-firestore`, or any Firestore SDK in Phase 1 files
- Zero calls to `runTransaction`, `set`, `update`, `delete`, or `batch` in Phase 1 files
- All returned objects are plain data with no async methods
- Settings are never modified

## Rollback Token Future Alignment Note

The rollback token is generated deterministically from `(tenantId, approvalId, rollbackTargetVersion, expectedCurrentVersion, auditTrailId, rollbackReason)`. Phase 2 (real execution) must verify this token matches the stored rollback approval token before proceeding with any Firestore write.
