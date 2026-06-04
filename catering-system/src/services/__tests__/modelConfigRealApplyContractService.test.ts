import {
  validateRealApplyTransactionContract,
  validateRealRollbackTransactionContract,
  verifyHistoricalConfigHash,
} from '../modelConfigRealApplyContractService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
  asRollbackToken,
} from '../../types/modelConfigApply';
import type { PersistedHumanModelConfigApproval, PersistedHumanModelConfigRollbackApproval } from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigRealApplyContractService ===\n');

const tenantId = 'tenant-f006' as TenantId;
const otherTenantId = 'tenant-other' as TenantId;
const auditTrailId = 'audit-f006' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-f006');
const recId = asModelConfigRecommendationId('rec-f006');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diff-f006');
const beforeHash = asDiffHash('before-f006');
const afterHash = asDiffHash('after-f006');
const applyToken = asApplyToken('applytoken-f006');
const rollbackToken = asRollbackToken('rollbacktoken-f006');

// ─── Apply Contract ───────────────────────────────────────────────────────────

console.log('[validateRealApplyTransactionContract]\n');

const baseApproval: PersistedHumanModelConfigApproval = {
  _kind: 'persisted_human_model_config_approval',
  approvalId,
  tenantId,
  sourceRecommendationId: recId,
  approvedByHumanUserId: 'user-001',
  approvalReason: 'looks good',
  approvedAt: new Date(),
  auditTrailId,
  targetVersion: v2,
  expectedCurrentVersion: v1,
  diffHash,
  configBeforeHash: beforeHash,
  configAfterHash: afterHash,
  status: 'APPROVED',
  aiCanApprove: false,
  persisted: true,
};

// 1. valid apply contract
const r1 = validateRealApplyTransactionContract({
  contractId: 'c-001',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: baseApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('valid apply contract → contractValid=true', r1.contractValid === true);
expect('valid apply contract → contract not null', r1.contract !== null);
expect('valid apply contract → 0 blockedReasons', r1.blockedReasons.length === 0);
expect('valid apply contract → executable=false', r1.contract?.executable === false);
expect('valid apply contract → aiCanExecute=false', r1.contract?.aiCanExecute === false);
expect('valid apply contract → requiresHumanApproval=true', r1.contract?.requiresHumanApproval === true);
expect('valid apply contract → lockAcquisitionPlan.planOnly=true', r1.contract?.lockAcquisitionPlan.planOnly === true);
expect('valid apply contract → lockAcquisitionPlan.executable=false', r1.contract?.lockAcquisitionPlan.executable === false);

// 2. tenant mismatch → blocked immediately
const r2 = validateRealApplyTransactionContract({
  contractId: 'c-002',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: { ...baseApproval, tenantId: otherTenantId },
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('tenant mismatch → contractValid=false', r2.contractValid === false);
expect('tenant mismatch → REAL_APPLY_TENANT_MISMATCH', r2.blockedReasons.includes('REAL_APPLY_TENANT_MISMATCH'));
expect('tenant mismatch → contract null', r2.contract === null);

// 3. AI caller → blocked
const r3 = validateRealApplyTransactionContract({
  contractId: 'c-003',
  callerType: 'ai',
  callerUserId: 'ai-agent',
  approval: baseApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('AI caller → REAL_APPLY_AI_CALLER_BLOCKED', r3.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));
expect('AI caller → contractValid=false', r3.contractValid === false);

// 4. approval not approved
const r4 = validateRealApplyTransactionContract({
  contractId: 'c-004',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: { ...baseApproval, status: 'PENDING_REVIEW' },
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('not approved → REAL_APPLY_APPROVAL_NOT_APPROVED', r4.blockedReasons.includes('REAL_APPLY_APPROVAL_NOT_APPROVED'));

// 5. expired approval
const r5 = validateRealApplyTransactionContract({
  contractId: 'c-005',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: { ...baseApproval, status: 'EXPIRED' },
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('expired approval → REAL_APPLY_APPROVAL_EXPIRED', r5.blockedReasons.includes('REAL_APPLY_APPROVAL_EXPIRED'));

// 6. expected version mismatch (race condition guard)
const r6 = validateRealApplyTransactionContract({
  contractId: 'c-006',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: baseApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: asConfigVersion('v0'), // wrong
  applyToken,
});
expect('version mismatch → REAL_APPLY_EXPECTED_VERSION_MISMATCH', r6.blockedReasons.includes('REAL_APPLY_EXPECTED_VERSION_MISMATCH'));

// 7. lock plan fields are correct
const r7 = validateRealApplyTransactionContract({
  contractId: 'c-007',
  callerType: 'human',
  callerUserId: 'user-001',
  approval: baseApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v1,
  applyToken,
});
expect('lock document tenantId matches', r7.contract?.lockAcquisitionPlan.lockDocument.tenantId === tenantId);
expect('lock document token matches', r7.contract?.lockAcquisitionPlan.lockDocument.token === applyToken);
expect('lock cleanup = TRANSACTION_COMMIT_RELEASES', r7.contract?.lockAcquisitionPlan.cleanupResponsibility === 'TRANSACTION_COMMIT_RELEASES');
expect('lock documentPath contains collection', r7.contract?.lockAcquisitionPlan.documentPath.startsWith('modelConfigIdempotencyLocks/') === true);
expect('lock ttlSeconds = 300', r7.contract?.lockAcquisitionPlan.lockDocument.ttlSeconds === 300);
expect('lock expiresAt > createdAt', (r7.contract?.lockAcquisitionPlan.lockDocument.expiresAt.getTime() ?? 0) > (r7.contract?.lockAcquisitionPlan.lockDocument.createdAt.getTime() ?? 0));

// ─── Historical Config Hash Verification ─────────────────────────────────────

console.log('\n[verifyHistoricalConfigHash]\n');

// 8. matching hash → verified=true
const h1 = verifyHistoricalConfigHash({
  tenantId,
  targetVersion: v1,
  expectedHash: beforeHash,
  actualHash: beforeHash,
});
expect('matching hash → verified=true', h1.verified === true);
expect('matching hash → mismatch=false', h1.mismatch === false);

// 9. mismatching hash → mismatch=true
const h2 = verifyHistoricalConfigHash({
  tenantId,
  targetVersion: v1,
  expectedHash: beforeHash,
  actualHash: asDiffHash('different-hash'),
});
expect('mismatching hash → verified=false', h2.verified === false);
expect('mismatching hash → mismatch=true', h2.mismatch === true);

// ─── Rollback Contract ────────────────────────────────────────────────────────

console.log('\n[validateRealRollbackTransactionContract]\n');

const baseRollbackApproval: PersistedHumanModelConfigRollbackApproval = {
  _kind: 'persisted_human_model_config_rollback_approval',
  approvalId,
  tenantId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  approvedByHumanUserId: 'user-001',
  approvalReason: 'config regression',
  rollbackReason: 'performance degradation detected',
  approvedAt: new Date(),
  auditTrailId,
  rollbackToken,
  status: 'APPROVED',
  aiCanApprove: false,
  persisted: true,
};

const validHashVerification = verifyHistoricalConfigHash({
  tenantId,
  targetVersion: v1,
  expectedHash: beforeHash,
  actualHash: beforeHash,
});

const mismatchHashVerification = verifyHistoricalConfigHash({
  tenantId,
  targetVersion: v1,
  expectedHash: beforeHash,
  actualHash: asDiffHash('corrupt-hash'),
});

// 10. valid rollback contract
const rr1 = validateRealRollbackTransactionContract({
  contractId: 'rc-001',
  callerType: 'human',
  callerUserId: 'user-001',
  rollbackApproval: baseRollbackApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v2,
  historicalConfigHashVerification: validHashVerification,
});
expect('valid rollback contract → contractValid=true', rr1.contractValid === true);
expect('valid rollback contract → contract not null', rr1.contract !== null);
expect('valid rollback contract → executable=false', rr1.contract?.executable === false);
expect('valid rollback contract → aiCanExecute=false', rr1.contract?.aiCanExecute === false);
expect('valid rollback contract → requiresHumanApproval=true', rr1.contract?.requiresHumanApproval === true);
expect('valid rollback contract → rollbackReasonHash present', typeof rr1.contract?.rollbackReasonHash === 'string' && rr1.contract.rollbackReasonHash.length > 0);

// 11. tenant mismatch → blocked immediately
const rr2 = validateRealRollbackTransactionContract({
  contractId: 'rc-002',
  callerType: 'human',
  callerUserId: 'user-001',
  rollbackApproval: { ...baseRollbackApproval, tenantId: otherTenantId },
  expectedTenantId: tenantId,
  expectedCurrentVersion: v2,
  historicalConfigHashVerification: validHashVerification,
});
expect('rollback tenant mismatch → REAL_ROLLBACK_TENANT_MISMATCH', rr2.blockedReasons.includes('REAL_ROLLBACK_TENANT_MISMATCH'));
expect('rollback tenant mismatch → contract null', rr2.contract === null);

// 12. AI caller blocked
const rr3 = validateRealRollbackTransactionContract({
  contractId: 'rc-003',
  callerType: 'ai',
  callerUserId: 'ai-agent',
  rollbackApproval: baseRollbackApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v2,
  historicalConfigHashVerification: validHashVerification,
});
expect('rollback AI caller → REAL_ROLLBACK_AI_CALLER_BLOCKED', rr3.blockedReasons.includes('REAL_ROLLBACK_AI_CALLER_BLOCKED'));

// 13. historical config hash mismatch → blocked
const rr4 = validateRealRollbackTransactionContract({
  contractId: 'rc-004',
  callerType: 'human',
  callerUserId: 'user-001',
  rollbackApproval: baseRollbackApproval,
  expectedTenantId: tenantId,
  expectedCurrentVersion: v2,
  historicalConfigHashVerification: mismatchHashVerification,
});
expect('hist hash mismatch → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', rr4.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 14. same-version guard
const rr5 = validateRealRollbackTransactionContract({
  contractId: 'rc-005',
  callerType: 'human',
  callerUserId: 'user-001',
  rollbackApproval: { ...baseRollbackApproval, rollbackTargetVersion: v2, expectedCurrentVersion: v2 },
  expectedTenantId: tenantId,
  expectedCurrentVersion: v2,
  historicalConfigHashVerification: validHashVerification,
});
expect('same version → REAL_ROLLBACK_SAME_VERSION', rr5.blockedReasons.includes('REAL_ROLLBACK_SAME_VERSION'));

// 15. rollback lock document has rollbackTargetVersion
expect('rollback lock has rollbackTargetVersion', rr1.contract?.lockAcquisitionPlan.lockDocument.rollbackTargetVersion === v1);
expect('rollback lock has rollbackReasonHash', typeof rr1.contract?.lockAcquisitionPlan.lockDocument.rollbackReasonHash === 'string');

if (fail === 0) console.log(`\nPASSED — modelConfigRealApplyContractService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
