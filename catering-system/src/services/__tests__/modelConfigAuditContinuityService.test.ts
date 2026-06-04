import {
  validateApplyAuditMetadataContinuity,
  validateRollbackAuditMetadataContinuity,
  validateRecommendationToTransactionPlanContinuity,
  computeRollbackReasonHash,
} from '../modelConfigAuditContinuityService';
import type { TenantId, AuditTrailId } from '../../types/aiBoundary';
import {
  asModelConfigApprovalId,
  asModelConfigRecommendationId,
  asConfigVersion,
  asDiffHash,
  asApplyToken,
  asRollbackToken,
} from '../../types/modelConfigApply';
import type { ModelConfigRecommendation } from '../../types/predictionEngine';
import type { PersistedHumanModelConfigApproval, ModelConfigApplyTransactionPlan } from '../../types/modelConfigApplyExecution';
import { buildModelConfigApplyTransactionPlan } from '../modelConfigTransactionPlanService';

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('\n=== modelConfigAuditContinuityService ===\n');

const tenantId = 'tenant-abc' as TenantId;
const auditTrailId = 'audit-abc' as AuditTrailId;
const approvalId = asModelConfigApprovalId('approval-abc');
const recId = asModelConfigRecommendationId('rec-abc');
const v1 = asConfigVersion('v1');
const v2 = asConfigVersion('v2');
const diffHash = asDiffHash('diffhash-abc');
const beforeHash = asDiffHash('before-abc');
const afterHash = asDiffHash('after-abc');
const applyToken = asApplyToken('applytoken-abc');
const rollbackToken = asRollbackToken('rollbacktoken-abc');

// ── Apply Audit Metadata ──────────────────────────────────────────────────────

const baseApplyMeta = {
  tenantId,
  sourceRecommendationId: recId,
  approvalId,
  auditTrailId,
  expectedCurrentVersion: v1,
  newVersion: v2,
  configBeforeHash: beforeHash,
  configAfterHash: afterHash,
  diffHash,
  applyToken,
};

console.log('[validateApplyAuditMetadataContinuity]\n');

// 1. valid case passes
const r1 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta });
expect('valid apply metadata → valid=true', r1.valid === true);
expect('valid apply metadata → 0 blockedReasons', r1.blockedReasons.length === 0);

// 2. diffHash mismatch
const r2 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, diffHash: asDiffHash('other-diff') });
expect('diffHash mismatch → AUDIT_CONTINUITY_DIFF_HASH_MISMATCH', r2.blockedReasons.includes('AUDIT_CONTINUITY_DIFF_HASH_MISMATCH'));
expect('diffHash mismatch → valid=false', r2.valid === false);

// 3. configBeforeHash mismatch
const r3 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, configBeforeHash: asDiffHash('other-before') });
expect('configBeforeHash mismatch → AUDIT_CONTINUITY_CONFIG_BEFORE_HASH_MISMATCH', r3.blockedReasons.includes('AUDIT_CONTINUITY_CONFIG_BEFORE_HASH_MISMATCH'));
expect('configBeforeHash mismatch → valid=false', r3.valid === false);

// 4. configAfterHash mismatch
const r4 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, configAfterHash: asDiffHash('other-after') });
expect('configAfterHash mismatch → AUDIT_CONTINUITY_CONFIG_AFTER_HASH_MISMATCH', r4.blockedReasons.includes('AUDIT_CONTINUITY_CONFIG_AFTER_HASH_MISMATCH'));
expect('configAfterHash mismatch → valid=false', r4.valid === false);

// 5. auditTrailId mismatch
const r5 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, auditTrailId: 'other-audit' as AuditTrailId });
expect('auditTrailId mismatch → AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH', r5.blockedReasons.includes('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH'));
expect('auditTrailId mismatch → valid=false', r5.valid === false);

// 6. approvalId mismatch
const r6 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, approvalId: asModelConfigApprovalId('other-approval') });
expect('approvalId mismatch → AUDIT_CONTINUITY_APPROVAL_ID_MISMATCH', r6.blockedReasons.includes('AUDIT_CONTINUITY_APPROVAL_ID_MISMATCH'));
expect('approvalId mismatch → valid=false', r6.valid === false);

// 7. sourceRecommendationId mismatch
const r7 = validateApplyAuditMetadataContinuity(baseApplyMeta, { ...baseApplyMeta, sourceRecommendationId: asModelConfigRecommendationId('other-rec') });
expect('sourceRecommendationId mismatch → AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH', r7.blockedReasons.includes('AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH'));
expect('sourceRecommendationId mismatch → valid=false', r7.valid === false);

// ── Rollback Audit Metadata ───────────────────────────────────────────────────

console.log('\n[validateRollbackAuditMetadataContinuity]\n');

const baseRollbackReason = 'config regression detected';
const baseRollbackMeta = {
  tenantId,
  approvalId,
  auditTrailId,
  rollbackTargetVersion: v1,
  expectedCurrentVersion: v2,
  newVersion: v1,
  rollbackReason: baseRollbackReason,
  rollbackReasonHash: computeRollbackReasonHash(baseRollbackReason),
  rollbackToken,
};

// 8. valid rollback case passes
const rr1 = validateRollbackAuditMetadataContinuity(baseRollbackMeta, { ...baseRollbackMeta });
expect('valid rollback metadata → valid=true', rr1.valid === true);
expect('valid rollback metadata → 0 blockedReasons', rr1.blockedReasons.length === 0);

// 9. rollbackReason mismatch
const rr2 = validateRollbackAuditMetadataContinuity(baseRollbackMeta, { ...baseRollbackMeta, rollbackReason: 'different reason' });
expect('rollbackReason mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH', rr2.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH'));
expect('rollbackReason mismatch → valid=false', rr2.valid === false);

// 10. rollbackToken mismatch
const rr3 = validateRollbackAuditMetadataContinuity(baseRollbackMeta, { ...baseRollbackMeta, rollbackToken: asRollbackToken('other-token') });
expect('rollbackToken mismatch → AUDIT_CONTINUITY_ROLLBACK_TOKEN_MISMATCH', rr3.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_TOKEN_MISMATCH'));
expect('rollbackToken mismatch → valid=false', rr3.valid === false);

// 11. rollbackTargetVersion mismatch
const rr4 = validateRollbackAuditMetadataContinuity(baseRollbackMeta, { ...baseRollbackMeta, rollbackTargetVersion: asConfigVersion('v0') });
expect('rollbackTargetVersion mismatch → AUDIT_CONTINUITY_ROLLBACK_TARGET_VERSION_MISMATCH', rr4.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_TARGET_VERSION_MISMATCH'));
expect('rollbackTargetVersion mismatch → valid=false', rr4.valid === false);

// 12. rollback auditTrailId mismatch
const rr5 = validateRollbackAuditMetadataContinuity(baseRollbackMeta, { ...baseRollbackMeta, auditTrailId: 'different-audit' as AuditTrailId });
expect('rollback auditTrailId mismatch → AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH', rr5.blockedReasons.includes('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH'));
expect('rollback auditTrailId mismatch → valid=false', rr5.valid === false);

// ── Recommendation → TransactionPlan Continuity ───────────────────────────────

console.log('\n[validateRecommendationToTransactionPlanContinuity]\n');

const recommendation: ModelConfigRecommendation = {
  _kind: 'recommendation',
  recommendationId: 'rec-chain-001',
  tenantId,
  auditTrailId,
  proposedWeights: { historicalUsageWeight: 0.5 },
  rationale: ['test rationale'],
  blockedReasons: [],
  warnings: [],
  aiCanApply: false,
  requiresHumanApproval: true,
  createdAt: new Date(),
};

const approval: PersistedHumanModelConfigApproval = {
  _kind: 'persisted_human_model_config_approval',
  approvalId,
  tenantId,
  sourceRecommendationId: asModelConfigRecommendationId('rec-chain-001'),
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

const plan: ModelConfigApplyTransactionPlan = buildModelConfigApplyTransactionPlan({
  planId: 'plan-001',
  tenantId,
  approvalId,
  sourceRecommendationId: asModelConfigRecommendationId('rec-chain-001'),
  expectedCurrentVersion: v1,
  newVersion: v2,
  applyToken,
  auditTrailId,
  configAfterHash: afterHash,
  diffHash,
  configBeforeHash: beforeHash,
  proposedWeights: { historicalUsageWeight: 0.5 },
  weightMode: 'normalized',
  createdByHumanUserId: 'user-001',
});

// 13. valid chain passes
const rc1 = validateRecommendationToTransactionPlanContinuity(recommendation, approval, plan);
expect('valid recommendation→plan chain → valid=true', rc1.valid === true);
expect('valid recommendation→plan chain → 0 blockedReasons', rc1.blockedReasons.length === 0);

// 14. recommendationId mismatch (approval has different sourceRecommendationId)
const approvalWithMismatch: PersistedHumanModelConfigApproval = {
  ...approval,
  sourceRecommendationId: asModelConfigRecommendationId('rec-OTHER'),
};
const rc2 = validateRecommendationToTransactionPlanContinuity(recommendation, approvalWithMismatch, plan);
expect('recommendationId mismatch → AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH', rc2.blockedReasons.includes('AUDIT_CONTINUITY_SOURCE_RECOMMENDATION_MISMATCH'));
expect('recommendationId mismatch → valid=false', rc2.valid === false);

// 15. tenant mismatch
const recommendationOtherTenant: ModelConfigRecommendation = {
  ...recommendation,
  tenantId: 'other-tenant' as TenantId,
};
const rc3 = validateRecommendationToTransactionPlanContinuity(recommendationOtherTenant, approval, plan);
expect('tenant mismatch → AUDIT_CONTINUITY_TENANT_MISMATCH', rc3.blockedReasons.includes('AUDIT_CONTINUITY_TENANT_MISMATCH'));
expect('tenant mismatch → valid=false', rc3.valid === false);

// 16. auditTrailId mismatch in chain
const recommendationOtherAudit: ModelConfigRecommendation = {
  ...recommendation,
  auditTrailId: 'other-audit-trail' as AuditTrailId,
};
const rc4 = validateRecommendationToTransactionPlanContinuity(recommendationOtherAudit, approval, plan);
expect('auditTrailId mismatch in chain → AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH', rc4.blockedReasons.includes('AUDIT_CONTINUITY_AUDIT_TRAIL_MISMATCH'));
expect('auditTrailId mismatch in chain → valid=false', rc4.valid === false);

// ── Phase 4: rollbackReasonHash cross-validation ─────────────────────────────

console.log('\n[Phase 4: rollbackReasonHash cross-validation]\n');

// 17. rollbackReasonHash mismatch → blocked
const rrh1 = validateRollbackAuditMetadataContinuity(
  baseRollbackMeta,
  { ...baseRollbackMeta, rollbackReasonHash: 'wrong-hash' },
);
expect('rollbackReasonHash mismatch → valid=false', rrh1.valid === false);
expect('rollbackReasonHash mismatch → AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH', rrh1.blockedReasons.includes('AUDIT_CONTINUITY_ROLLBACK_REASON_MISMATCH'));

// 18. computeRollbackReasonHash determinism
const h1 = computeRollbackReasonHash('test reason');
const h2 = computeRollbackReasonHash('test reason');
expect('computeRollbackReasonHash same input → same hash', h1 === h2);

// 19. computeRollbackReasonHash different input → different hash
const h3 = computeRollbackReasonHash('different reason');
expect('computeRollbackReasonHash different input → different hash', h1 !== h3);

// 20. valid rollback with matching rollbackReasonHash passes
const computedHash = computeRollbackReasonHash(baseRollbackReason);
const rrh2 = validateRollbackAuditMetadataContinuity(
  { ...baseRollbackMeta, rollbackReasonHash: computedHash },
  { ...baseRollbackMeta, rollbackReasonHash: computedHash },
);
expect('matching rollbackReasonHash → valid=true', rrh2.valid === true);

if (fail === 0) console.log(`\nPASSED — modelConfigAuditContinuityService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
