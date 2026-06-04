import { buildModelConfigApplyTransactionPlan, buildModelConfigRollbackTransactionPlan } from '../modelConfigTransactionPlanService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash, asApplyToken, asRollbackToken } from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigTransactionPlanService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diff123');
const configAfterHash = asDiffHash('after123');
const configBeforeHash = asDiffHash('before123');
const applyToken = asApplyToken('token123');
const rollbackToken = asRollbackToken('rollback123');
const auditTrailId = 'audit-001' as AuditTrailId;
const now = new Date('2024-01-01T00:00:00.000Z');

const applyPlan = buildModelConfigApplyTransactionPlan({
  planId: 'plan-001',
  tenantId,
  approvalId,
  sourceRecommendationId: recId,
  expectedCurrentVersion: v1,
  newVersion: v2,
  applyToken,
  auditTrailId,
  configAfterHash,
  diffHash,
  configBeforeHash,
  proposedWeights: { historicalUsageWeight: 1.0 },
  weightMode: 'normalized',
  createdByHumanUserId: 'user-001',
  now,
});

expect('apply plan executable=false', applyPlan.executable === false);
expect('apply plan aiCanExecute=false', applyPlan.aiCanExecute === false);
expect('apply plan requiresHumanApproval=true', applyPlan.requiresHumanApproval === true);
expect('apply plan _kind correct', applyPlan._kind === 'model_config_apply_transaction_plan');
expect('apply plan blockedReasons empty', applyPlan.blockedReasons.length === 0);

// No function/callback/write/commit/runTransaction properties
const planKeys = Object.keys(applyPlan);
expect('apply plan has no "write" method', !planKeys.includes('write'));
expect('apply plan has no "commit" method', !planKeys.includes('commit'));
expect('apply plan has no "runTransaction" method', !planKeys.includes('runTransaction'));

// settingsHistoryWritePlan guards
expect('settingsHistoryWritePlan immutable=true', applyPlan.settingsHistoryWritePlan.immutable === true);
expect('settingsHistoryWritePlan appendOnly=true', applyPlan.settingsHistoryWritePlan.appendOnly === true);
expect('settingsHistoryWritePlan _kind correct', applyPlan.settingsHistoryWritePlan._kind === 'settings_history_write_plan');

// idempotencyLockPlan
expect('idempotencyLockPlan planOnly=true', applyPlan.idempotencyLockPlan.planOnly === true);
expect('idempotencyLockPlan _kind correct', applyPlan.idempotencyLockPlan._kind === 'idempotency_lock_plan');

// auditEventPlan
expect('auditEventPlan executable=false', applyPlan.auditEventPlan.executable === false);
expect('auditEventPlan aiCanExecute=false', applyPlan.auditEventPlan.aiCanExecute === false);
expect('auditEventPlan _kind correct', applyPlan.auditEventPlan._kind === 'audit_event_plan');

// Rollback plan
const rollbackPlan = buildModelConfigRollbackTransactionPlan({
  planId: 'rb-plan-001',
  tenantId,
  approvalId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  rollbackToken,
  auditTrailId,
  configAfterHash,
  diffHash,
  proposedWeights: { historicalUsageWeight: 0.8 },
  weightMode: 'normalized',
  createdByHumanUserId: 'user-001',
  now,
});

expect('rollback plan executable=false', rollbackPlan.executable === false);
expect('rollback plan aiCanExecute=false', rollbackPlan.aiCanExecute === false);
expect('rollback plan requiresHumanApproval=true', rollbackPlan.requiresHumanApproval === true);
expect('rollback plan _kind correct', rollbackPlan._kind === 'model_config_rollback_transaction_plan');
expect('rollback plan blockedReasons empty', rollbackPlan.blockedReasons.length === 0);

expect('rollback settingsHistoryWritePlan immutable=true', rollbackPlan.settingsHistoryWritePlan.immutable === true);
expect('rollback settingsHistoryWritePlan appendOnly=true', rollbackPlan.settingsHistoryWritePlan.appendOnly === true);
expect('rollback idempotencyLockPlan planOnly=true', rollbackPlan.idempotencyLockPlan.planOnly === true);
expect('rollback auditEventPlan executable=false', rollbackPlan.auditEventPlan.executable === false);
expect('rollback auditEventPlan aiCanExecute=false', rollbackPlan.auditEventPlan.aiCanExecute === false);

if (fail === 0) console.log(`\nPASSED — modelConfigTransactionPlanService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
