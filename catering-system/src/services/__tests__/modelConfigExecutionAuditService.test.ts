import { buildModelConfigExecutionAuditEvent } from '../modelConfigExecutionAuditService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import { asModelConfigApprovalId, asModelConfigRecommendationId, asConfigVersion, asDiffHash, asApplyToken, asRollbackToken } from '../../types/modelConfigApply';
import type { ModelConfigExecutionAuditEventType } from '../../types/modelConfigApplyExecution';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigExecutionAuditService ===\n');

const tenantId = 'tenant-001' as TenantId;
const approvalId = asModelConfigApprovalId('approval-001');
const recId = asModelConfigRecommendationId('rec-001');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diff123');
const applyToken = asApplyToken('token123');
const rollbackToken = asRollbackToken('rb-token-123');
const auditTrailId = 'audit-001' as AuditTrailId;
const now = new Date('2024-01-01T00:00:00.000Z');

const allEventTypes: ModelConfigExecutionAuditEventType[] = [
  'MODEL_CONFIG_APPLY_REQUESTED',
  'MODEL_CONFIG_APPLIED_PLAN_CREATED',
  'MODEL_CONFIG_APPLY_BLOCKED',
  'MODEL_CONFIG_ROLLBACK_REQUESTED',
  'MODEL_CONFIG_ROLLBACK_PLAN_CREATED',
  'MODEL_CONFIG_ROLLBACK_BLOCKED',
];

// All 6 event types produce valid events
for (const eventType of allEventTypes) {
  const event = buildModelConfigExecutionAuditEvent({
    eventType,
    tenantId,
    auditTrailId,
    approvalId,
    sourceRecommendationId: recId,
    previousVersion: v1,
    newVersion: v2,
    rollbackTargetVersion: null,
    diffHash,
    applyToken,
    rollbackToken: null,
    blockedReasons: [],
    approvedByHumanUserId: 'user-001',
    rollbackReason: null,
    now,
  });
  expect(`${eventType} → eventType matches`, event.eventType === eventType);
  expect(`${eventType} → metadata.aiCanExecute=false`, event.metadata.aiCanExecute === false);
  expect(`${eventType} → metadata.executable=false`, event.metadata.executable === false);
  expect(`${eventType} → metadata.requiresHumanApproval=true`, event.metadata.requiresHumanApproval === true);
}

// Apply requested event specific checks
const applyEvent = buildModelConfigExecutionAuditEvent({
  eventType: 'MODEL_CONFIG_APPLY_REQUESTED',
  tenantId,
  auditTrailId,
  approvalId,
  sourceRecommendationId: recId,
  previousVersion: v1,
  newVersion: v2,
  rollbackTargetVersion: null,
  diffHash,
  applyToken,
  rollbackToken: null,
  blockedReasons: [],
  approvedByHumanUserId: 'user-001',
  rollbackReason: null,
  now,
});
expect('apply event aiCanExecute=false', applyEvent.metadata.aiCanExecute === false);
expect('apply event executable=false', applyEvent.metadata.executable === false);
expect('apply event tenantId correct', applyEvent.tenantId === tenantId);

// Rollback blocked event
const rollbackBlockedEvent = buildModelConfigExecutionAuditEvent({
  eventType: 'MODEL_CONFIG_ROLLBACK_BLOCKED',
  tenantId,
  auditTrailId,
  approvalId,
  sourceRecommendationId: null,
  previousVersion: v2,
  newVersion: null,
  rollbackTargetVersion: v1,
  diffHash: null,
  applyToken: null,
  rollbackToken,
  blockedReasons: ['ROLLBACK_EXEC_AI_CALLER_BLOCKED'],
  approvedByHumanUserId: null,
  rollbackReason: 'config caused issues',
  now,
});
expect('rollback blocked event correct eventType', rollbackBlockedEvent.eventType === 'MODEL_CONFIG_ROLLBACK_BLOCKED');
expect('rollback blocked event has blocked reasons', rollbackBlockedEvent.blockedReasons.includes('ROLLBACK_EXEC_AI_CALLER_BLOCKED'));
expect('rollback blocked event rollbackTargetVersion correct', rollbackBlockedEvent.rollbackTargetVersion === v1);
expect('rollback blocked event metadata.rollbackReason set', rollbackBlockedEvent.metadata.rollbackReason === 'config caused issues');

// No Firestore call — event is pure data, no methods
expect('event is plain data (no write method)', typeof (applyEvent as unknown as Record<string, unknown>)['write'] !== 'function');
expect('event is plain data (no set method)', typeof (applyEvent as unknown as Record<string, unknown>)['set'] !== 'function');

if (fail === 0) console.log(`\nPASSED — modelConfigExecutionAuditService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
