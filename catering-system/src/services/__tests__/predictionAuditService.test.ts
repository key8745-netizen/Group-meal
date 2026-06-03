/**
 * predictionAuditService.test.ts
 * Run: npx tsx src/services/__tests__/predictionAuditService.test.ts
 */

import { createPredictionAuditEvent, createModelConfigRecommendationAuditEvent } from '../predictionAuditService';
import { asGrams } from '../unitConversionService';
import type { PredictionOutput, ModelConfigRecommendation } from '../../types/predictionEngine';
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

const T   = 'tenant-v001' as TenantId;
const SID = 'snap-v001'   as SnapshotId;
const AID = 'trail-v001'  as AuditTrailId;
const NOW = new Date('2026-06-03T10:00:00Z');

const baseOutput: PredictionOutput = {
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
  rationale:       ['test rationale'],
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
};

console.log('\n── predictionAuditService ───────────────────────────────────────');

// ── PREDICTION_GENERATED event for HIGH confidence ───────────────────────────
{
  const ev = createPredictionAuditEvent(baseOutput, NOW);
  check('generated: eventType=PREDICTION_GENERATED', ev.eventType, 'PREDICTION_GENERATED');
  check('generated: actorType=system', ev.actorType, 'system');
  check('generated: actorId=prediction-engine', ev.actorId, 'prediction-engine');
  const m1 = ev.metadata!;
  check('generated: usedRawDocuments=false', m1.usedRawDocuments, false);
  check('generated: aiCanMutateRules=false', m1.aiCanMutateRules, false);
  check('generated: predictionId', m1.predictionId, 'pred_test_001');
  check('generated: tenantId', m1.tenantId, T);
  check('generated: confidenceTier=HIGH', m1.confidenceTier, 'HIGH');
}

// ── PREDICTION_BLOCKED event for BLOCKED confidence ───────────────────────────
{
  const blocked: PredictionOutput = {
    ...baseOutput,
    confidenceTier:              'BLOCKED',
    baseRecommendedQtyGrams:     asGrams(0),
    adjustedRecommendedQtyGrams: asGrams(0),
    blockedReasons:              ['PREDICTION_MAX_LIMIT_MISSING'],
  };
  const ev = createPredictionAuditEvent(blocked, NOW);
  check('blocked: eventType=PREDICTION_BLOCKED', ev.eventType, 'PREDICTION_BLOCKED');
  check('blocked: usedRawDocuments=false', ev.metadata!.usedRawDocuments, false);
  check('blocked: aiCanMutateRules=false', ev.metadata!.aiCanMutateRules, false);
}

// ── MODEL_CONFIG_RECOMMENDATION_GENERATED audit event ────────────────────────
{
  const rec: ModelConfigRecommendation = {
    recommendationId:      'mcr_test_001',
    tenantId:              T,
    auditTrailId:          AID,
    proposedWeights:       { historicalUsageWeight: 1.1 },
    rationale:             ['Historical usage high'],
    blockedReasons:        [],
    warnings:              [],
    aiCanApply:            false,
    requiresHumanApproval: true,
    createdAt:             NOW,
  };
  const ev = createModelConfigRecommendationAuditEvent(rec, NOW);
  const m3 = ev.metadata!;
  check('mcr: eventType=MODEL_CONFIG_RECOMMENDATION_GENERATED', ev.eventType, 'MODEL_CONFIG_RECOMMENDATION_GENERATED');
  check('mcr: aiCanApply=false', m3.aiCanApply, false);
  check('mcr: requiresHumanApproval=true', m3.requiresHumanApproval, true);
  check('mcr: recommendationId', m3.recommendationId, 'mcr_test_001');
  check('mcr: tenantId', m3.tenantId, T);
}

// ── Hard invariant: usedRawDocuments always false ─────────────────────────────
{
  const ev = createPredictionAuditEvent(baseOutput, NOW);
  checkTrue('invariant: usedRawDocuments=false (boolean)', ev.metadata!.usedRawDocuments === false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionAuditService verified');
