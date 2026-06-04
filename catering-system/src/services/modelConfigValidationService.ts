import type { TenantId, BlockedReason } from '../types/aiBoundary';
import type {
  ModelWeights,
  WeightBounds,
  WeightMode,
  WeightValidationResult,
  ApplyPlanValidationResult,
  RollbackPlanValidationResult,
  ModelConfigApprovalId,
  ModelConfigRecommendationId,
  ApplyToken,
  RollbackToken,
  ConfigVersion,
} from '../types/modelConfigApply';
import { DEFAULT_WEIGHT_BOUNDS, NORMALIZED_WEIGHT_EPSILON } from '../types/modelConfigApply';
import type { AuditTrailId } from '../types/aiBoundary';

// ─── Tenant Hard Guard ────────────────────────────────────────────────────────

export function assertTenantMatch(
  requestTenantId: TenantId,
  targetTenantId: TenantId,
  blockedReasons: BlockedReason[],
): boolean {
  if (requestTenantId !== targetTenantId) {
    blockedReasons.push('CONFIG_APPLY_TENANT_MISMATCH');
    return false;
  }
  return true;
}

export function assertRollbackTenantMatch(
  requestTenantId: TenantId,
  targetTenantId: TenantId,
  blockedReasons: BlockedReason[],
): boolean {
  if (requestTenantId !== targetTenantId) {
    blockedReasons.push('CONFIG_ROLLBACK_TENANT_MISMATCH');
    return false;
  }
  return true;
}

// ─── Caller Type Guard ────────────────────────────────────────────────────────

export function assertHumanCaller(
  callerType: 'human' | 'ai' | 'system',
  blockedReasons: BlockedReason[],
  mode: 'apply' | 'rollback' = 'apply',
): boolean {
  if (callerType !== 'human') {
    blockedReasons.push(
      mode === 'apply'
        ? 'CONFIG_APPLY_AI_CALLER_BLOCKED'
        : 'CONFIG_ROLLBACK_AI_CALLER_BLOCKED',
    );
    return false;
  }
  return true;
}

// ─── Weight Validation ────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && !isNaN(v);
}

export function validateWeights(
  weights: Partial<ModelWeights>,
  weightMode: WeightMode,
  bounds: Record<keyof ModelWeights, WeightBounds> = DEFAULT_WEIGHT_BOUNDS,
): WeightValidationResult {
  const blockedReasons: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  for (const key of Object.keys(weights) as (keyof ModelWeights)[]) {
    const v = weights[key];
    if (v === undefined) continue;

    if (typeof v === 'number' && isNaN(v)) {
      blockedReasons.push('CONFIG_APPLY_WEIGHT_NAN');
      continue;
    }
    if (typeof v === 'number' && !isFinite(v)) {
      blockedReasons.push('CONFIG_APPLY_WEIGHT_INFINITY');
      continue;
    }
    if (!isFiniteNumber(v)) {
      blockedReasons.push('CONFIG_APPLY_INVALID_WEIGHT');
      continue;
    }

    // Multiplier bounds only apply in independent_multiplier mode
    if (weightMode === 'independent_multiplier') {
      const b = bounds[key];
      if (v < b.min || v > b.max) {
        blockedReasons.push('CONFIG_APPLY_WEIGHT_OUT_OF_BOUNDS');
      }
    }
  }

  let normalizedSum: number | null = null;

  if (weightMode === 'normalized' && blockedReasons.length === 0) {
    const vals = Object.values(weights).filter((v): v is number => v !== undefined);
    if (vals.length > 0) {
      normalizedSum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(normalizedSum - 1.0) > NORMALIZED_WEIGHT_EPSILON) {
        blockedReasons.push('CONFIG_APPLY_NORMALIZED_SUM_OUT_OF_RANGE');
      }
    }
  }

  return {
    valid: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    weightMode,
    normalizedSum,
  };
}

// ─── Apply Plan Validation ────────────────────────────────────────────────────

export interface ApplyPlanInputFields {
  tenantId: TenantId;
  targetTenantId: TenantId;
  callerType: 'human' | 'ai' | 'system';
  humanApprovalId: ModelConfigApprovalId | null | undefined;
  auditTrailId: AuditTrailId | null | undefined;
  sourceRecommendationId: ModelConfigRecommendationId | null | undefined;
  applyToken: ApplyToken | null | undefined;
  previousVersion: ConfigVersion | null | undefined;
  proposedVersion: ConfigVersion | null | undefined;
  proposedWeights: Partial<ModelWeights>;
  weightMode: WeightMode;
}

export function validateApplyPlanInput(input: ApplyPlanInputFields): ApplyPlanValidationResult {
  const blockedReasons: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // Tenant guard — must be first
  assertTenantMatch(input.tenantId, input.targetTenantId, blockedReasons);
  if (blockedReasons.length > 0) return { valid: false, blockedReasons, warnings };

  assertHumanCaller(input.callerType, blockedReasons, 'apply');
  if (!input.humanApprovalId) blockedReasons.push('CONFIG_APPLY_MISSING_HUMAN_APPROVAL_ID');
  if (!input.auditTrailId) blockedReasons.push('CONFIG_APPLY_MISSING_AUDIT_TRAIL_ID');
  if (!input.sourceRecommendationId) blockedReasons.push('CONFIG_APPLY_MISSING_SOURCE_RECOMMENDATION_ID');
  if (!input.applyToken) blockedReasons.push('CONFIG_APPLY_MISSING_APPLY_TOKEN');
  if (!input.previousVersion) blockedReasons.push('CONFIG_APPLY_MISSING_PREVIOUS_VERSION');
  if (!input.proposedVersion) blockedReasons.push('CONFIG_APPLY_MISSING_PROPOSED_VERSION');

  if (blockedReasons.length > 0) return { valid: false, blockedReasons, warnings };

  const weightResult = validateWeights(input.proposedWeights, input.weightMode);
  blockedReasons.push(...weightResult.blockedReasons);
  warnings.push(...weightResult.warnings);

  if (Object.keys(input.proposedWeights).length === 0) {
    blockedReasons.push('CONFIG_APPLY_NO_WEIGHT_CHANGES');
  }

  return { valid: blockedReasons.length === 0, blockedReasons, warnings };
}

// ─── Rollback Plan Validation ─────────────────────────────────────────────────

export interface RollbackPlanInputFields {
  tenantId: TenantId;
  targetTenantId: TenantId;
  callerType: 'human' | 'ai' | 'system';
  currentVersion: ConfigVersion | null | undefined;
  rollbackTargetVersion: ConfigVersion | null | undefined;
  rollbackToken: RollbackToken | null | undefined;
  auditTrailId: AuditTrailId | null | undefined;
  rollbackReason: string | null | undefined;
}

export function validateRollbackPlanInput(input: RollbackPlanInputFields): RollbackPlanValidationResult {
  const blockedReasons: BlockedReason[] = [];
  const warnings: BlockedReason[] = [];

  // Tenant guard — must be first
  assertRollbackTenantMatch(input.tenantId, input.targetTenantId, blockedReasons);
  if (blockedReasons.length > 0) return { valid: false, blockedReasons, warnings };

  assertHumanCaller(input.callerType, blockedReasons, 'rollback');
  if (!input.rollbackTargetVersion) blockedReasons.push('CONFIG_ROLLBACK_MISSING_TARGET_VERSION');
  if (!input.rollbackToken) blockedReasons.push('CONFIG_ROLLBACK_MISSING_ROLLBACK_TOKEN');
  if (!input.auditTrailId) blockedReasons.push('CONFIG_ROLLBACK_MISSING_AUDIT_TRAIL_ID');
  if (!input.rollbackReason) blockedReasons.push('CONFIG_ROLLBACK_MISSING_ROLLBACK_REASON');

  if (
    blockedReasons.length === 0 &&
    input.currentVersion &&
    input.rollbackTargetVersion &&
    input.currentVersion === input.rollbackTargetVersion
  ) {
    blockedReasons.push('CONFIG_ROLLBACK_SAME_VERSION');
  }

  return { valid: blockedReasons.length === 0, blockedReasons, warnings };
}
