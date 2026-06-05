/**
 * Feature 007 Phase 1: Idempotency Lock Schema tests
 */
import {
  validateApplyIdempotencyLockSchema,
  buildApplyIdempotencyLockSchema,
  classifyLockDuplicateBehavior,
  REAL_APPLY_LOCK_TTL_SECONDS,
  REAL_APPLY_LOCK_GRACE_SECONDS,
} from '../realModelConfigIdempotencySchemaService';
import type { TenantId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 007 Phase 1: Idempotency Lock Schema ===\n');

const tenantId = 'tenant-007' as TenantId;
const approvalId = asModelConfigApprovalId('approval-007');
const applyToken = asApplyToken('token-007');
const applyToken2 = asApplyToken('token-008');
const payloadHash = asDiffHash('payload-hash-007');
const payloadHash2 = asDiffHash('payload-hash-008');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const now = new Date('2026-06-04T12:00:00.000Z');

// 1. Build valid lock schema
const validSchema = buildApplyIdempotencyLockSchema({
  tenantId, approvalId, applyToken, payloadHash, expectedCurrentVersion: v1, now,
});
expect('build lock → _kind correct', validSchema._kind === 'real_model_config_idempotency_lock_schema');
expect('build lock → lockId = tenant:token', validSchema.lockId === `${tenantId}:${applyToken}`);
expect('build lock → collectionPath correct', validSchema.collectionPath === 'modelConfigIdempotencyLocks');
expect('build lock → status=PENDING', validSchema.status === 'PENDING');
expect('build lock → aiCanOwnLock=false', validSchema.aiCanOwnLock === false);
expect('build lock → cleanupOwner=SYSTEM_MAINTENANCE', validSchema.cleanupOwner === 'SYSTEM_MAINTENANCE');
expect('build lock → expiresAt = createdAt + 300s', validSchema.expiresAt.getTime() === now.getTime() + REAL_APPLY_LOCK_TTL_SECONDS * 1000);
expect('build lock → cleanupEligibleAt = expiresAt + 60s', validSchema.cleanupEligibleAt.getTime() === validSchema.expiresAt.getTime() + REAL_APPLY_LOCK_GRACE_SECONDS * 1000);

// 2. Valid schema passes validation
const v2r = validateApplyIdempotencyLockSchema(validSchema);
expect('valid schema → valid=true', v2r.valid === true);
expect('valid schema → 0 blockedReasons', v2r.blockedReasons.length === 0);

// 3. Missing applyToken blocked
const r3 = validateApplyIdempotencyLockSchema({ ...validSchema, applyToken: asApplyToken('') });
expect('missing applyToken → REAL_EXEC_LOCK_MISSING_TOKEN', r3.blockedReasons.includes('REAL_EXEC_LOCK_MISSING_TOKEN'));

// 4. Missing tenant blocked
const r4 = validateApplyIdempotencyLockSchema({ ...validSchema, tenantId: '' as TenantId });
expect('missing tenantId → REAL_EXEC_LOCK_MISSING_TENANT', r4.blockedReasons.includes('REAL_EXEC_LOCK_MISSING_TENANT'));

// 5. Missing approvalId blocked
const r5 = validateApplyIdempotencyLockSchema({ ...validSchema, approvalId: asModelConfigApprovalId('') });
expect('missing approvalId → REAL_EXEC_LOCK_MISSING_APPROVAL', r5.blockedReasons.includes('REAL_EXEC_LOCK_MISSING_APPROVAL'));

// 6. Missing payloadHash blocked
const r6 = validateApplyIdempotencyLockSchema({ ...validSchema, payloadHash: asDiffHash('') });
expect('missing payloadHash → REAL_EXEC_LOCK_MISSING_PAYLOAD_HASH', r6.blockedReasons.includes('REAL_EXEC_LOCK_MISSING_PAYLOAD_HASH'));

// 7. Missing expectedCurrentVersion blocked
const r7 = validateApplyIdempotencyLockSchema({ ...validSchema, expectedCurrentVersion: asConfigVersion('') });
expect('missing expectedCurrentVersion → REAL_EXEC_LOCK_MISSING_EXPECTED_VERSION', r7.blockedReasons.includes('REAL_EXEC_LOCK_MISSING_EXPECTED_VERSION'));

// 8. Invalid status blocked
const r8 = validateApplyIdempotencyLockSchema({ ...validSchema, status: 'INVALID' as 'PENDING' });
expect('invalid status → REAL_EXEC_LOCK_INVALID_STATUS', r8.blockedReasons.includes('REAL_EXEC_LOCK_INVALID_STATUS'));

// 9. aiCanOwnLock !== false → blocked
const r9 = validateApplyIdempotencyLockSchema({ ...validSchema, aiCanOwnLock: true as unknown as false });
expect('aiCanOwnLock=true → REAL_EXEC_LOCK_AI_OWNER_BLOCKED', r9.blockedReasons.includes('REAL_EXEC_LOCK_AI_OWNER_BLOCKED'));

// 10. TTL invalid (expiresAt <= createdAt)
const r10 = validateApplyIdempotencyLockSchema({ ...validSchema, expiresAt: new Date(now.getTime() - 1000) });
expect('invalid TTL → REAL_EXEC_LOCK_TTL_INVALID', r10.blockedReasons.includes('REAL_EXEC_LOCK_TTL_INVALID'));

// 11. All valid statuses pass
for (const status of ['PENDING', 'CONSUMED', 'ABANDONED', 'EXPIRED'] as const) {
  const rs = validateApplyIdempotencyLockSchema({ ...validSchema, status });
  expect(`status=${status} → valid`, rs.valid === true);
}

// ─── Duplicate behavior classification ───────────────────────────────────────

console.log('\n[classifyLockDuplicateBehavior]\n');

const cand = { applyToken, approvalId, payloadHash, expectedCurrentVersion: v1 };
const exist = { applyToken, approvalId, payloadHash, expectedCurrentVersion: v1 };

// 12. Same token + same payload → idempotent
const d1 = classifyLockDuplicateBehavior(cand, exist);
expect('same token + same payload → SAME_TOKEN_SAME_PAYLOAD_IDEMPOTENT', d1.behavior === 'SAME_TOKEN_SAME_PAYLOAD_IDEMPOTENT');
expect('same token + same payload → no blocked reasons', d1.blockedReasons.length === 0);

// 13. Same token + different payload → blocked
const d2 = classifyLockDuplicateBehavior({ ...cand, payloadHash: payloadHash2 }, exist);
expect('same token + diff payload → SAME_TOKEN_DIFFERENT_PAYLOAD_BLOCKED', d2.behavior === 'SAME_TOKEN_DIFFERENT_PAYLOAD_BLOCKED');
expect('same token + diff payload → REAL_EXEC_LOCK_DUPLICATE_TOKEN', d2.blockedReasons.includes('REAL_EXEC_LOCK_DUPLICATE_TOKEN'));

// 14. Same approvalId + different token → blocked
const d3 = classifyLockDuplicateBehavior({ ...cand, applyToken: applyToken2 }, exist);
expect('same approval + diff token → SAME_APPROVAL_DIFFERENT_TOKEN_BLOCKED', d3.behavior === 'SAME_APPROVAL_DIFFERENT_TOKEN_BLOCKED');
expect('same approval + diff token → REAL_EXEC_LOCK_APPROVAL_REUSE', d3.blockedReasons.includes('REAL_EXEC_LOCK_APPROVAL_REUSE'));

// 15. Stale expectedCurrentVersion → blocked
const d4 = classifyLockDuplicateBehavior(
  { ...cand, applyToken: applyToken2, approvalId: asModelConfigApprovalId('other-approval'), expectedCurrentVersion: v2 },
  exist,
);
expect('stale version → STALE_EXPECTED_VERSION_BLOCKED', d4.behavior === 'STALE_EXPECTED_VERSION_BLOCKED');
expect('stale version → REAL_EXEC_LOCK_VERSION_CONFLICT', d4.blockedReasons.includes('REAL_EXEC_LOCK_VERSION_CONFLICT'));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1 Idempotency Schema (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
