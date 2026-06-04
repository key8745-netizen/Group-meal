import {
  assertTenantMatch,
  assertRollbackTenantMatch,
  assertHumanCaller,
  validateWeights,
  validateApplyPlanInput,
  validateRollbackPlanInput,
} from '../modelConfigValidationService';
import type { BlockedReason, TenantId } from '../../types/aiBoundary';
import { asApplyToken, asRollbackToken, asConfigVersion, asModelConfigApprovalId, asModelConfigRecommendationId } from '../../types/modelConfigApply';

const T1 = 'tenant-1' as TenantId;
const T2 = 'tenant-2' as TenantId;
const V1 = asConfigVersion('v1');
const V2 = asConfigVersion('v2');
const APPROVAL = asModelConfigApprovalId('approval-1');
const REC = asModelConfigRecommendationId('rec-1');
const AUDIT = 'audit-1' as import('../../types/aiBoundary').AuditTrailId;
const TOKEN = asApplyToken('tok-abc');
const RTOKEN = asRollbackToken('rtok-xyz');

const VALID_WEIGHTS = { historicalUsageWeight: 1.0, wasteRiskWeight: 1.0, receivingDeltaWeight: 1.0, safetyStockWeight: 1.0 };

let pass = 0; let fail = 0;
function expect(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log('--- modelConfigValidationService ---');

// ─── Tenant Guard ─────────────────────────────────────────────────────────────
{
  const b: BlockedReason[] = [];
  const ok = assertTenantMatch(T1, T1, b);
  expect('tenant match → passes', ok && b.length === 0);
}
{
  const b: BlockedReason[] = [];
  const ok = assertTenantMatch(T1, T2, b);
  expect('tenant mismatch → CONFIG_APPLY_TENANT_MISMATCH', !ok && b.includes('CONFIG_APPLY_TENANT_MISMATCH'));
}
{
  const b: BlockedReason[] = [];
  assertRollbackTenantMatch(T1, T2, b);
  expect('rollback tenant mismatch → CONFIG_ROLLBACK_TENANT_MISMATCH', b.includes('CONFIG_ROLLBACK_TENANT_MISMATCH'));
}

// ─── Caller Guard ─────────────────────────────────────────────────────────────
{
  const b: BlockedReason[] = [];
  assertHumanCaller('human', b, 'apply');
  expect('human caller → not blocked', b.length === 0);
}
{
  const b: BlockedReason[] = [];
  assertHumanCaller('ai', b, 'apply');
  expect('AI caller apply → CONFIG_APPLY_AI_CALLER_BLOCKED', b.includes('CONFIG_APPLY_AI_CALLER_BLOCKED'));
}
{
  const b: BlockedReason[] = [];
  assertHumanCaller('system', b, 'rollback');
  expect('system caller rollback → CONFIG_ROLLBACK_AI_CALLER_BLOCKED', b.includes('CONFIG_ROLLBACK_AI_CALLER_BLOCKED'));
}

// ─── Weight Validation (independent multiplier) ───────────────────────────────
{
  const r = validateWeights(VALID_WEIGHTS, 'independent_multiplier');
  expect('valid independent weights → passes', r.valid);
  expect('independent multiplier: normalizedSum null', r.normalizedSum === null);
}
{
  const r = validateWeights({ historicalUsageWeight: NaN }, 'independent_multiplier');
  expect('NaN weight → CONFIG_APPLY_WEIGHT_NAN', r.blockedReasons.includes('CONFIG_APPLY_WEIGHT_NAN'));
}
{
  const r = validateWeights({ historicalUsageWeight: Infinity }, 'independent_multiplier');
  expect('Infinity weight → CONFIG_APPLY_WEIGHT_INFINITY', r.blockedReasons.includes('CONFIG_APPLY_WEIGHT_INFINITY'));
}
{
  const r = validateWeights({ historicalUsageWeight: 0.1 }, 'independent_multiplier'); // below min 0.5
  expect('out-of-bounds weight → CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS', r.blockedReasons.includes('CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS'));
}
{
  const r = validateWeights({ historicalUsageWeight: 2.1 }, 'independent_multiplier'); // above max 2.0
  expect('above max weight → CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS', r.blockedReasons.includes('CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS'));
}

// ─── Weight Validation (normalized) ──────────────────────────────────────────
{
  const nw = { historicalUsageWeight: 0.35, wasteRiskWeight: 0.25, receivingDeltaWeight: 0.25, safetyStockWeight: 0.15 };
  const r = validateWeights(nw, 'normalized');
  expect('normalized weights sum=1.0 → passes', r.valid);
  expect('normalized: normalizedSum returned', Math.abs((r.normalizedSum ?? 0) - 1.0) < 0.001);
}
{
  // sum=0.9 → outside epsilon
  const nw = { historicalUsageWeight: 0.3, wasteRiskWeight: 0.2, receivingDeltaWeight: 0.2, safetyStockWeight: 0.2 };
  const r = validateWeights(nw, 'normalized');
  expect('normalized weights sum!=1 → CONFIG_APPLY_NORMALIZED_SUM_OUT_OF_RANGE', r.blockedReasons.includes('CONFIG_APPLY_NORMALIZED_SUM_OUT_OF_RANGE'));
}

// ─── Apply Plan Validation ────────────────────────────────────────────────────
function baseApply() {
  return {
    tenantId: T1, targetTenantId: T1, callerType: 'human' as const,
    humanApprovalId: APPROVAL, auditTrailId: AUDIT,
    sourceRecommendationId: REC, applyToken: TOKEN,
    previousVersion: V1, proposedVersion: V2,
    proposedWeights: { historicalUsageWeight: 1.1 },
    weightMode: 'independent_multiplier' as const,
  };
}
{
  const r = validateApplyPlanInput(baseApply());
  expect('valid apply plan → passes', r.valid);
}
{
  // Tenant mismatch → blocked first, no other errors
  const r = validateApplyPlanInput({ ...baseApply(), targetTenantId: T2 });
  expect('tenant mismatch blocks apply first', r.blockedReasons[0] === 'CONFIG_APPLY_TENANT_MISMATCH');
  expect('tenant mismatch: only one error returned', r.blockedReasons.length === 1);
}
{
  const r = validateApplyPlanInput({ ...baseApply(), callerType: 'ai' });
  expect('AI apply caller → CONFIG_APPLY_AI_CALLER_BLOCKED', r.blockedReasons.includes('CONFIG_APPLY_AI_CALLER_BLOCKED'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), humanApprovalId: null });
  expect('missing humanApprovalId → CONFIG_APPLY_MISSING_HUMAN_APPROVAL_ID', r.blockedReasons.includes('CONFIG_APPLY_MISSING_HUMAN_APPROVAL_ID'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), auditTrailId: null });
  expect('missing auditTrailId → CONFIG_APPLY_MISSING_AUDIT_TRAIL_ID', r.blockedReasons.includes('CONFIG_APPLY_MISSING_AUDIT_TRAIL_ID'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), sourceRecommendationId: null });
  expect('missing sourceRecommendationId → CONFIG_APPLY_MISSING_SOURCE_RECOMMENDATION_ID', r.blockedReasons.includes('CONFIG_APPLY_MISSING_SOURCE_RECOMMENDATION_ID'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), applyToken: null });
  expect('missing applyToken → CONFIG_APPLY_MISSING_APPLY_TOKEN', r.blockedReasons.includes('CONFIG_APPLY_MISSING_APPLY_TOKEN'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), previousVersion: null });
  expect('missing previousVersion → CONFIG_APPLY_MISSING_PREVIOUS_VERSION', r.blockedReasons.includes('CONFIG_APPLY_MISSING_PREVIOUS_VERSION'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), proposedVersion: null });
  expect('missing proposedVersion → CONFIG_APPLY_MISSING_PROPOSED_VERSION', r.blockedReasons.includes('CONFIG_APPLY_MISSING_PROPOSED_VERSION'));
}
{
  const r = validateApplyPlanInput({ ...baseApply(), proposedWeights: {} });
  expect('empty proposedWeights → CONFIG_APPLY_NO_WEIGHT_CHANGES', r.blockedReasons.includes('CONFIG_APPLY_NO_WEIGHT_CHANGES'));
}

// ─── Rollback Plan Validation ─────────────────────────────────────────────────
function baseRollback() {
  return {
    tenantId: T1, targetTenantId: T1, callerType: 'human' as const,
    currentVersion: V2, rollbackTargetVersion: V1,
    rollbackToken: RTOKEN, auditTrailId: AUDIT,
    rollbackReason: 'prediction accuracy dropped',
  };
}
{
  const r = validateRollbackPlanInput(baseRollback());
  expect('valid rollback plan → passes', r.valid);
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), targetTenantId: T2 });
  expect('rollback tenant mismatch blocks first', r.blockedReasons[0] === 'CONFIG_ROLLBACK_TENANT_MISMATCH');
  expect('rollback tenant mismatch: only one error', r.blockedReasons.length === 1);
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), callerType: 'ai' });
  expect('AI rollback caller → CONFIG_ROLLBACK_AI_CALLER_BLOCKED', r.blockedReasons.includes('CONFIG_ROLLBACK_AI_CALLER_BLOCKED'));
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), rollbackTargetVersion: null });
  expect('missing rollbackTargetVersion → CONFIG_ROLLBACK_MISSING_TARGET_VERSION', r.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_TARGET_VERSION'));
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), rollbackToken: null });
  expect('missing rollbackToken → CONFIG_ROLLBACK_MISSING_ROLLBACK_TOKEN', r.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_ROLLBACK_TOKEN'));
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), auditTrailId: null });
  expect('missing auditTrailId → CONFIG_ROLLBACK_MISSING_AUDIT_TRAIL_ID', r.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_AUDIT_TRAIL_ID'));
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), rollbackReason: null });
  expect('missing rollbackReason → CONFIG_ROLLBACK_MISSING_ROLLBACK_REASON', r.blockedReasons.includes('CONFIG_ROLLBACK_MISSING_ROLLBACK_REASON'));
}
{
  const r = validateRollbackPlanInput({ ...baseRollback(), currentVersion: V1, rollbackTargetVersion: V1 });
  expect('same version rollback → CONFIG_ROLLBACK_SAME_VERSION', r.blockedReasons.includes('CONFIG_ROLLBACK_SAME_VERSION'));
}

if (fail === 0) console.log(`\nPASSED — modelConfigValidationService verified (${pass} assertions)`);
else { throw new Error(`FAIL — ${fail} failures`); }
