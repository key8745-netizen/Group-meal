/**
 * Feature 009 Phase 5B: Monitoring / Audit Payload Builder tests
 * Pure runner — no test framework. npx tsx from repo root.
 */
import {
  buildProductionGatePassedPayload,
  buildProductionGateBlockedPayload,
  buildKillSwitchBlockedPayload,
  buildKillSwitchResetPayload,
  buildDryRunMismatchBlockedPayload,
  buildOperatorConfirmationPayload,
  buildEmergencyDisablePayload,
  buildDeploymentGateBlockedPayload,
  buildMonitoringMetricsSnapshot,
} from '../realModelConfigApplyMonitoringPayloadService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asApplyToken } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 009 Phase 5B: Monitoring Payload Service ===\n');

const tenantId = 'tenant-5b' as TenantId;
const auditTrailId = 'audit-5b' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-5b');
const applyToken = asApplyToken('token-5b');

console.log('[Production gate pass / blocked]\n');
const p1 = buildProductionGatePassedPayload({ tenantId, auditTrailId, approvalId, applyToken });
expect('gate-pass payload non-executable', p1.executable === false);
expect('gate-pass payload eventType', p1.eventType === 'PRODUCTION_GATE_PASSED');
expect('gate-pass payload tenantId set', p1.tenantId === tenantId);
expect('gate-pass payload has generatedAt Date', p1.generatedAt instanceof Date);

const p2 = buildProductionGateBlockedPayload({ tenantId, auditTrailId, blockedReasons: ['F009_PHASE5B_PRODUCTION_DISABLED'] });
expect('gate-blocked payload eventType', p2.eventType === 'PRODUCTION_GATE_BLOCKED');
expect('gate-blocked payload carries blocked reasons', p2.blockedReasons.includes('F009_PHASE5B_PRODUCTION_DISABLED'));
expect('gate-blocked payload non-executable', p2.executable === false);

console.log('\n[Kill switch blocked / reset]\n');
const k1 = buildKillSwitchBlockedPayload({ tenantId, blockedReasons: ['F009_PHASE5B_KILL_SWITCH_ON'], scopeKind: 'global' });
expect('kill-switch-blocked eventType', k1.eventType === 'KILL_SWITCH_BLOCKED');
expect('kill-switch-blocked carries reason', k1.blockedReasons.includes('F009_PHASE5B_KILL_SWITCH_ON'));
expect('kill-switch-blocked details has scopeKind', k1.details['scopeKind'] === 'global');

const k2 = buildKillSwitchResetPayload({
  tenantId: null, auditTrailId, requestedBy: 'a', approvedBy: 'b',
  previousState: 'ON', nextState: 'OFF', reason: 'resolved',
});
expect('kill-switch-reset eventType', k2.eventType === 'KILL_SWITCH_RESET');
expect('kill-switch-reset details captures requestedBy/approvedBy', k2.details['requestedBy'] === 'a' && k2.details['approvedBy'] === 'b');
expect('kill-switch-reset non-executable', k2.executable === false);

console.log('\n[Dry-run mismatch blocked]\n');
const d1 = buildDryRunMismatchBlockedPayload({
  tenantId, auditTrailId, mismatchedFields: ['tenantId', 'diffHash'],
  blockedReasons: ['F009_PHASE5B_DRYRUN_TENANT_MISMATCH', 'F009_PHASE5B_DRYRUN_DIFF_HASH_MISMATCH'],
});
expect('dry-run-mismatch eventType', d1.eventType === 'DRY_RUN_MISMATCH_BLOCKED');
expect('dry-run-mismatch lists mismatched fields', Array.isArray(d1.details['mismatchedFields']) && (d1.details['mismatchedFields'] as string[]).length === 2);
expect('dry-run-mismatch carries blocked reasons', d1.blockedReasons.length === 2);

console.log('\n[Operator confirmation]\n');
const o1 = buildOperatorConfirmationPayload({ tenantId, auditTrailId, operatorUserId: 'op-1', approvalId, passed: true });
expect('operator-confirmation eventType', o1.eventType === 'OPERATOR_CONFIRMATION');
expect('operator-confirmation details has operatorUserId', o1.details['operatorUserId'] === 'op-1');
expect('operator-confirmation passed flag captured', o1.details['passed'] === true);

console.log('\n[Emergency disable]\n');
const e1 = buildEmergencyDisablePayload({ auditTrailId, disabledBy: 'admin-x', reason: 'incident', active: true });
expect('emergency-disable eventType', e1.eventType === 'EMERGENCY_DISABLE');
expect('emergency-disable active → blocked reason present', e1.blockedReasons.includes('F009_PHASE5B_EMERGENCY_DISABLE_ACTIVE'));
expect('emergency-disable non-executable', e1.executable === false);

const e2 = buildEmergencyDisablePayload({ auditTrailId, disabledBy: 'admin-x', reason: 'resolved', active: false });
expect('emergency-disable inactive → no blocked reason', e2.blockedReasons.length === 0);

console.log('\n[Deployment gate blocked]\n');
const dg1 = buildDeploymentGateBlockedPayload({
  expectedProjectId: 'umas-booking-manager', expectedEnvironment: 'production',
  blockedReasons: ['F009_PHASE5B_DEPLOYMENT_GATE_MISSING'],
});
expect('deployment-gate-blocked eventType', dg1.eventType === 'DEPLOYMENT_GATE_BLOCKED');
expect('deployment-gate-blocked details has expectedProjectId', dg1.details['expectedProjectId'] === 'umas-booking-manager');
expect('deployment-gate-blocked carries reason', dg1.blockedReasons.includes('F009_PHASE5B_DEPLOYMENT_GATE_MISSING'));

console.log('\n[Generic monitoring metrics]\n');
const m1 = buildMonitoringMetricsSnapshot({
  windowStart: new Date('2026-06-08T00:00:00Z'),
  windowEnd: new Date('2026-06-08T23:59:59Z'),
  totalAttempts: 100,
  successfulAttempts: 95,
  blockedApplyCount: 5,
  duplicateApplyCount: 1,
  versionConflictCount: 2,
  hashMismatchCount: 0,
  productionErrorCount: 0,
});
expect('metrics snapshot non-executable', m1.executable === false);
expect('metrics snapshot transactionSuccessRate computed', Math.abs(m1.transactionSuccessRate - 0.95) < 1e-9);
expect('metrics snapshot blockedApplyCount', m1.blockedApplyCount === 5);
expect('metrics snapshot duplicateApplyCount', m1.duplicateApplyCount === 1);
expect('metrics snapshot versionConflictCount', m1.versionConflictCount === 2);
expect('metrics snapshot hashMismatchCount', m1.hashMismatchCount === 0);
expect('metrics snapshot productionErrorCount', m1.productionErrorCount === 0);

const m2 = buildMonitoringMetricsSnapshot({
  windowStart: new Date(), windowEnd: new Date(),
  totalAttempts: 0, successfulAttempts: 0,
  blockedApplyCount: 0, duplicateApplyCount: 0, versionConflictCount: 0, hashMismatchCount: 0, productionErrorCount: 0,
});
expect('metrics snapshot handles zero attempts (rate=0)', m2.transactionSuccessRate === 0);

if (fail === 0) console.log(`\nPASSED — Feature 009 Phase 5B Monitoring Payload Service (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
