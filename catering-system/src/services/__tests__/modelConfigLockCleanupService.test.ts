import {
  buildLockLifecycleDocument,
  checkLockCleanupEligibility,
  buildLockCleanupPlan,
  getLockCleanupSchedule,
  validateServiceGuardEntrance,
} from '../modelConfigLockCleanupService';
import type { LockLifecycleDocument } from '../modelConfigLockCleanupService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asApplyToken,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigLockCleanupService ===\n');

const tenantId = 'tenant-lock-lc' as TenantId;
const auditTrailId = 'audit-lock-lc' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-lock-lc');
const applyToken = asApplyToken('applytoken-lc');
const now = new Date('2026-06-04T10:00:00.000Z');

// ─── Lock Lifecycle Document ──────────────────────────────────────────────────

console.log('[buildLockLifecycleDocument]\n');

const baseLock = buildLockLifecycleDocument({
  lockId: `${tenantId}:${applyToken}`,
  token: applyToken,
  tenantId,
  auditTrailId,
  approvalId,
  now,
});

// 1. lifecycle document structure
expect('lifecycle _kind', baseLock._kind === 'lock_lifecycle_document');
expect('lifecycle status = PLANNED', baseLock.status === 'PLANNED');
expect('lifecycle lockOwner = HUMAN_SERVICE', baseLock.lockOwner === 'HUMAN_SERVICE');
expect('lifecycle aiCanOwnLock = false', baseLock.aiCanOwnLock === false);
expect('lifecycle expiresAt = createdAt + 300s', baseLock.expiresAt.getTime() === now.getTime() + 300_000);
expect('lifecycle cleanupEligibleAt > expiresAt', baseLock.cleanupEligibleAt.getTime() > baseLock.expiresAt.getTime());
expect('lifecycle cleanupEligibleAt = expiresAt + 60s', baseLock.cleanupEligibleAt.getTime() === baseLock.expiresAt.getTime() + 60_000);

// 2. policies
expect('duplicatePolicy = BLOCKED_DUPLICATE', baseLock.duplicatePolicy === 'BLOCKED_DUPLICATE');
expect('replayPolicy = IDEMPOTENT_REPLAY_BLOCKED', baseLock.replayPolicy === 'IDEMPOTENT_REPLAY_BLOCKED');
expect('versionConflictPolicy = VERSION_CONFLICT_BLOCKED', baseLock.versionConflictPolicy === 'VERSION_CONFLICT_BLOCKED');
expect('approvalReusePolicy = APPROVAL_REUSE_BLOCKED', baseLock.approvalReusePolicy === 'APPROVAL_REUSE_BLOCKED');

// ─── Cleanup Eligibility ──────────────────────────────────────────────────────

console.log('\n[checkLockCleanupEligibility]\n');

// 3. PLANNED → not eligible
const e1 = checkLockCleanupEligibility({ lock: baseLock, now });
expect('PLANNED lock → not eligible', e1.eligible === false);
expect('PLANNED lock → reason mentions PLANNED', e1.reason.includes('PLANNED'));

// 4. ACTIVE → not eligible (must not delete in-flight)
const activeLock: LockLifecycleDocument = { ...baseLock, status: 'ACTIVE' };
const e2 = checkLockCleanupEligibility({ lock: activeLock, now });
expect('ACTIVE lock → not eligible', e2.eligible === false);
expect('ACTIVE lock → reason mentions in-flight', e2.reason.includes('in flight'));

// 5. EXPIRED past cleanupEligibleAt → eligible
const expiredLock: LockLifecycleDocument = {
  ...baseLock,
  status: 'EXPIRED',
  createdAt: new Date(now.getTime() - 400_000),
  expiresAt: new Date(now.getTime() - 100_000),
  cleanupEligibleAt: new Date(now.getTime() - 40_000),
};
const e3 = checkLockCleanupEligibility({ lock: expiredLock, now });
expect('EXPIRED past cleanupEligibleAt → eligible', e3.eligible === true);

// 6. EXPIRED but cleanupEligibleAt not yet → not eligible
const expiredNotYet: LockLifecycleDocument = {
  ...baseLock,
  status: 'EXPIRED',
  expiresAt: new Date(now.getTime() - 10_000),
  cleanupEligibleAt: new Date(now.getTime() + 50_000),
};
const e4 = checkLockCleanupEligibility({ lock: expiredNotYet, now });
expect('EXPIRED before cleanupEligibleAt → not eligible', e4.eligible === false);

// 7. CONSUMED with consumedAt past cleanupEligibleAt → eligible
const consumedLock: LockLifecycleDocument = {
  ...baseLock,
  status: 'CONSUMED',
  consumedAt: new Date(now.getTime() - 500_000),
  expiresAt: new Date(now.getTime() - 200_000),
  cleanupEligibleAt: new Date(now.getTime() - 140_000),
};
const e5 = checkLockCleanupEligibility({ lock: consumedLock, now });
expect('CONSUMED past cleanupEligibleAt → eligible', e5.eligible === true);

// 8. CONSUMED but no consumedAt → not eligible
const consumedNoAt: LockLifecycleDocument = {
  ...baseLock,
  status: 'CONSUMED',
  cleanupEligibleAt: new Date(now.getTime() - 1000),
};
const e6 = checkLockCleanupEligibility({ lock: consumedNoAt, now });
expect('CONSUMED no consumedAt → not eligible', e6.eligible === false);

// ─── Cleanup Plan ─────────────────────────────────────────────────────────────

console.log('\n[buildLockCleanupPlan]\n');

// 9. ACTIVE lock cleanup plan → not eligible, dryRunOnly
const cp1 = buildLockCleanupPlan(activeLock, now);
expect('ACTIVE cleanup plan → dryRunOnly=true', cp1.dryRunOnly === true);
expect('ACTIVE cleanup plan → aiCanTrigger=false', cp1.aiCanTrigger === false);
expect('ACTIVE cleanup plan → cleanupEligible=false', cp1.cleanupEligible === false);

// 10. EXPIRED eligible cleanup plan
const cp2 = buildLockCleanupPlan(expiredLock, now);
expect('EXPIRED eligible → cleanupEligible=true', cp2.cleanupEligible === true);
expect('EXPIRED eligible → strategy=TTL_INDEX', cp2.cleanupStrategy === 'TTL_INDEX');
expect('EXPIRED eligible → dryRunOnly=true', cp2.dryRunOnly === true);
expect('EXPIRED eligible → aiCanTrigger=false', cp2.aiCanTrigger === false);

// 11. CONSUMED eligible cleanup plan
const cp3 = buildLockCleanupPlan(consumedLock, now);
expect('CONSUMED eligible → cleanupEligible=true', cp3.cleanupEligible === true);
expect('CONSUMED eligible → strategy=SCHEDULED_JOB', cp3.cleanupStrategy === 'SCHEDULED_JOB');

// ─── Cleanup Schedule ─────────────────────────────────────────────────────────

console.log('\n[getLockCleanupSchedule]\n');

const schedule = getLockCleanupSchedule();

// 12. schedule structure
expect('schedule has 3 entries', schedule.length === 3);
expect('priority 1 = TTL_INDEX', schedule[0].trigger.includes('TTL'));
expect('priority 2 = scheduled job', schedule[1].trigger.toLowerCase().includes('scheduled'));
expect('priority 3 = manual admin', schedule[2].trigger.toLowerCase().includes('manual'));
expect('all entries aiAllowed=false', schedule.every(s => s.aiAllowed === false));
expect('priority 2 auditRequired=true', schedule[1].auditRequired === true);
expect('priority 3 auditRequired=true', schedule[2].auditRequired === true);

// ─── Service Guard Entrance ───────────────────────────────────────────────────

console.log('\n[validateServiceGuardEntrance]\n');

// 13. valid human caller → allowed
const sg1 = validateServiceGuardEntrance({
  callerType: 'human',
  callerUserId: 'user-001',
  tenantId,
  hasApproval: true,
});
expect('valid human → allowed=true', sg1.allowed === true);
expect('valid human → 0 blockedReasons', sg1.blockedReasons.length === 0);

// 14. AI caller → blocked
const sg2 = validateServiceGuardEntrance({
  callerType: 'ai',
  callerUserId: 'ai-agent',
  tenantId,
  hasApproval: true,
});
expect('AI caller → REAL_APPLY_AI_CALLER_BLOCKED', sg2.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));
expect('AI caller → allowed=false', sg2.allowed === false);

// 15. missing tenantId → blocked immediately
const sg3 = validateServiceGuardEntrance({
  callerType: 'human',
  callerUserId: 'user-001',
  tenantId: '',
  hasApproval: true,
});
expect('missing tenantId → REAL_APPLY_TENANT_MISMATCH', sg3.blockedReasons.includes('REAL_APPLY_TENANT_MISMATCH'));
expect('missing tenantId → allowed=false', sg3.allowed === false);

// 16. serviceAccount alone insufficient (no human userId)
const sg4 = validateServiceGuardEntrance({
  callerType: 'human',
  callerUserId: '',
  tenantId,
  hasApproval: true,
  isServiceAccount: true,
});
expect('serviceAccount no userId → REAL_APPLY_MISSING_HUMAN_APPROVER', sg4.blockedReasons.includes('REAL_APPLY_MISSING_HUMAN_APPROVER'));

// 17. Admin SDK alone insufficient
const sg5 = validateServiceGuardEntrance({
  callerType: 'human',
  callerUserId: '',
  tenantId,
  hasApproval: true,
  isAdminSdk: true,
});
expect('Admin SDK no userId → REAL_APPLY_MISSING_HUMAN_APPROVER', sg5.blockedReasons.includes('REAL_APPLY_MISSING_HUMAN_APPROVER'));

// 18. missing approval
const sg6 = validateServiceGuardEntrance({
  callerType: 'human',
  callerUserId: 'user-001',
  tenantId,
  hasApproval: false,
});
expect('missing approval → REAL_APPLY_APPROVAL_NOT_APPROVED', sg6.blockedReasons.includes('REAL_APPLY_APPROVAL_NOT_APPROVED'));
expect('missing approval → allowed=false', sg6.allowed === false);

// 19. AI still blocked even with isAdminSdk=true
const sg7 = validateServiceGuardEntrance({
  callerType: 'ai',
  callerUserId: 'ai-system',
  tenantId,
  hasApproval: true,
  isAdminSdk: true,
});
expect('AI + AdminSdk → still blocked', sg7.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));

if (fail === 0) console.log(`\nPASSED — modelConfigLockCleanupService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
