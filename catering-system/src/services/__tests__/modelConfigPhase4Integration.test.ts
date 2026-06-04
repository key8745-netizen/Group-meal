/**
 * Feature 006 Phase 4 integration tests:
 *  - buildLockCleanupQueryCriteriaPlan (cleanup query criteria)
 *  - buildLockCleanupMaintenanceAuditEventPlan (maintenance audit event payload)
 *  - validateMultiVersionRollbackSnapshotChain (multi-version rollback chain)
 */
import {
  buildLockCleanupQueryCriteriaPlan,
  buildLockCleanupMaintenanceAuditEventPlan,
  buildLockLifecycleDocument,
} from '../modelConfigLockCleanupService';
import {
  validateMultiVersionRollbackSnapshotChain,
} from '../modelConfigHistoricalValidationService';
import type { SettingsHistorySnapshot } from '../modelConfigHistoricalValidationService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
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

console.log('\n=== Feature 006 Phase 4 Integration ===\n');

const tenantId = 'tenant-p4' as TenantId;
const otherTenantId = 'tenant-other' as TenantId;
const auditTrailId = 'audit-p4' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-p4');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const v3 = asConfigVersion('v3');
const configHashV1 = asDiffHash('config-hash-v1');
const configHashV2 = asDiffHash('config-hash-v2');
const configHashV3 = asDiffHash('config-hash-v3');
const wrongHash = asDiffHash('wrong-hash');
const applyToken = asApplyToken('token-p4');
const now = new Date('2026-06-04T12:00:00.000Z');

// ─── Lock Cleanup Query Criteria Plan ────────────────────────────────────────

console.log('[buildLockCleanupQueryCriteriaPlan]\n');

const qp = buildLockCleanupQueryCriteriaPlan({ tenantId: tenantId as string, now });

// 1. Hard invariants
expect('criteria plan _kind correct', qp._kind === 'lock_cleanup_query_criteria_plan');
expect('criteria plan dryRunOnly=true', qp.dryRunOnly === true);
expect('criteria plan executable=false', qp.executable === false);
expect('criteria plan aiCanExecute=false', qp.aiCanExecute === false);

// 2. No Firestore object guards
expect('criteria plan containsFirestoreQueryObject=false', qp.containsFirestoreQueryObject === false);
expect('criteria plan containsDeleteFunction=false', qp.containsDeleteFunction === false);
expect('criteria plan containsWriteFunction=false', qp.containsWriteFunction === false);
expect('criteria plan containsCommitFunction=false', qp.containsCommitFunction === false);
expect('criteria plan containsRunTransaction=false', qp.containsRunTransaction === false);

// 3. Criteria content
expect('criteria plan excludeOwner=AI', qp.excludeOwner === 'AI');
expect('criteria plan collectionPath correct', qp.collectionPath === 'modelConfigIdempotencyLocks');
expect('criteria plan tenantId matches', qp.tenantId === (tenantId as string));
expect('criteria plan eligibleStatuses non-empty', qp.eligibleStatuses.length > 0);
expect('criteria plan criteriaDescription mentions tenantId', qp.criteriaDescription.includes(tenantId as string));
expect('criteria plan criteriaDescription mentions ACTIVE exclusion', qp.criteriaDescription.includes('ACTIVE'));

// ─── Maintenance Audit Event Plan ─────────────────────────────────────────────

console.log('\n[buildLockCleanupMaintenanceAuditEventPlan]\n');

const baseLock = buildLockLifecycleDocument({
  lockId: `${tenantId}:${applyToken}`,
  token: applyToken,
  tenantId,
  auditTrailId,
  approvalId,
  now,
});
void baseLock; // used for context only — audit plan is standalone

const auditPlan = buildLockCleanupMaintenanceAuditEventPlan({
  tenantId: tenantId as string,
  auditTrailId: auditTrailId as string,
  maintenanceRunId: 'run-p4-001',
  cleanupTrigger: 'SCHEDULED_JOB',
  candidateLockCount: 10,
  cleanupEligibleCount: 7,
  blockedCount: 3,
  criteriaHash: 'criteria-hash-001',
  now,
});

// 4. Hard invariants
expect('audit plan _kind correct', auditPlan._kind === 'lock_cleanup_maintenance_audit_event_plan');
expect('audit plan dryRunOnly=true', auditPlan.dryRunOnly === true);
expect('audit plan aiCanExecute=false', auditPlan.aiCanExecute === false);
expect('audit plan eventType correct', auditPlan.eventType === 'MODEL_CONFIG_LOCK_CLEANUP_MAINTENANCE');
expect('audit plan cleanupOwner=SYSTEM_MAINTENANCE', auditPlan.cleanupOwner === 'SYSTEM_MAINTENANCE');
expect('audit plan cleanupMode=DRY_RUN', auditPlan.cleanupMode === 'DRY_RUN');

// 5. Payload completeness
expect('audit plan tenantId set', auditPlan.tenantId === (tenantId as string));
expect('audit plan auditTrailId set', auditPlan.auditTrailId === (auditTrailId as string));
expect('audit plan maintenanceRunId set', auditPlan.maintenanceRunId === 'run-p4-001');
expect('audit plan cleanupTrigger=SCHEDULED_JOB', auditPlan.cleanupTrigger === 'SCHEDULED_JOB');
expect('audit plan candidateLockCount correct', auditPlan.candidateLockCount === 10);
expect('audit plan cleanupEligibleCount correct', auditPlan.cleanupEligibleCount === 7);
expect('audit plan blockedCount correct', auditPlan.blockedCount === 3);
expect('audit plan criteriaHash set', auditPlan.criteriaHash === 'criteria-hash-001');
expect('audit plan generatedAt matches now', auditPlan.generatedAt.getTime() === now.getTime());

// 6. TTL_INDEX and MANUAL_ADMIN triggers also valid
const auditPlan2 = buildLockCleanupMaintenanceAuditEventPlan({
  tenantId: tenantId as string,
  auditTrailId: 'audit-002',
  maintenanceRunId: 'run-002',
  cleanupTrigger: 'TTL_INDEX',
  candidateLockCount: 0,
  cleanupEligibleCount: 0,
  blockedCount: 0,
  criteriaHash: 'h2',
});
expect('audit plan TTL_INDEX trigger valid', auditPlan2.cleanupTrigger === 'TTL_INDEX');
const auditPlan3 = buildLockCleanupMaintenanceAuditEventPlan({
  tenantId: tenantId as string,
  auditTrailId: 'audit-003',
  maintenanceRunId: 'run-003',
  cleanupTrigger: 'MANUAL_ADMIN',
  candidateLockCount: 1,
  cleanupEligibleCount: 1,
  blockedCount: 0,
  criteriaHash: 'h3',
  blockedReasons: ['REAL_APPLY_AI_CALLER_BLOCKED'],
});
expect('audit plan MANUAL_ADMIN trigger valid', auditPlan3.cleanupTrigger === 'MANUAL_ADMIN');
expect('audit plan blockedReasons propagated', auditPlan3.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));

// ─── Multi-version Rollback Snapshot Chain ────────────────────────────────────

console.log('\n[validateMultiVersionRollbackSnapshotChain]\n');

const makeSnap = (version: ReturnType<typeof asConfigVersion>, configHash: ReturnType<typeof asDiffHash>, tenant = tenantId): SettingsHistorySnapshot => ({
  _kind: 'settings_history_snapshot',
  tenantId: tenant,
  version,
  configHash,
  immutable: true,
  sourceAuditTrailId: auditTrailId as string,
  approvalId: approvalId as string,
  createdAt: now,
  createdByHumanUserId: 'user-001',
});

const snapV1 = makeSnap(v1, configHashV1);
const snapV2 = makeSnap(v2, configHashV2);
const snapV3 = makeSnap(v3, configHashV3);

// 7. Valid 3-version chain — rollback to v1
const r1 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV1, snapV2, snapV3],
  expectedHistoricalConfigHash: configHashV1,
});
expect('chain valid 3 versions → valid=true', r1.valid === true);
expect('chain valid → validatedTargetConfigHash=configHashV1', r1.validatedTargetConfigHash === configHashV1);
expect('chain valid → chainLength=3', r1.chainLength === 3);
expect('chain valid → blockedReasons empty', r1.blockedReasons.length === 0);

// 8. Valid single-version chain — rollback to v1
const r2 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV1],
  expectedHistoricalConfigHash: configHashV1,
});
expect('single version chain → valid=true', r2.valid === true);
expect('single version chain → chainLength=1', r2.chainLength === 1);

// 9. Missing tenantId → tenant mismatch
const r3 = validateMultiVersionRollbackSnapshotChain({
  tenantId: '' as TenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV1],
  expectedHistoricalConfigHash: configHashV1,
});
expect('missing tenantId → REAL_ROLLBACK_TENANT_MISMATCH', r3.blockedReasons.includes('REAL_ROLLBACK_TENANT_MISMATCH'));
expect('missing tenantId → valid=false', r3.valid === false);

// 10. Empty snapshots → version not found
const r4 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [],
  expectedHistoricalConfigHash: configHashV1,
});
expect('empty snapshots → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', r4.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));

// 11. Snapshot with wrong tenant → blocked
const r5 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [makeSnap(v1, configHashV1, otherTenantId)],
  expectedHistoricalConfigHash: configHashV1,
});
expect('tenant mismatch in chain → REAL_ROLLBACK_TENANT_MISMATCH', r5.blockedReasons.includes('REAL_ROLLBACK_TENANT_MISMATCH'));

// 12. Out-of-order versions → REAL_ROLLBACK_SAME_VERSION
const r6 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV3, snapV2, snapV1],
  expectedHistoricalConfigHash: configHashV1,
});
expect('out-of-order versions → REAL_ROLLBACK_SAME_VERSION', r6.blockedReasons.includes('REAL_ROLLBACK_SAME_VERSION'));

// 13. Target version not in chain → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND
const r7 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV2, snapV3],
  expectedHistoricalConfigHash: configHashV1,
});
expect('target not in chain → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', r7.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));

// 14. configHash mismatch on target → blocked
const r8 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [snapV1, snapV2],
  expectedHistoricalConfigHash: wrongHash,
});
expect('configHash mismatch → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r8.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 15. Deleted snapshot in chain → blocked
const r9 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [{ ...snapV1, deleted: true } as unknown as SettingsHistorySnapshot],
  expectedHistoricalConfigHash: configHashV1,
});
expect('deleted snapshot in chain → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r9.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 16. Overwritten snapshot in chain → blocked
const r10 = validateMultiVersionRollbackSnapshotChain({
  tenantId,
  rollbackTargetVersion: v1,
  snapshots: [{ ...snapV1, overwritten: true } as unknown as SettingsHistorySnapshot],
  expectedHistoricalConfigHash: configHashV1,
});
expect('overwritten snapshot → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', r10.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

if (fail === 0) console.log(`\nPASSED — Feature 006 Phase 4 integration verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
