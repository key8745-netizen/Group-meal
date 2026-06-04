# Feature 004: Model Config Apply Boundary — Phase 4 Delivery
# Final Dry-run Integration & Release Gate Preparation

**Delivered:** 2026-06-04
**Branch:** `claude/busy-heisenberg-HcwYg`
**Phase 3 base commit:** `9b20e4c`

---

## Phase 4 Objective

Feature 004 dry-run closeout — prove that the full pipeline from Feature 003 `ModelConfigRecommendation` through to `ModelConfigApplyPlan`, `ModelConfigRollbackPlan`, and audit event remains **permanently non-executable**, with no Firestore access, no real approval, no real apply, and no real rollback.

---

## New File: `src/services/__tests__/modelConfigFinalIntegration.test.ts`

**109 assertions** across 12 test sections:

| Section | Coverage |
|---|---|
| 1. Recommendation guard invariants | `aiCanApply: false`, `requiresHumanApproval: true`, tenantId/auditTrailId |
| 2. createSimulatedHumanApproval | `_kind`, `persisted: false`, `executable: false`, `aiCanApprove: false`, no Firestore fields |
| 3. Token binding | `generateApplyToken`, `generateRollbackToken`, 64-char, deterministic, different tokens |
| 4. createApplyPlanFromRecommendation | `_kind: 'model_config_apply_plan_dry_run'`, all guard literals, no forbidden fields, 9 continuity checks |
| 5. Rollback plan invariants | `_kind: 'model_config_rollback_plan_dry_run'`, guard literals, no forbidden fields, version continuity |
| 6. Audit event continuity | all 7 continuity fields, 4 guard literals, metadata completeness |
| 7. Standalone rollback | `createRollbackPlanFromApplyPlan`, invariants, version reversion |
| 8. Pipeline determinism | 3 hash reproducibility assertions |
| 9. Blocked pipeline | guard invariants preserved even on blocked path |
| 10. No Firestore / no real write | structural check on all 4 output objects |
| 11. Type-safe discrimination helpers | `isSimulatedApproval`, `isDryRunApplyPlan`, `isDryRunRollbackPlan` |
| 12. Pure functions / no I/O | all 4 pipeline functions synchronous |

---

## Rollback Token / Future Transaction Alignment

### Current Status (Phase 4)

`rollbackToken` and `applyToken` are **validation-only**. They:
- Are deterministically computed from bound fields (SHA-256 of canonical JSON)
- Are included in plan objects and audit events as idempotency planning records
- **Do not execute any transaction**
- **Do not write to Firestore**
- **Do not lock any document**

### Future Real Rollback Requirements (out of scope for Feature 004)

If a future feature implements real config rollback, it **must**:

1. Require explicit human approval (separate `humanApprovalId` required)
2. Execute inside a single Firestore `runTransaction` with version conflict check:
   - Read current `settings/{tenantId}` within the transaction
   - Verify `settings.configVersion === rollbackPlan.currentVersion`
   - If mismatch → abort with `CONFIG_ROLLBACK_VERSION_CONFLICT`
3. Acquire an idempotency lock keyed on `rollbackToken` before the transaction
4. Append an audit event (never overwrite history)
5. Never delete or overwrite `settingsHistory` documents
6. Block all `callerType !== 'human'` paths
7. Verify `tenantId === targetTenantId` before any write
8. Be implemented in a **separate future Feature** (Feature 005+)

### Token Binding Ensures Future Safety

Because `rollbackToken = SHA256(tenantId + rollbackTargetVersion + currentVersion + auditTrailId + rollbackReason)`, any future real rollback service can use the same token as an idempotency key — preventing duplicate rollback execution without requiring a database lock during the planning phase.

---

## Simulated Approval Long-term Type Isolation

`SimulatedHumanModelConfigApproval` is structurally and nominally distinct from `HumanModelConfigApproval`:

| Field | `SimulatedHumanModelConfigApproval` | `HumanModelConfigApproval` |
|---|---|---|
| `_kind` | `'simulated_human_model_config_approval'` | `'model_config_approval'` |
| `persisted` | `false` (literal) | — (absent) |
| `executable` | `false` (literal) | — (absent) |

TypeScript's structural type system enforces this: assigning a `SimulatedHumanModelConfigApproval` where a `HumanModelConfigApproval` is expected produces a compile error because `persisted` and `executable` are required readonly fields not present on `HumanModelConfigApproval`.

Any future real apply service that accepts `HumanModelConfigApproval` **cannot** accept `SimulatedHumanModelConfigApproval` — the compile-time discriminant prevents accidental unlock of real apply from a simulated approval.

---

## Feature 004 Dry-run Release Gate Checklist

| Gate | Status |
|---|---|
| ✅ No Firestore read/write | Verified — no `db`, `getFirestore`, `runTransaction` in any Feature 004 service |
| ✅ No `firebase-admin` import | Verified — not imported anywhere in Feature 004 files |
| ✅ No `google-cloud-firestore` import | Verified |
| ✅ No `runTransaction` | Verified |
| ✅ No UI added | Verified — no changes to `src/components/`, `src/pages/`, `src/hooks/` |
| ✅ No Netlify Function added | Verified — no changes to `netlify/functions/` |
| ✅ No real approval record | `SimulatedHumanModelConfigApproval.persisted === false` on all paths |
| ✅ No real apply | `ModelConfigApplyPlan.executable === false` on all paths |
| ✅ No real rollback | `ModelConfigRollbackPlan.executable === false` on all paths |
| ✅ Apply plan `executable: false` | Literal type + runtime assertion (109 integration tests) |
| ✅ Rollback plan `executable: false` | Literal type + runtime assertion |
| ✅ `aiCanApply: false` | All plan and audit paths |
| ✅ `aiCanRollback: false` | All plan and audit paths |
| ✅ `aiCanApprove: false` | All approval paths |
| ✅ Simulated approval `persisted: false` | Literal readonly field |
| ✅ Tenant guard enforced | First check in all validate functions; `BLOCKED` on mismatch |
| ✅ Diff hash deterministic | SHA-256 of canonical JSON; 33 token-binding + 22 diff tests |
| ✅ Token binding tested | `generateApplyToken` binds 7 fields; `generateRollbackToken` binds 5 |
| ✅ Audit payload complete | `aiCanApply`, `aiCanRollback`, `executable`, `applyToken`, `configBeforeHash/After`, `proposedNewVersion` |
| ✅ Feature 003 continuity verified | 109-assertion integration test covers full pipeline |
| ✅ No forbidden fields on plan objects | `apply`, `execute`, `commit`, `write`, `runTransaction`, `settingsPath`, `firestorePath` all absent |
| ✅ Tests pass | All assertions pass |
| ✅ Typecheck pass | `npm run typecheck` — clean |
| ✅ Build pass | `npm run build` — success |

---

## Complete Test Tally — Feature 004

| Phase | File | Assertions |
|---|---|---|
| Phase 1 | modelConfigDiffService | 22 |
| Phase 1 | modelConfigValidationService | 35 |
| Phase 1 | modelConfigVersionService | 9 |
| Phase 1 | modelConfigApplyPlanService | 21 |
| Phase 1 | modelConfigRollbackPlanService | 20 |
| Phase 1 | modelConfigApplyAuditService | 79 (base 51 + Phase 3 expanded) |
| Phase 2 | modelConfigRecommendationApplyAdapterService | 57 (base 52 + Phase 3 expanded) |
| Phase 3 | modelConfigTokenBindingService | 33 |
| Phase 3 | modelConfigRecommendationService | 29 |
| Phase 4 | modelConfigFinalIntegration | 109 |
| **Total** | | **414** |

---

## AI Safety Invariants — Final Verified State

All invariants hold across all code paths including blocked paths:

| Invariant | Value | Scope |
|---|---|---|
| `aiCanApply` | `false` (literal) | `ModelConfigApplyPlan`, audit metadata |
| `aiCanRollback` | `false` (literal) | `ModelConfigRollbackPlan`, audit metadata |
| `aiCanApprove` | `false` (literal) | `SimulatedHumanModelConfigApproval` |
| `executable` | `false` (literal) | Apply plan, rollback plan, simulated approval, audit metadata |
| `requiresHumanApproval` | `true` (literal) | Apply plan |
| `humanApprovalRequired` | `true` (literal) | Rollback plan |
| `persisted` | `false` (literal) | Simulated approval |
| `_kind` | `'model_config_apply_plan_dry_run'` | Apply plan |
| `_kind` | `'model_config_rollback_plan_dry_run'` | Rollback plan |
| `_kind` | `'simulated_human_model_config_approval'` | Simulated approval |

---

## Known Limitations

1. **No real apply path** — Feature 004 is intentionally dry-run only. Real apply requires a separate future feature with human-in-the-loop Firestore transaction.
2. **Tokens are planning-only** — `applyToken` and `rollbackToken` are computed deterministically but not yet used as Firestore idempotency locks.
3. **Simulated approval not persisted** — A real approval record would need to be written to Firestore by a separate human-facing flow (out of scope).
4. **No settings write** — Feature 004 reads `ModelConfigVersion` from memory; it does not read from or write to `settings/{tenantId}`.
