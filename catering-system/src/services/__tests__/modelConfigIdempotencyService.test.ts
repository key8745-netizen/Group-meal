import { generateApplyToken, generateRollbackToken, buildIdempotencyLockPlan } from '../modelConfigIdempotencyService';
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

if (fail === 0) console.log(`\nPASSED — modelConfigIdempotencyService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
