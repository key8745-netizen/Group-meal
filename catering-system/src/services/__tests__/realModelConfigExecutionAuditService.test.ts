/**
 * Feature 007 Phase 1: Audit Event Payload tests
 */
import { buildRealModelConfigApplyAuditEventPayload } from '../realModelConfigExecutionAuditService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
  asModelConfigRecommendationId,
} from '../../types/modelConfigApply';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== Feature 007 Phase 1: Audit Event Payload ===\n');

const tenantId = 'tenant-007' as TenantId;
const auditTrailId = 'audit-007' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-007');
const recId = asModelConfigRecommendationId('rec-007');
const applyToken = asApplyToken('token-007');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const hashA = asDiffHash('hash-a');
const hashB = asDiffHash('hash-b');
const hashD = asDiffHash('hash-d');
const now = new Date('2026-06-04T12:00:00.000Z');

const base = {
  tenantId, approvalId, sourceRecommendationId: recId, auditTrailId,
  expectedCurrentVersion: v1, newVersion: v2,
  configBeforeHash: hashA, configAfterHash: hashB, diffHash: hashD,
  applyToken, callerUserId: 'user-007', callerType: 'HUMAN' as const, now,
};

// 1. MODEL_CONFIG_APPLY_REQUESTED
const e1 = buildRealModelConfigApplyAuditEventPayload({ ...base, eventType: 'MODEL_CONFIG_APPLY_REQUESTED' });
expect('requested _kind correct', e1._kind === 'real_model_config_audit_event_payload');
expect('requested executable=false', e1.executable === false);
expect('requested aiCanExecute=false', e1.aiCanExecute === false);
expect('requested eventType', e1.eventType === 'MODEL_CONFIG_APPLY_REQUESTED');
expect('requested tenantId', (e1.tenantId as string) === (tenantId as string));
expect('requested approvalId', (e1.approvalId as string) === (approvalId as string));
expect('requested auditTrailId', (e1.auditTrailId as string) === (auditTrailId as string));
expect('requested applyToken', (e1.applyToken as string) === (applyToken as string));
expect('requested callerUserId', e1.callerUserId === 'user-007');
expect('requested callerType=HUMAN', e1.callerType === 'HUMAN');
expect('requested generatedAt', e1.generatedAt.getTime() === now.getTime());
expect('requested 0 blockedReasons', e1.blockedReasons.length === 0);

// 2. MODEL_CONFIG_APPLY_BLOCKED with reasons
const e2 = buildRealModelConfigApplyAuditEventPayload({
  ...base,
  eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
  blockedReasons: ['REAL_EXEC_AI_CALLER_BLOCKED', 'REAL_EXEC_MISSING_HUMAN_USER_ID'],
});
expect('blocked → blockedReasons propagated', e2.blockedReasons.includes('REAL_EXEC_AI_CALLER_BLOCKED'));
expect('blocked → all reasons present', e2.blockedReasons.length === 2);
expect('blocked note mentions reasons', e2.note.includes('REAL_EXEC_AI_CALLER_BLOCKED'));

// 3. MODEL_CONFIG_IDEMPOTENCY_BLOCKED
const e3 = buildRealModelConfigApplyAuditEventPayload({
  ...base,
  eventType: 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED',
  blockedReasons: ['REAL_EXEC_LOCK_DUPLICATE_TOKEN'],
});
expect('idempotency blocked eventType', e3.eventType === 'MODEL_CONFIG_IDEMPOTENCY_BLOCKED');
expect('idempotency blocked note mentions applyToken', e3.note.includes(applyToken as string));
expect('idempotency blocked → REAL_EXEC_LOCK_DUPLICATE_TOKEN', e3.blockedReasons.includes('REAL_EXEC_LOCK_DUPLICATE_TOKEN'));

// 4. MODEL_CONFIG_VERSION_CONFLICT_BLOCKED
const e4 = buildRealModelConfigApplyAuditEventPayload({
  ...base,
  eventType: 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED',
  blockedReasons: ['REAL_EXEC_LOCK_VERSION_CONFLICT'],
});
expect('version conflict eventType', e4.eventType === 'MODEL_CONFIG_VERSION_CONFLICT_BLOCKED');

// 5. MODEL_CONFIG_APPLIED_PLAN_CREATED (success path)
const e5 = buildRealModelConfigApplyAuditEventPayload({ ...base, eventType: 'MODEL_CONFIG_APPLIED_PLAN_CREATED' });
expect('plan created → executable=false', e5.executable === false);
expect('plan created → 0 blockedReasons', e5.blockedReasons.length === 0);

// 6. MODEL_CONFIG_APPLY_STARTED_PLAN
const e6 = buildRealModelConfigApplyAuditEventPayload({ ...base, eventType: 'MODEL_CONFIG_APPLY_STARTED_PLAN' });
expect('started plan eventType', e6.eventType === 'MODEL_CONFIG_APPLY_STARTED_PLAN');

// 7. MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN
const e7 = buildRealModelConfigApplyAuditEventPayload({
  ...base,
  eventType: 'MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN',
  blockedReasons: ['REAL_EXEC_MISSING_AUDIT_TRAIL_ID'],
});
expect('audit write failed → eventType correct', e7.eventType === 'MODEL_CONFIG_AUDIT_WRITE_FAILED_PLAN');

// 8. All hash fields present
expect('e1 configBeforeHash set', (e1.configBeforeHash as string) === (hashA as string));
expect('e1 configAfterHash set', (e1.configAfterHash as string) === (hashB as string));
expect('e1 diffHash set', (e1.diffHash as string) === (hashD as string));
expect('e1 sourceRecommendationId set', (e1.sourceRecommendationId as string) === (recId as string));
expect('e1 newVersion set', (e1.newVersion as string) === (v2 as string));
expect('e1 expectedCurrentVersion set', (e1.expectedCurrentVersion as string) === (v1 as string));

if (fail === 0) console.log(`\nPASSED — Feature 007 Phase 1 Audit Event (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
