import { buildModelConfigAuditEvent } from '../modelConfigApplyAuditService';
import { asDiffHash, asConfigVersion, asModelConfigApprovalId, asModelConfigRecommendationId } from '../../types/modelConfigApply';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';

const T1 = 'tenant-1' as TenantId;
const AUDIT = 'audit-1' as AuditTrailId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const HASH = asDiffHash('a'.repeat(64));
const APPROVAL = asModelConfigApprovalId('approval-1');
const REC = asModelConfigRecommendationId('rec-1');
const NOW = new Date('2026-01-01');

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigApplyAuditService ---');

const allEvents = [
  'MODEL_CONFIG_REVIEW_STARTED',
  'MODEL_CONFIG_APPROVED_BY_HUMAN',
  'MODEL_CONFIG_REJECTED_BY_HUMAN',
  'MODEL_CONFIG_APPLY_PLAN_CREATED',
  'MODEL_CONFIG_APPLY_BLOCKED',
  'MODEL_CONFIG_ROLLBACK_PLAN_CREATED',
  'MODEL_CONFIG_ROLLBACK_BLOCKED',
] as const;

for (const eventType of allEvents) {
  const ev = buildModelConfigAuditEvent({ eventType, tenantId: T1, auditTrailId: AUDIT, now: NOW });
  expect(`${eventType}: eventType correct`, ev.eventType === eventType);
  expect(`${eventType}: tenantId correct`, ev.tenantId === T1);
  expect(`${eventType}: auditTrailId correct`, ev.auditTrailId === AUDIT);
  expect(`${eventType}: aiCanApply false`, ev.metadata.aiCanApply === false);
  expect(`${eventType}: requiresHumanApproval true`, ev.metadata.requiresHumanApproval === true);
  expect(`${eventType}: blockedReasons array`, Array.isArray(ev.blockedReasons));
}

// Full fields
const full = buildModelConfigAuditEvent({
  eventType: 'MODEL_CONFIG_APPROVED_BY_HUMAN',
  tenantId: T1,
  auditTrailId: AUDIT,
  sourceRecommendationId: REC,
  approvalId: APPROVAL,
  previousVersion: V1,
  newVersion: V2,
  diffHash: HASH,
  blockedReasons: [],
  approvedByHumanUserId: 'user-123',
  appliedByHumanUserId: null,
  rollbackReason: null,
  rollbackReference: null,
  now: NOW,
});
expect('full event: sourceRecommendationId', full.sourceRecommendationId === REC);
expect('full event: approvalId', full.approvalId === APPROVAL);
expect('full event: previousVersion', full.previousVersion === V1);
expect('full event: newVersion', full.newVersion === V2);
expect('full event: diffHash', full.diffHash === HASH);
expect('full event: approvedByHumanUserId', full.metadata.approvedByHumanUserId === 'user-123');
expect('full event: appliedByHumanUserId null', full.metadata.appliedByHumanUserId === null);

// Blocked event
const blocked = buildModelConfigAuditEvent({
  eventType: 'MODEL_CONFIG_APPLY_BLOCKED',
  tenantId: T1,
  auditTrailId: AUDIT,
  blockedReasons: ['CONFIG_APPLY_AI_CALLER_BLOCKED'],
  now: NOW,
});
expect('blocked event: blockedReasons propagated', blocked.blockedReasons.includes('CONFIG_APPLY_AI_CALLER_BLOCKED'));

// Pure — no I/O
expect('buildModelConfigAuditEvent is synchronous', !(full instanceof Promise));

if (fail === 0) console.log(`\nPASSED — modelConfigApplyAuditService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
