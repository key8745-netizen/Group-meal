# Feature 004 Phase 3 — Type Hardening + Token Binding + Canonical JSON Edge Cases

## Delivery Summary

### 1. Simulated Approval Type Isolation

`SimulatedHumanModelConfigApproval` is now a fully distinct interface from `HumanModelConfigApproval`:

- `_kind: 'simulated_human_model_config_approval'` (previously `'model_config_approval'`)
- `persisted: false` — hard readonly invariant: never a database record
- `executable: false` — hard readonly invariant: cannot trigger any apply action
- `aiCanApprove: false` — hard invariant: AI can never approve config changes

The adapter service (`modelConfigRecommendationApplyAdapterService.ts`) now operates exclusively on `SimulatedHumanModelConfigApproval`. `HumanModelConfigApproval` is no longer referenced in the adapter or its tests.

### 2. `_kind` Hardening for Apply Plan and Rollback Plan

| Type | Old `_kind` | New `_kind` |
|---|---|---|
| `ModelConfigApplyPlan` | `'model_config_apply_plan'` | `'model_config_apply_plan_dry_run'` |
| `ModelConfigRollbackPlan` | `'model_config_rollback_plan'` | `'model_config_rollback_plan_dry_run'` |

The `_dry_run` suffix is encoded in the discriminant, making it structurally impossible for any code to confuse a plan with an executed record.

### 3. Token Binding

Two new token generators in `modelConfigDiffService.ts`:

- `generateApplyToken(ApplyTokenPayload): ApplyToken` — SHA-256 of canonical JSON over 7 fields: `tenantId`, `sourceRecommendationId`, `humanApprovalId`, `previousVersion`, `proposedNewVersion`, `auditTrailId`, `diffHash`
- `generateRollbackToken(RollbackTokenPayload): RollbackToken` — SHA-256 of canonical JSON over 5 fields: `tenantId`, `rollbackTargetVersion`, `currentVersion`, `auditTrailId`, `rollbackReason`

Both tokens are:
- Deterministic (same inputs → same 64-char hex token)
- Key-order independent (canonical JSON sorts keys before hashing)
- Namespace-distinct (apply and rollback tokens over different field sets)

### 4. Canonical JSON Fixes

`canonicalizeObject` now handles:
- **`Date` objects** → `.toISOString()` (deterministic serialisation)
- **Circular references** → throws `'Circular reference in canonical JSON'` immediately
- **`undefined` / `function` / `symbol` values** → stripped from output
- **`seen: WeakSet<object>` parameter** propagated recursively for O(n) circular detection

### 5. Audit Event Metadata — New Fields

`ModelConfigAuditEvent.metadata` now includes:

```typescript
aiCanRollback: false;
applyToken: ApplyToken | null;
rollbackToken: RollbackToken | null;
configBeforeHash: DiffHash | null;
configAfterHash: DiffHash | null;
proposedNewVersion: ConfigVersion | null;
rollbackTargetVersion: ConfigVersion | null;
executable: false;
```

All fields default to `null` / `false` unless explicitly provided to `buildModelConfigAuditEvent`.

### 6. New Test Coverage

| Test file | Assertions | Scope |
|---|---|---|
| `modelConfigDiffService.test.ts` | 22 | SHA-256, canonical JSON, diff |
| `modelConfigTokenBindingService.test.ts` | 33 | Token determinism, key-order independence, canonical edge cases |
| `modelConfigApplyPlanService.test.ts` | 21 | Apply plan dry-run, guard invariants |
| `modelConfigRollbackPlanService.test.ts` | 20 | Rollback plan dry-run, guard invariants |
| `modelConfigApplyAuditService.test.ts` | 79 | Audit event fields including new Phase 3 metadata |
| `modelConfigRecommendationApplyAdapterService.test.ts` | 57 | Full pipeline, simulated approval isolation, `_kind` hardening |

**Total Phase 3 assertions: 232**

### 7. Guard Rail Verification

All plan and audit outputs carry unchangeable invariants:

| Guard | Value |
|---|---|
| `executable` | `false` |
| `aiCanApply` | `false` |
| `aiCanRollback` | `false` |
| `requiresHumanApproval` | `true` |
| `SimulatedHumanModelConfigApproval.persisted` | `false` |
| `SimulatedHumanModelConfigApproval.executable` | `false` |
| `SimulatedHumanModelConfigApproval.aiCanApprove` | `false` |

No Firestore writes, no UI changes, no Netlify function changes.

### 8. Phase Tally

- Phase 1: 158 assertions
- Phase 2: 52 assertions
- Phase 3: 232 assertions (net new from token binding test: 33; audit new fields: +28 across event loop; adapter isolation: +9)
- **Cumulative: 442 assertions**
