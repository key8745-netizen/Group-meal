import { generateApplyToken, generateRollbackToken, buildIdempotencyLockPlan, simulateIdempotencyConflict } from '../modelConfigIdempotencyService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigIdempotencyService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diff123');
const auditTrailId = 'audit-001' as AuditTrailId;

const baseApplyPayload = {
  tenantId,
  approvalId,
  sourceRecommendationId: recId,
  expectedCurrentVersion: v1,
  newVersion: v2,
  auditTrailId,
  diffHash,
};

// Same input → same applyToken
const t1 = generateApplyToken(baseApplyPayload);
const t2 = generateApplyToken(baseApplyPayload);
expect('same input → same applyToken', t1 === t2);

// Changed diffHash → different applyToken
const t3 = generateApplyToken({ ...baseApplyPayload, diffHash: asDiffHash('different-hash') });
expect('changed diffHash → different applyToken', t1 !== t3);

// Changed approvalId → different applyToken
const t4 = generateApplyToken({ ...baseApplyPayload, approvalId: asModelConfigApprovalId('other-approval') });
expect('changed approvalId → different applyToken', t1 !== t4);

// applyToken is 64 chars hex
expect('applyToken is 64 chars', t1.length === 64);
expect('applyToken is hex', /^[0-9a-f]+$/.test(t1));

const baseRollbackPayload = {
  tenantId,
  approvalId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v2,
  auditTrailId,
  rollbackReason: 'config caused issues',
};

// Same input → same rollbackToken
const r1 = generateRollbackToken(baseRollbackPayload);
const r2 = generateRollbackToken(baseRollbackPayload);
expect('same input → same rollbackToken', r1 === r2);

// Changed rollbackTargetVersion → different rollbackToken
const r3 = generateRollbackToken({ ...baseRollbackPayload, rollbackTargetVersion: asConfigVersion('v0') });
expect('changed rollbackTargetVersion → different rollbackToken', r1 !== r3);

// Changed rollbackReason → different rollbackToken
const r4 = generateRollbackToken({ ...baseRollbackPayload, rollbackReason: 'different reason' });
expect('changed rollbackReason → different rollbackToken', r1 !== r4);

// Changed newVersion → different rollbackToken
const r5 = generateRollbackToken({ ...baseRollbackPayload, newVersion: asConfigVersion('v3') });
expect('changed newVersion → different rollbackToken', r1 !== r5);

// rollbackToken is 64 chars hex
expect('rollbackToken is 64 chars', r1.length === 64);
expect('rollbackToken is hex', /^[0-9a-f]+$/.test(r1));

// buildIdempotencyLockPlan planOnly=true
const lockPlan = buildIdempotencyLockPlan({ token: t1, tenantId, auditTrailId });
expect('idempotencyLockPlan planOnly=true', lockPlan.planOnly === true);
expect('idempotencyLockPlan _kind correct', lockPlan._kind === 'idempotency_lock_plan');
expect('lockKey includes tenantId and token', lockPlan.lockKey.includes(tenantId) && lockPlan.lockKey.includes(t1));

// ── Phase 3: simulateIdempotencyConflict ─────────────────────────────────────

console.log('\n[simulateIdempotencyConflict — Phase 3]\n');

const v3 = asConfigVersion('v3');
const approvalId2 = asModelConfigApprovalId('approval-002');
const t5 = generateApplyToken({ ...baseApplyPayload, approvalId: approvalId2 });

const baseLock = buildIdempotencyLockPlan({
  token: t1,
  tenantId,
  auditTrailId,
  approvalId,
  rollbackTargetVersion: v1,
  newVersion: v2,
});

// same token + same approvalId + same versions → IDEMPOTENT_REPLAY_BLOCKED
const lock2 = buildIdempotencyLockPlan({ token: t1, tenantId, auditTrailId, approvalId, rollbackTargetVersion: v1, newVersion: v2 });
const c1 = simulateIdempotencyConflict(baseLock, lock2);
expect('same token + same approvalId + same versions → IDEMPOTENT_REPLAY_BLOCKED', c1.conflict === 'IDEMPOTENT_REPLAY_BLOCKED');
expect('same token + same approvalId + same versions → blockedReason=IDEMPOTENCY_REPLAY_BLOCKED', c1.blockedReason === 'IDEMPOTENCY_REPLAY_BLOCKED');

// same token + different approvalId → BLOCKED_DUPLICATE
const lock3 = buildIdempotencyLockPlan({ token: t1, tenantId, auditTrailId, approvalId: approvalId2, rollbackTargetVersion: v1, newVersion: v2 });
const c2 = simulateIdempotencyConflict(baseLock, lock3);
expect('same token + different approvalId → BLOCKED_DUPLICATE', c2.conflict === 'BLOCKED_DUPLICATE');
expect('same token + different approvalId → blockedReason=IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN', c2.blockedReason === 'IDEMPOTENCY_DUPLICATE_ROLLBACK_TOKEN');

// same rollbackTargetVersion + different newVersion → VERSION_CONFLICT
const lock4 = buildIdempotencyLockPlan({ token: t5, tenantId, auditTrailId, approvalId: approvalId2, rollbackTargetVersion: v1, newVersion: v3 });
const c3 = simulateIdempotencyConflict(baseLock, lock4);
expect('same rollbackTargetVersion + different newVersion → VERSION_CONFLICT', c3.conflict === 'VERSION_CONFLICT');
expect('same rollbackTargetVersion + different newVersion → blockedReason=IDEMPOTENCY_VERSION_CONFLICT', c3.blockedReason === 'IDEMPOTENCY_VERSION_CONFLICT');

// same approvalId + different token → APPROVAL_REUSE_BLOCKED
const lock5 = buildIdempotencyLockPlan({ token: t3, tenantId, auditTrailId, approvalId, rollbackTargetVersion: v2, newVersion: v3 });
const c4 = simulateIdempotencyConflict(baseLock, lock5);
expect('same approvalId + different token → APPROVAL_REUSE_BLOCKED', c4.conflict === 'APPROVAL_REUSE_BLOCKED');
expect('same approvalId + different token → blockedReason=IDEMPOTENCY_APPROVAL_REUSE_BLOCKED', c4.blockedReason === 'IDEMPOTENCY_APPROVAL_REUSE_BLOCKED');

// completely different locks → NO_CONFLICT
const lock6 = buildIdempotencyLockPlan({ token: t5, tenantId, auditTrailId, approvalId: approvalId2, rollbackTargetVersion: v2, newVersion: v3 });
const c5 = simulateIdempotencyConflict(baseLock, lock6);
expect('completely different locks → NO_CONFLICT', c5.conflict === 'NO_CONFLICT');
expect('completely different locks → blockedReason=null', c5.blockedReason === null);

// lock plan fields check
expect('idempotencyLockPlan.status === PLANNED', baseLock.status === 'PLANNED');
expect('idempotencyLockPlan.duplicatePolicy === BLOCKED_DUPLICATE', baseLock.duplicatePolicy === 'BLOCKED_DUPLICATE');
expect('idempotencyLockPlan.conflictPolicy === VERSION_CONFLICT_BLOCKED', baseLock.conflictPolicy === 'VERSION_CONFLICT_BLOCKED');
expect('idempotencyLockPlan.planOnly === true', baseLock.planOnly === true);

if (fail === 0) console.log(`\nPASSED — modelConfigIdempotencyService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
