/**
 * Feature 006 Phase 3 integration tests:
 *  - mapSettingsHistorySnapshotToHistoricalHash (snapshot mapping)
 *  - buildLockCleanupDryRunPlan (9 decision rules)
 *  - Service guard regression
 */
import {
  mapSettingsHistorySnapshotToHistoricalHash,
} from '../modelConfigHistoricalValidationService';
import type { SettingsHistorySnapshot } from '../modelConfigHistoricalValidationService';
import {
  buildLockLifecycleDocument,
  buildLockCleanupDryRunPlan,
  validateServiceGuardEntrance,
} from '../modelConfigLockCleanupService';
import type { LockLifecycleDocument } from '../modelConfigLockCleanupService';
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

console.log('\n=== Feature 006 Phase 3 Integration ===\n');

const tenantId = 'tenant-p3' as TenantId;
const otherTenantId = 'tenant-other' as TenantId;
const auditTrailId = 'audit-p3' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-p3');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const configHash = asDiffHash('config-hash-p3');
const wrongHash = asDiffHash('wrong-hash-p3');
const applyToken = asApplyToken('token-p3');
const now = new Date('2026-06-04T10:00:00.000Z');

// ─── settingsHistory Snapshot Mapping ────────────────────────────────────────

console.log('[mapSettingsHistorySnapshotToHistoricalHash]\n');

const validSnap: SettingsHistorySnapshot = {
  _kind: 'settings_history_snapshot',
  tenantId,
  version: v1,
  configHash,
  immutable: true,
  sourceAuditTrailId: auditTrailId as string,
  approvalId: approvalId as string,
  createdAt: now,
  createdByHumanUserId: 'user-001',
};

// 1. valid snapshot → mapped
const m1 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: validSnap,
});
expect('valid snapshot → valid=true', m1.valid === true);
expect('valid snapshot → mappedConfigHash set', m1.mappedConfigHash === configHash);
expect('valid snapshot → 0 blockedReasons', m1.blockedReasons.length === 0);

// 2. missing snapshot → blocked
const m2 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: null,
});
expect('missing snapshot → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', m2.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));
expect('missing snapshot → mappedConfigHash null', m2.mappedConfigHash === null);

// 3. tenant mismatch → blocked immediately
const m3 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: { ...validSnap, tenantId: otherTenantId },
});
expect('tenant mismatch → REAL_ROLLBACK_TENANT_MISMATCH', m3.blockedReasons.includes('REAL_ROLLBACK_TENANT_MISMATCH'));
expect('tenant mismatch → mappedConfigHash null', m3.mappedConfigHash === null);

// 4. version mismatch
const m4 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: { ...validSnap, version: v2 },
});
expect('version mismatch → REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND', m4.blockedReasons.includes('REAL_ROLLBACK_TARGET_VERSION_NOT_FOUND'));

// 5. configHash mismatch
const m5 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: { ...validSnap, configHash: wrongHash },
});
expect('configHash mismatch → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', m5.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 6. deleted snapshot → blocked
const m6 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: { ...validSnap, deleted: true } as unknown as SettingsHistorySnapshot,
});
expect('deleted snapshot → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', m6.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 7. overwritten snapshot → blocked
const m7 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  historicalSnapshot: { ...validSnap, overwritten: true } as unknown as SettingsHistorySnapshot,
});
expect('overwritten snapshot → REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH', m7.blockedReasons.includes('REAL_ROLLBACK_HISTORICAL_CONFIG_HASH_MISMATCH'));

// 8. extended metadata required but missing sourceAuditTrailId
const m8 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  requireExtendedMetadata: true,
  historicalSnapshot: { ...validSnap, sourceAuditTrailId: undefined },
});
expect('missing sourceAuditTrailId (extended) → REAL_ROLLBACK_MISSING_AUDIT_TRAIL', m8.blockedReasons.includes('REAL_ROLLBACK_MISSING_AUDIT_TRAIL'));

// 9. extended metadata required but missing approvalId
const m9 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  requireExtendedMetadata: true,
  historicalSnapshot: { ...validSnap, approvalId: undefined },
});
expect('missing approvalId (extended) → REAL_ROLLBACK_APPROVAL_NOT_APPROVED', m9.blockedReasons.includes('REAL_ROLLBACK_APPROVAL_NOT_APPROVED'));

// 10. valid with extended metadata → passes
const m10 = mapSettingsHistorySnapshotToHistoricalHash({
  tenantId,
  rollbackTargetVersion: v1,
  expectedHistoricalConfigHash: configHash,
  requireExtendedMetadata: true,
  historicalSnapshot: validSnap,
});
expect('valid with extended metadata → valid=true', m10.valid === true);

// ─── Lock Cleanup Dry-run Plan (9 decision rules) ────────────────────────────

console.log('\n[buildLockCleanupDryRunPlan — 9 decision rules]\n');

const baseLock = buildLockLifecycleDocument({
  lockId: `${tenantId}:${applyToken}`,
  token: applyToken,
  tenantId,
  auditTrailId,
  approvalId,
  now,
});

// Helper: create lock at a given status and timing
const makeTimedLock = (
  status: LockLifecycleDocument['status'],
  opts: { expiresAt?: Date; cleanupEligibleAt?: Date; consumedAt?: Date } = {},
): LockLifecycleDocument => ({
  ...baseLock,
  status,
  expiresAt: opts.expiresAt ?? baseLock.expiresAt,
  cleanupEligibleAt: opts.cleanupEligibleAt ?? baseLock.cleanupEligibleAt,
  consumedAt: opts.consumedAt,
});

const past = (ms: number) => new Date(now.getTime() - ms);
const future = (ms: number) => new Date(now.getTime() + ms);

// Rule 1: lockOwner AI → BLOCKED_INVALID_OWNER
const r1 = buildLockCleanupDryRunPlan({
  lock: { ...baseLock, lockOwner: 'AI' as typeof baseLock.lockOwner },
  now,
});
expect('Rule 1: AI owner → BLOCKED_INVALID_OWNER', r1.cleanupDecision === 'BLOCKED_INVALID_OWNER');
expect('Rule 1: dryRunOnly=true', r1.dryRunOnly === true);
expect('Rule 1: executable=false', r1.executable === false);
expect('Rule 1: aiCanExecute=false', r1.aiCanExecute === false);
expect('Rule 1: aiCanTrigger=false', r1.aiCanTrigger === false);
expect('Rule 1: aiCanOwnLock=false', r1.aiCanOwnLock === false);

// Rule 2: missing expiresAt → BLOCKED_INVALID_LOCK_METADATA
const r2 = buildLockCleanupDryRunPlan({
  lock: { ...baseLock, expiresAt: null as unknown as Date },
  now,
});
expect('Rule 2: missing expiresAt → BLOCKED_INVALID_LOCK_METADATA', r2.cleanupDecision === 'BLOCKED_INVALID_LOCK_METADATA');

// Rule 3: ACTIVE before expiresAt → KEEP_ACTIVE
const r3 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('ACTIVE', { expiresAt: future(100_000), cleanupEligibleAt: future(160_000) }),
  now,
});
expect('Rule 3: ACTIVE before expiresAt → KEEP_ACTIVE', r3.cleanupDecision === 'KEEP_ACTIVE');

// Rule 4: ACTIVE after expiresAt but before cleanupEligibleAt → KEEP_GRACE_PERIOD
const r4 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('ACTIVE', { expiresAt: past(10_000), cleanupEligibleAt: future(50_000) }),
  now,
});
expect('Rule 4: ACTIVE in grace period → KEEP_GRACE_PERIOD', r4.cleanupDecision === 'KEEP_GRACE_PERIOD');

// Rule 5: ACTIVE after cleanupEligibleAt → CLEANUP_ELIGIBLE_STALE_ACTIVE
const r5 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('ACTIVE', { expiresAt: past(70_000), cleanupEligibleAt: past(10_000) }),
  now,
});
expect('Rule 5: stale ACTIVE → CLEANUP_ELIGIBLE_STALE_ACTIVE', r5.cleanupDecision === 'CLEANUP_ELIGIBLE_STALE_ACTIVE');

// Rule 6: CONSUMED before cleanupEligibleAt → KEEP_CONSUMED
const r6 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('CONSUMED', { expiresAt: past(10_000), cleanupEligibleAt: future(50_000), consumedAt: past(5_000) }),
  now,
});
expect('Rule 6: CONSUMED before cleanupEligibleAt → KEEP_CONSUMED', r6.cleanupDecision === 'KEEP_CONSUMED');

// Rule 7: CONSUMED after cleanupEligibleAt → CLEANUP_ELIGIBLE_CONSUMED
const r7 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('CONSUMED', { expiresAt: past(70_000), cleanupEligibleAt: past(10_000), consumedAt: past(65_000) }),
  now,
});
expect('Rule 7: CONSUMED eligible → CLEANUP_ELIGIBLE_CONSUMED', r7.cleanupDecision === 'CLEANUP_ELIGIBLE_CONSUMED');

// Rule 8: EXPIRED after cleanupEligibleAt → CLEANUP_ELIGIBLE_EXPIRED
const r8 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('EXPIRED', { expiresAt: past(100_000), cleanupEligibleAt: past(40_000) }),
  now,
});
expect('Rule 8: EXPIRED eligible → CLEANUP_ELIGIBLE_EXPIRED', r8.cleanupDecision === 'CLEANUP_ELIGIBLE_EXPIRED');

// Rule 9: PLANNED past TTL → CLEANUP_ELIGIBLE_ABANDONED_PLAN
const r9 = buildLockCleanupDryRunPlan({
  lock: makeTimedLock('PLANNED', { expiresAt: past(10_000), cleanupEligibleAt: future(50_000) }),
  now,
});
expect('Rule 9: PLANNED past TTL → CLEANUP_ELIGIBLE_ABANDONED_PLAN', r9.cleanupDecision === 'CLEANUP_ELIGIBLE_ABANDONED_PLAN');

// Maintenance audit event plan invariants
expect('audit plan _kind correct', r5.maintenanceAuditEventPlan._kind === 'maintenance_audit_event_plan');
expect('audit plan executable=false', r5.maintenanceAuditEventPlan.executable === false);
expect('audit plan aiCanExecute=false', r5.maintenanceAuditEventPlan.aiCanExecute === false);
expect('audit plan aiCanOwnCleanup=false', r5.maintenanceAuditEventPlan.aiCanOwnCleanup === false);
expect('audit plan cleanupOwner=SYSTEM_MAINTENANCE', r5.maintenanceAuditEventPlan.cleanupOwner === 'SYSTEM_MAINTENANCE');

// ─── Service Guard Regression ─────────────────────────────────────────────────

console.log('\n[Service Guard Regression]\n');

// 11. valid human caller
const sg1 = validateServiceGuardEntrance({ callerType: 'human', callerUserId: 'user-001', tenantId: tenantId as string, hasApproval: true });
expect('valid human → allowed', sg1.allowed === true);

// 12. AI always blocked
const sg2 = validateServiceGuardEntrance({ callerType: 'ai', callerUserId: 'ai-agent', tenantId: tenantId as string, hasApproval: true });
expect('AI caller → blocked', sg2.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));

// 13. AI + AdminSdk still blocked
const sg3 = validateServiceGuardEntrance({ callerType: 'ai', callerUserId: 'ai-agent', tenantId: tenantId as string, hasApproval: true, isAdminSdk: true });
expect('AI + AdminSdk → blocked', sg3.blockedReasons.includes('REAL_APPLY_AI_CALLER_BLOCKED'));

// 14. serviceAccount alone no userId
const sg4 = validateServiceGuardEntrance({ callerType: 'human', callerUserId: '', tenantId: tenantId as string, hasApproval: true, isServiceAccount: true });
expect('serviceAccount no userId → blocked', sg4.blockedReasons.includes('REAL_APPLY_MISSING_HUMAN_APPROVER'));

// 15. cleanup owner cannot be AI — validated via dry-run plan
const r15 = buildLockCleanupDryRunPlan({ lock: baseLock, now });
expect('cleanup plan cleanupOwner !== AI', r15.cleanupOwner !== ('ai' as typeof r15.cleanupOwner));
expect('cleanup plan cleanupOwner = SYSTEM_MAINTENANCE', r15.cleanupOwner === 'SYSTEM_MAINTENANCE');

if (fail === 0) console.log(`\nPASSED — Feature 006 Phase 3 integration verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
