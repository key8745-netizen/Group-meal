/**
 * Feature 005 Phase 4 — Rollback Boundary Hardening Tests
 *
 * Covers:
 *   Section 1: rollbackReason boundaries (8 assertions)
 *   Section 2: rollbackTargetVersion boundaries (5 assertions)
 *   Section 3: idempotency VERSION_CHAIN_CONFLICT (4 assertions)
 *   Section 4: rollback audit metadata cross-validation with rollbackReasonHash (5 assertions)
 *   Section 5: rollback atomic semantics (5 assertions)
 *   Section 6: boundary safety (3 assertions)
 *
 * Total: ~30 assertions
 */

import { validateModelConfigRollbackPreflight, ROLLBACK_REASON_MAX_LENGTH } from '../modelConfigRollbackPreflightService';
import { simulateIdempotencyConflict, buildIdempotencyLockPlan } from '../modelConfigIdempotencyService';
import {
  validateRollbackAuditMetadataContinuity,
  computeRollbackReasonHash,
} from '../modelConfigAuditContinuityService';
import { buildModelConfigRollbackTransactionPlan } from '../modelConfigTransactionPlanService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asDiffHash,
  asRollbackToken,
} from '../../types/modelConfigApply';
import type { PersistedHumanModelConfigRollbackApproval } from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigRollbackBoundaryService (Phase 4) ===\n');

// ── Shared base values ────────────────────────────────────────────────────────

const tenantId = 'tenant-phase4' as TenantId;
const auditTrailId = 'audit-phase4' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-phase4');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const v3 = asConfigVersion('v3');
const rollbackToken = asRollbackToken('rollback-token-phase4');

const baseRollbackApproval: PersistedHumanModelConfigRollbackApproval = {
  _kind: 'persisted_human_model_config_rollback_approval',
  approvalId,
  tenantId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  approvedByHumanUserId: 'user-phase4',
  approvalReason: 'regression fix',
  rollbackReason: 'performance degradation',
  approvedAt: new Date(),
  auditTrailId,
  rollbackToken,
  status: 'APPROVED',
  aiCanApprove: false,
  persisted: true,
};

const basePreflightInput = {
  tenantId,
  callerType: 'human' as const,
  callerUserId: 'user-phase4',
  rollbackApproval: baseRollbackApproval,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v3,
  rollbackToken,
  auditTrailId,
  rollbackReason: 'performance degradation',
};

// ── Section 1: rollbackReason boundaries ─────────────────────────────────────

console.log('[Section 1: rollbackReason boundaries]\n');

// 1a. Empty string → blocked ROLLBACK_EXEC_MISSING_ROLLBACK_REASON
const s1a = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: '' });
expect('empty rollbackReason → ROLLBACK_EXEC_MISSING_ROLLBACK_REASON', s1a.blockedReasons.includes('ROLLBACK_EXEC_MISSING_ROLLBACK_REASON'));

// 1b. Whitespace-only → blocked
const s1b = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: '   ' });
expect('whitespace-only rollbackReason → blocked', s1b.valid === false);

// 1c. Over max length (501 chars) → ROLLBACK_REASON_TOO_LONG
const longReason = 'x'.repeat(ROLLBACK_REASON_MAX_LENGTH + 1);
const s1c = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: longReason });
expect('501-char rollbackReason → ROLLBACK_REASON_TOO_LONG', s1c.blockedReasons.includes('ROLLBACK_REASON_TOO_LONG'));

// 1d. Exactly max length (500 chars) → NOT blocked for reason length
const maxReason = 'x'.repeat(ROLLBACK_REASON_MAX_LENGTH);
const s1d = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: maxReason });
expect('500-char rollbackReason → no ROLLBACK_REASON_TOO_LONG', !s1d.blockedReasons.includes('ROLLBACK_REASON_TOO_LONG'));

// 1e. Unicode/CJK string → not blocked
const s1e = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: '修改原因：精度提升' });
expect('CJK rollbackReason → not blocked', s1e.valid === true);

// 1f. Special chars (no control chars) → not blocked
const s1f = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: '!@#$%^&*()' });
expect('special chars rollbackReason → no ROLLBACK_REASON_INVALID_CHARS', !s1f.blockedReasons.includes('ROLLBACK_REASON_INVALID_CHARS'));

// 1g. Control char embedded → ROLLBACK_REASON_INVALID_CHARS
const s1g = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackReason: 'valid\x01embedded' });
expect('control char rollbackReason → ROLLBACK_REASON_INVALID_CHARS', s1g.blockedReasons.includes('ROLLBACK_REASON_INVALID_CHARS'));

// 1h. computeRollbackReasonHash is deterministic
const hashA = computeRollbackReasonHash('same reason');
const hashB = computeRollbackReasonHash('same reason');
expect('computeRollbackReasonHash deterministic: hash("same") === hash("same")', hashA === hashB);

// ── Section 2: rollbackTargetVersion boundaries ───────────────────────────────

console.log('\n[Section 2: rollbackTargetVersion boundaries]\n');

// 2a. Missing rollbackTargetVersion → blocked
const s2a = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackTargetVersion: asConfigVersion('') });
expect('missing rollbackTargetVersion → blocked', s2a.valid === false);

// 2b. rollbackTargetVersion === expectedCurrentVersion → ROLLBACK_EXEC_SAME_VERSION
const s2b = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackTargetVersion: v2, expectedCurrentVersion: v2 });
expect('rollbackTargetVersion === expectedCurrentVersion → ROLLBACK_EXEC_SAME_VERSION', s2b.blockedReasons.includes('ROLLBACK_EXEC_SAME_VERSION'));

// 2c. rollbackTargetVersion === newVersion → ROLLBACK_TARGET_VERSION_INVALID
const s2c = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackTargetVersion: v3, newVersion: v3 });
expect('rollbackTargetVersion === newVersion → ROLLBACK_TARGET_VERSION_INVALID', s2c.blockedReasons.includes('ROLLBACK_TARGET_VERSION_INVALID'));

// 2d. Valid: rollbackTargetVersion='v1', expectedCurrentVersion='v2', newVersion='v3' → not blocked
const s2d = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackTargetVersion: v1, expectedCurrentVersion: v2, newVersion: v3 });
expect('valid rollback versions (v1→v2, new=v3) → not blocked', s2d.valid === true);

// 2e. Blocked path has executable=false conceptually (preflight result.valid=false means blocked)
const s2e = validateModelConfigRollbackPreflight({ ...basePreflightInput, rollbackTargetVersion: v2, expectedCurrentVersion: v2 });
expect('blocked preflight result.valid === false', s2e.valid === false);

// ── Section 3: idempotency VERSION_CHAIN_CONFLICT ─────────────────────────────

console.log('\n[Section 3: idempotency VERSION_CHAIN_CONFLICT]\n');

const existingLock = buildIdempotencyLockPlan({
  token: rollbackToken,
  tenantId,
  auditTrailId,
  approvalId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v3,
});

// existingLock has rollbackTargetVersion: v1 and expectedCurrentVersion: v2
// chainedLock should have expectedCurrentVersion: v1 (= existing's rollbackTargetVersion)
// but different rollbackTargetVersion so VERSION_CONFLICT doesn't fire first
const incomingToken = asRollbackToken('different-rollback-token-phase4');
const chainedLock = buildIdempotencyLockPlan({
  token: incomingToken,
  tenantId,
  auditTrailId,
  approvalId: asModelConfigApprovalId('approval-phase4-b'),
  rollbackTargetVersion: asConfigVersion('v0'), // different target
  expectedCurrentVersion: v1, // existing.rollbackTargetVersion === incoming.expectedCurrentVersion → VERSION_CHAIN_CONFLICT
  newVersion: asConfigVersion('v0'),
});

// 3a. existing.rollbackTargetVersion === incoming.expectedCurrentVersion → VERSION_CHAIN_CONFLICT
const c1 = simulateIdempotencyConflict(existingLock, chainedLock);
expect('existing.rollbackTargetVersion === incoming.expectedCurrentVersion → VERSION_CHAIN_CONFLICT', c1.conflict === 'VERSION_CHAIN_CONFLICT');

// 3b. VERSION_CHAIN_CONFLICT has blockedReason
expect('VERSION_CHAIN_CONFLICT has blockedReason', c1.blockedReason !== null);

// 3c. Completely different locks → NO_CONFLICT
const differentLock = buildIdempotencyLockPlan({
  token: asRollbackToken('completely-different-token'),
  tenantId,
  auditTrailId,
  approvalId: asModelConfigApprovalId('approval-different'),
  rollbackTargetVersion: asConfigVersion('vX'),
  expectedCurrentVersion: asConfigVersion('vY'),
  newVersion: asConfigVersion('vZ'),
});
const c2 = simulateIdempotencyConflict(existingLock, differentLock);
expect('completely different locks → NO_CONFLICT', c2.conflict === 'NO_CONFLICT');

// 3d. idempotencyLockPlan.replayPolicy === 'IDEMPOTENT_REPLAY_BLOCKED'
expect("idempotencyLockPlan.replayPolicy === 'IDEMPOTENT_REPLAY_BLOCKED'", existingLock.replayPolicy === 'IDEMPOTENT_REPLAY_BLOCKED');

// ── Section 4: rollback audit metadata cross-validation ───────────────────────

console.log('\n[Section 4: rollback audit metadata cross-validation with rollbackReasonHash]\n');

const auditReason = 'audit test reason for phase 4';
const baseAuditMeta = {
  tenantId,
  approvalId,
  auditTrailId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v3,
  rollbackReason: auditReason,
  rollbackReasonHash: computeRollbackReasonHash(auditReason),
  rollbackToken,
};

// 4a. Valid metadata with matching rollbackReasonHash → valid
const a1 = validateRollbackAuditMetadataContinuity(baseAuditMeta, { ...baseAuditMeta });
expect('valid rollback audit metadata with rollbackReasonHash → valid=true', a1.valid === true);

// 4b. rollbackReasonHash mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH
const a2 = validateRollbackAuditMetadataContinuity(baseAuditMeta, { ...baseAuditMeta, rollbackReasonHash: 'wrong-hash' });
expect('rollbackReasonHash mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH', a2.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH'));

// 4c. rollbackReason mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH
const a3 = validateRollbackAuditMetadataContinuity(baseAuditMeta, { ...baseAuditMeta, rollbackReason: 'different reason' });
expect('rollbackReason mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH', a3.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH'));

// 4d. computeRollbackReasonHash same input → same hash
const hr1 = computeRollbackReasonHash('audit test reason');
const hr2 = computeRollbackReasonHash('audit test reason');
expect('computeRollbackReasonHash same input → same hash', hr1 === hr2);

// 4e. computeRollbackReasonHash different input → different hash
const hr3 = computeRollbackReasonHash('completely different');
expect('computeRollbackReasonHash different input → different hash', hr1 !== hr3);

// ── Section 5: rollback atomic semantics ─────────────────────────────────────

console.log('\n[Section 5: rollback atomic semantics]\n');

const rollbackPlan = buildModelConfigRollbackTransactionPlan({
  planId: 'plan-phase4-001',
  tenantId,
  approvalId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v1,
  rollbackToken,
  rollbackReason: 'phase4 test',
  auditTrailId,
  configAfterHash: asDiffHash('config-after-hash'),
  diffHash: asDiffHash('diff-hash'),
  proposedWeights: { historicalUsageWeight: 0.5 },
  weightMode: 'normalized',
  createdByHumanUserId: 'user-phase4',
});

// 5a. plan._kind === 'model_config_rollback_transaction_plan'
expect("plan._kind === 'model_config_rollback_transaction_plan'", rollbackPlan._kind === 'model_config_rollback_transaction_plan');

// 5b. plan.executable === false
expect('plan.executable === false', rollbackPlan.executable === false);

// 5c. plan.aiCanExecute === false
expect('plan.aiCanExecute === false', rollbackPlan.aiCanExecute === false);

// 5d. settingsHistoryWritePlan.appendOnly === true
expect('settingsHistoryWritePlan.appendOnly === true', rollbackPlan.settingsHistoryWritePlan.appendOnly === true);

// 5e. settingsUpdatePlan.newVersion !== settingsUpdatePlan.currentVersion
expect('settingsUpdatePlan.newVersion !== settingsUpdatePlan.currentVersion', rollbackPlan.settingsUpdatePlan.newVersion !== rollbackPlan.settingsUpdatePlan.currentVersion);

// ── Section 6: boundary safety ───────────────────────────────────────────────

console.log('\n[Section 6: boundary safety]\n');

// 6a. no 'apply' property on rollback plan
expect("no 'apply' property on rollback plan", !('apply' in rollbackPlan));

// 6b. no 'execute' property on rollback plan
expect("no 'execute' property on rollback plan", !('execute' in rollbackPlan));

// 6c. no 'runTransaction' property on rollback plan
expect("no 'runTransaction' property on rollback plan", !('runTransaction' in rollbackPlan));

// ─────────────────────────────────────────────────────────────────────────────

if (fail === 0) console.log(`\nPASSED — modelConfigRollbackBoundaryService Phase 4 verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
