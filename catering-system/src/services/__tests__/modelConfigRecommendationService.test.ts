/**
 * modelConfigRecommendationService.test.ts
 * Run: npx tsx src/services/__tests__/modelConfigRecommendationService.test.ts
 */

import { createModelConfigRecommendation } from '../modelConfigRecommendationService';
import { asGrams } from '../unitConversionService';
import type { PredictionOutput } from '../../types/predictionEngine';
import type { TenantId, SnapshotId, AuditTrailId } from '../../types/aiBoundary';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else {
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function checkTrue(label: string, v: boolean): void { check(label, v, true); }
function checkIncludes(label: string, arr: unknown[], item: unknown): void {
  checkTrue(label, arr.some(x => JSON.stringify(x) === JSON.stringify(item)));
}

const T   = 'tenant-v001' as TenantId;
const SID = 'snap-v001'   as SnapshotId;
const AID = 'trail-v001'  as AuditTrailId;
const NOW = new Date('2026-06-03T10:00:00Z');

function makeOutput(overrides: Partial<PredictionOutput> = {}): PredictionOutput {
  return {
    predictionId:                'pred_test_001',
    tenantId:                    T,
    ingredientId:                'carrot',
    sourceSnapshotId:            SID,
    auditTrailId:                AID,
    baseRecommendedQtyGrams:     asGrams(1000),
    adjustedRecommendedQtyGrams: asGrams(980),
    maxPurchaseLimitGrams:       asGrams(5000),
    factors: {
      historicalUsageFactor: 1.0,
      wasteRiskFactor:       1.0,
      receivingDeltaFactor:  0.98,
    },
    confidenceTier:  'HIGH',
    rationale:       ['test'],
    blockedReasons:  [],
    warnings:        [],
    dataLineage: {
      sourceSnapshotId:         SID,
      sourceSummaryGeneratedAt: NOW,
      usedRawDocuments:         false,
      sourceAggregationLevel:   'tenant_ingredient_period',
      dataQualityScore:         0.95,
    },
    aiCanWrite:       false,
    aiCanMutateRules: false,
    createdAt:        NOW,
    ...overrides,
  };
}

console.log('\n── modelConfigRecommendationService ─────────────────────────────');

// ── Hard invariants: aiCanApply=false, requiresHumanApproval=true ─────────────
{
  const rec = createModelConfigRecommendation(makeOutput(), NOW);
  check('invariant: aiCanApply=false', rec.aiCanApply, false);
  check('invariant: requiresHumanApproval=true', rec.requiresHumanApproval, true);
}

// ── BLOCKED prediction → MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL ────────────────
{
  const blocked = makeOutput({
    confidenceTier: 'BLOCKED',
    blockedReasons: ['PREDICTION_MAX_LIMIT_MISSING'],
    baseRecommendedQtyGrams: asGrams(0),
    adjustedRecommendedQtyGrams: asGrams(0),
  });
  const rec = createModelConfigRecommendation(blocked, NOW);
  checkIncludes('blocked: MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL', rec.blockedReasons, 'MODEL_CONFIG_REQUIRES_HUMAN_APPROVAL');
  check('blocked: no proposedWeights', rec.proposedWeights, {});
}

// ── HIGH historicalUsageFactor → suggest increasing weight ────────────────────
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.18, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  checkTrue('high historicalUsage: historicalUsageWeight proposed', 'historicalUsageWeight' in rec.proposedWeights);
  check('high historicalUsage: historicalUsageWeight=1.1', rec.proposedWeights.historicalUsageWeight, 1.1);
}

// ── LOW historicalUsageFactor → suggest decreasing weight ────────────────────
{
  const out = makeOutput({ factors: { historicalUsageFactor: 0.82, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  check('low historicalUsage: historicalUsageWeight=0.9', rec.proposedWeights.historicalUsageWeight, 0.9);
}

// ── HIGH wasteRisk (factor ≤ 0.91) → suggest increasing wasteRiskWeight ──────
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 0.90, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  check('high wasteRisk: wasteRiskWeight=1.1', rec.proposedWeights.wasteRiskWeight, 1.1);
}

// ── HIGH receivingDelta (factor ≥ 1.10) → suggest decreasing receivingDeltaWeight ──
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.12 } });
  const rec = createModelConfigRecommendation(out, NOW);
  check('high receivingDelta: receivingDeltaWeight=0.9', rec.proposedWeights.receivingDeltaWeight, 0.9);
}

// ── No adjustments needed → "well-calibrated" rationale ──────────────────────
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  checkTrue('calibrated: no proposedWeights', Object.keys(rec.proposedWeights).length === 0);
  checkTrue('calibrated: rationale has well-calibrated message', rec.rationale.some(r => r.includes('well-calibrated')));
}

// ── Output metadata correct ───────────────────────────────────────────────────
{
  const rec = createModelConfigRecommendation(makeOutput(), NOW);
  check('metadata: tenantId', rec.tenantId, T);
  check('metadata: auditTrailId', rec.auditTrailId, AID);
  check('metadata: aiCanApply=false', rec.aiCanApply, false);
  check('metadata: requiresHumanApproval=true', rec.requiresHumanApproval, true);
  checkTrue('metadata: recommendationId starts with mcr_', rec.recommendationId.startsWith('mcr_'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — modelConfigRecommendationService verified');
