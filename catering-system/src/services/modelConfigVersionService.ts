import type { TenantId, AuditTrailId } from '../types/aiBoundary';
import type {
  ModelWeights,
  WeightMode,
  ModelConfigVersion,
  ConfigVersion,
} from '../types/modelConfigApply';
import { asConfigVersion } from '../types/modelConfigApply';
import type { ModelConfigRecommendationId } from '../types/modelConfigApply';
import { hashWeights } from './modelConfigDiffService';

export function generateNextVersion(currentVersion: ConfigVersion): ConfigVersion {
  const match = currentVersion.match(/^v(\d+)(.*)$/);
  if (match) {
    const next = parseInt(match[1], 10) + 1;
    return asConfigVersion(`v${next}${match[2] ?? ''}`);
  }
  return asConfigVersion(`${currentVersion}-next`);
}

export function buildModelConfigVersion(params: {
  version: ConfigVersion;
  tenantId: TenantId;
  weights: ModelWeights;
  weightMode: WeightMode;
  createdByHumanUserId: string;
  auditTrailId: AuditTrailId;
  sourceRecommendationId: ModelConfigRecommendationId | null;
  now?: Date;
}): ModelConfigVersion {
  return {
    version: params.version,
    tenantId: params.tenantId,
    weights: params.weights,
    weightMode: params.weightMode,
    createdAt: params.now ?? new Date(),
    createdByHumanUserId: params.createdByHumanUserId,
    auditTrailId: params.auditTrailId,
    sourceRecommendationId: params.sourceRecommendationId,
    configHash: hashWeights(params.weights),
  };
}
