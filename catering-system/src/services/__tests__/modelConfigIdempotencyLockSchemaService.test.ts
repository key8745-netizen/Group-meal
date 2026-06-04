import {
  buildApplyLockSchema,
  buildRollbackLockSchema,
  validateLockSchema,
  buildLockAcquisitionPlan,
  getLockCleanupResponsibilityChain,
  getLockDocumentPath,
} from '../modelConfigIdempotencyLockSchemaService';
import { IDEMPOTENCY_LOCK_COLLECTION, LOCK_TTL_SECONDS } from '../../types/modelConfigRealApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asApplyToken,
  asRollbackToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigIdempotencyLockSchemaService ===\n');

const tenantId = 'tenant-lock' as TenantId;
const auditTrailId = 'audit-lock' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-lock');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const applyToken = asApplyToken('applytoken-lock');
const rollbackToken = asRollbackToken('rollbacktoken-lock');
const now = new Date('2026-06-04T00:00:00.000Z');

// ─── Apply Lock Schema ────────────────────────────────────────────────────────

console.log('[buildApplyLockSchema]\n');

const applyLock = buildApplyLockSchema({
  token: applyToken,
  tenantId,
  auditTrailId,
  approvalId,
  expectedCurrentVersion: v1,
  newVersion: v2,
  createdByHumanUserId: 'user-001',
  now,
});

// 1. lock kind
expect('apply lock _kind', applyLock._kind === 'idempotency_lock_document');

// 2. lock id format
expect('apply lockId format = tenantId:token', applyLock.lockId === `${tenantId}:${applyToken}`);

// 3. token binding
expect('apply lock token matches', applyLock.token === applyToken);
expect('apply lock tenantId matches', applyLock.tenantId === tenantId);
expect('apply lock approvalId matches', (applyLock.approvalId as string) === (approvalId as string));

// 4. version binding
expect('apply lock expectedCurrentVersion = v1', (applyLock.expectedCurrentVersion as string) === 'v1');
expect('apply lock newVersion = v2', (applyLock.newVersion as string) === 'v2');

// 5. TTL
expect(`apply lock ttlSeconds = ${LOCK_TTL_SECONDS}`, applyLock.ttlSeconds === LOCK_TTL_SECONDS);
expect('apply lock expiresAt = createdAt + 300s', applyLock.expiresAt.getTime() === now.getTime() + 300_000);

// 6. cleanup
expect('apply lock cleanup = TRANSACTION_COMMIT_RELEASES', applyLock.cleanupResponsibility === 'TRANSACTION_COMMIT_RELEASES');
expect('apply lock status = PLANNED', applyLock.status === 'PLANNED');

// 7. no rollback fields
expect('apply lock rollbackTargetVersion undefined', applyLock.rollbackTargetVersion === undefined);
expect('apply lock rollbackReasonHash undefined', applyLock.rollbackReasonHash === undefined);

// ─── Rollback Lock Schema ─────────────────────────────────────────────────────

console.log('\n[buildRollbackLockSchema]\n');

const rollbackLock = buildRollbackLockSchema({
  token: rollbackToken,
  tenantId,
  auditTrailId,
  approvalId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v1,
  rollbackReasonHash: 'hash-of-reason',
  createdByHumanUserId: 'user-001',
  now,
});

// 8. rollback lock has rollbackTargetVersion
expect('rollback lock has rollbackTargetVersion = v1', (rollbackLock.rollbackTargetVersion as string) === 'v1');

// 9. rollback lock has rollbackReasonHash
expect('rollback lock has rollbackReasonHash', rollbackLock.rollbackReasonHash === 'hash-of-reason');

// 10. rollback lock id format
expect('rollback lockId format = tenantId:token', rollbackLock.lockId === `${tenantId}:${rollbackToken}`);

// ─── Lock Schema Validator ────────────────────────────────────────────────────

console.log('\n[validateLockSchema]\n');

// 11. valid apply lock
const v1result = validateLockSchema(applyLock);
expect('valid apply lock → valid=true', v1result.valid === true);
expect('valid apply lock → 0 blockedReasons', v1result.blockedReasons.length === 0);

// 12. valid rollback lock
const v2result = validateLockSchema(rollbackLock);
expect('valid rollback lock → valid=true', v2result.valid === true);

// 13. missing token
const noToken = { ...applyLock, token: '' as typeof applyToken };
const v3result = validateLockSchema(noToken);
expect('missing token → LOCK_SCHEMA_MISSING_TOKEN', v3result.blockedReasons.includes('LOCK_SCHEMA_MISSING_TOKEN'));

// 14. TTL zero → invalid
const zeroTtl = { ...applyLock, ttlSeconds: 0 as typeof LOCK_TTL_SECONDS };
const v4result = validateLockSchema(zeroTtl);
expect('ttl=0 → LOCK_SCHEMA_TTL_INVALID', v4result.blockedReasons.includes('LOCK_SCHEMA_TTL_INVALID'));

// 15. expiresAt before createdAt
const badExpiry = { ...applyLock, expiresAt: new Date(now.getTime() - 1000) };
const v5result = validateLockSchema(badExpiry);
expect('expiresAt < createdAt → LOCK_SCHEMA_EXPIRES_BEFORE_CREATED', v5result.blockedReasons.includes('LOCK_SCHEMA_EXPIRES_BEFORE_CREATED'));

// 16. lockId missing colon → invalid path
const badId = { ...applyLock, lockId: 'nocolon' };
const v6result = validateLockSchema(badId);
expect('lockId no colon → LOCK_SCHEMA_DOCUMENT_PATH_INVALID', v6result.blockedReasons.includes('LOCK_SCHEMA_DOCUMENT_PATH_INVALID'));

// ─── Lock Acquisition Plan ────────────────────────────────────────────────────

console.log('\n[buildLockAcquisitionPlan]\n');

const plan = buildLockAcquisitionPlan(applyLock);

// 17. plan kind
expect('acquisition plan _kind', plan._kind === 'lock_acquisition_plan');
expect('acquisition plan planOnly=true', plan.planOnly === true);
expect('acquisition plan executable=false', plan.executable === false);

// 18. collection
expect(`acquisition plan collection = '${IDEMPOTENCY_LOCK_COLLECTION}'`, plan.collection === IDEMPOTENCY_LOCK_COLLECTION);

// 19. documentPath
expect('acquisition plan documentPath correct', plan.documentPath === `${IDEMPOTENCY_LOCK_COLLECTION}/${applyLock.lockId}`);

// 20. cleanupNote contains all 3 responsibilities
expect('cleanupNote mentions TRANSACTION_COMMIT_RELEASES', plan.cleanupNote.includes('transaction commit'));
expect('cleanupNote mentions TTL', plan.cleanupNote.includes('TTL'));
expect('cleanupNote mentions manual admin', plan.cleanupNote.includes('admin'));

// ─── Cleanup Responsibility Chain ─────────────────────────────────────────────

console.log('\n[getLockCleanupResponsibilityChain]\n');

const chain = getLockCleanupResponsibilityChain();

// 21. chain has 3 entries
expect('cleanup chain has 3 entries', chain.length === 3);
expect('priority 1 = TRANSACTION_COMMIT_RELEASES', chain[0].responsibility === 'TRANSACTION_COMMIT_RELEASES');
expect('priority 2 = TTL_EXPIRES', chain[1].responsibility === 'TTL_EXPIRES');
expect('priority 3 = MANUAL_ADMIN_RELEASE', chain[2].responsibility === 'MANUAL_ADMIN_RELEASE');

// ─── Lock Document Path Utility ───────────────────────────────────────────────

console.log('\n[getLockDocumentPath]\n');

// 22. path utility
const path = getLockDocumentPath(tenantId, applyToken);
expect('getLockDocumentPath correct', path === `${IDEMPOTENCY_LOCK_COLLECTION}/${tenantId}:${applyToken}`);

if (fail === 0) console.log(`\nPASSED — modelConfigIdempotencyLockSchemaService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
