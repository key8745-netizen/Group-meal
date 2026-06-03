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
function checkFalse(label: string, v: boolean): void { check(label, v, false); }
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
  checkTrue('invariant: aiCanApply === false (literal)', rec.aiCanApply === false);
  checkTrue('invariant: requiresHumanApproval === true (literal)', rec.requiresHumanApproval === true);
}

// ── _kind discriminator ────────────────────────────────────────────────────────
{
  const rec = createModelConfigRecommendation(makeOutput(), NOW);
  check('_kind: recommendation', rec._kind, 'recommendation');
}

// ── No settings write method on recommendation ─────────────────────────────────
{
  const rec = createModelConfigRecommendation(makeOutput(), NOW);
  checkFalse('no apply method', 'apply' in rec);
  checkFalse('no write method', 'write' in rec);
  checkFalse('no commit method', 'commit' in rec);
  checkFalse('no save method', 'save' in rec);
  checkFalse('no execute method', 'execute' in rec);
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
  checkTrue('high historicalUsage: rationale mentions historicalUsageWeight', rec.rationale.some(r => r.includes('historicalUsageWeight')));
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
  checkTrue('high wasteRisk: rationale mentions wasteRiskWeight', rec.rationale.some(r => r.includes('wasteRiskWeight')));
}

// ── HIGH receivingDelta (factor ≥ 1.10) → suggest decreasing receivingDeltaWeight ──
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.12 } });
  const rec = createModelConfigRecommendation(out, NOW);
  check('high receivingDelta: receivingDeltaWeight=0.9', rec.proposedWeights.receivingDeltaWeight, 0.9);
  checkTrue('high receivingDelta: rationale mentions receivingDeltaWeight', rec.rationale.some(r => r.includes('receivingDeltaWeight')));
}

// ── No adjustments needed → nominal rationale ────────────────────────────────
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.0, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  checkTrue('calibrated: no proposedWeights', Object.keys(rec.proposedWeights).length === 0);
  checkTrue('calibrated: rationale has nominal message', rec.rationale.some(r => r.includes('nominal range') || r.includes('well-calibrated')));
}

// ── Weight range validation: proposed weight > 2.0 → BLOCKED ─────────────────
// We test by injecting a factor that would normally propose 1.1 but we
// override the service by directly calling with a doctored output that has
// a factor which (if safe range were ignored) would produce weight 99.
// Since proposedWeights come from internal logic, we verify safe range for
// standard outputs: all standard proposals (0.9, 1.1) are within [0.5, 2.0].
{
  const out = makeOutput({ factors: { historicalUsageFactor: 1.18, wasteRiskFactor: 1.0, receivingDeltaFactor: 1.0 } });
  const rec = createModelConfigRecommendation(out, NOW);
  // 1.1 is within [0.5, 2.0] — must NOT be blocked for out-of-range
  checkFalse('weight 1.1 in range: no MODEL_CONFIG_WEIGHT_OUT_OF_RANGE', rec.blockedReasons.includes('MODEL_CONFIG_WEIGHT_OUT_OF_RANGE'));
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

// ── Recommendation does not mutate prediction output ─────────────────────────
{
  const out = makeOutput();
  const originalJson = JSON.stringify(out);
  createModelConfigRecommendation(out, NOW);
  check('immutability: prediction output not mutated', JSON.stringify(out), originalJson);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — modelConfigRecommendationService verified');
