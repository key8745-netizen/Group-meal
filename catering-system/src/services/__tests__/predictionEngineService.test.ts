/**
 * predictionEngineService.test.ts
 * Run: npx tsx src/services/__tests__/predictionEngineService.test.ts
 */

import { calculatePredictionOutput, evaluatePredictionConfidenceTier } from '../predictionEngineService';
import { asGrams } from '../unitConversionService';
import type { PredictionInputSummary } from '../../types/predictionEngine';
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
function checkClose(label: string, actual: number, expected: number, tol = 1): void {
  checkTrue(label, Math.abs(actual - expected) <= tol);
}

const T   = 'tenant-v001' as TenantId;
const SID = 'snap-v001'   as SnapshotId;
const AID = 'trail-v001'  as AuditTrailId;
const NOW = new Date('2026-06-03T10:00:00Z');

function makeSummary(overrides: Partial<PredictionInputSummary> = {}): PredictionInputSummary {
  return {
    tenantId:              T,
    sourceSnapshotId:      SID,
    auditTrailId:          AID,
    generatedAt:           NOW,
    ingredientId:          'carrot',
    containsRawData:       false,
    dataQualityScore:      0.75,
    sourceAggregationLevel: 'tenant_ingredient_period',
    tenantConsistencyCheck: { tenantId: T, allSourcesMatchTenant: true },
    currentStockGrams:     asGrams(500),
    requiredQtyGrams:      asGrams(1500),
    shortageQtyGrams:      asGrams(1000),
    maxPurchaseLimitGrams: asGrams(5000),
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays:   30,
      sampleCount:  10,
      periodStart:  new Date('2026-05-01T00:00:00Z'),
      periodEnd:    new Date('2026-05-31T23:59:59Z'),
    },
    wasteRiskSummary:     { riskLevel: 'LOW', sampleCount: 5 },
    receivingDeltaSummary: { averageDeltaPercent: 0.02, sampleCount: 5 },
    blockedReasons: [],
    warnings:       [],
    ...overrides,
  };
}

console.log('\n── predictionEngineService ──────────────────────────────────────');

// ── Hard invariants: aiCanWrite, aiCanMutateRules, usedRawDocuments ───────────
{
  const out = calculatePredictionOutput({ summary: makeSummary(), now: NOW });
  check('invariant: aiCanWrite=false', out.aiCanWrite, false);
  check('invariant: aiCanMutateRules=false', out.aiCanMutateRules, false);
  check('invariant: usedRawDocuments=false', out.dataLineage.usedRawDocuments, false);
}

// ── Happy path: produces HIGH confidence ─────────────────────────────────────
{
  const out = calculatePredictionOutput({ summary: makeSummary(), now: NOW });
  check('happy: confidenceTier=HIGH', out.confidenceTier, 'HIGH');
  check('happy: blockedReasons=[]', out.blockedReasons, []);
  // base=1000, factors=1.0×1.0×0.98 → raw=980, ceil=980, clamp[0,5000]=980
  checkClose('happy: adjustedRecommendedQtyGrams ≈ 980', out.adjustedRecommendedQtyGrams, 980);
  checkClose('happy: baseRecommendedQtyGrams = 1000', out.baseRecommendedQtyGrams, 1000);
}

// ── BLOCKED: containsRawData → BLOCKED output ─────────────────────────────────
{
  const bad = { ...makeSummary(), containsRawData: true as unknown as false };
  const out = calculatePredictionOutput({ summary: bad, now: NOW });
  check('rawData blocked: confidenceTier=BLOCKED', out.confidenceTier, 'BLOCKED');
  check('rawData blocked: qty=0', out.adjustedRecommendedQtyGrams, 0);
  check('rawData blocked: aiCanWrite=false', out.aiCanWrite, false);
}

// ── BLOCKED: missing maxPurchaseLimitGrams ────────────────────────────────────
{
  const bad = makeSummary({ maxPurchaseLimitGrams: undefined });
  const out = calculatePredictionOutput({ summary: bad, now: NOW });
  check('maxLimit blocked: confidenceTier=BLOCKED', out.confidenceTier, 'BLOCKED');
  checkIncludes('maxLimit blocked: reason PREDICTION_MAX_LIMIT_MISSING', out.blockedReasons, 'PREDICTION_MAX_LIMIT_MISSING');
}

// ── BLOCKED: negative shortageQtyGrams ───────────────────────────────────────
{
  const bad = { ...makeSummary(), shortageQtyGrams: -500 as unknown as ReturnType<typeof asGrams> };
  const out = calculatePredictionOutput({ summary: bad, now: NOW });
  check('negative shortage: confidenceTier=BLOCKED', out.confidenceTier, 'BLOCKED');
  checkIncludes('negative shortage: PREDICTION_NEGATIVE_QUANTITY', out.blockedReasons, 'PREDICTION_NEGATIVE_QUANTITY');
}

// ── maxPurchaseLimitGrams clamp applied ───────────────────────────────────────
{
  // shortage=5000, all factors=1.0, limit=2000 → clamped to 2000
  const out = calculatePredictionOutput({ summary: makeSummary({
    shortageQtyGrams: asGrams(5000),
    maxPurchaseLimitGrams: asGrams(2000),
    receivingDeltaSummary: { averageDeltaPercent: 0, sampleCount: 5 },
  }), now: NOW });
  checkClose('clamp: adjustedRecommendedQtyGrams = 2000', out.adjustedRecommendedQtyGrams, 2000);
}

// ── Confidence tier: MEDIUM ───────────────────────────────────────────────────
{
  // dqs≥0.6, sampleCount=5≥3, sampleDays=10≥7, but not HIGH criteria
  const r = evaluatePredictionConfidenceTier({
    validationResult:  { blockedReasons: [], warnings: [] },
    suppressionResult: { blockedReasons: [] },
    factorResult:      { blockedReasons: [] },
    summary: makeSummary({
      historicalUsageSummary: {
        averageDailyUsageGrams: asGrams(200),
        expectedDailyUsageGrams: asGrams(200),
        sampleDays: 10,
        sampleCount: 5,
        periodStart: NOW,
        periodEnd: NOW,
      },
    }),
    dataQualityScore: 0.65,
  });
  check('tier MEDIUM', r, 'MEDIUM');
}

// ── Confidence tier: LOW (score 0.4–0.6) ─────────────────────────────────────
{
  const r = evaluatePredictionConfidenceTier({
    validationResult:  { blockedReasons: [], warnings: ['PREDICTION_LOW_DATA_QUALITY'] },
    suppressionResult: { blockedReasons: [] },
    factorResult:      { blockedReasons: [] },
    summary: makeSummary(),
    dataQualityScore: 0.5,
  });
  check('tier LOW', r, 'LOW');
}

// ── Confidence tier: BLOCKED when any blocked ────────────────────────────────
{
  const r = evaluatePredictionConfidenceTier({
    validationResult:  { blockedReasons: ['PREDICTION_TENANT_MISMATCH'], warnings: [] },
    suppressionResult: { blockedReasons: [] },
    factorResult:      { blockedReasons: [] },
    summary: makeSummary(),
    dataQualityScore: 0.9,
  });
  check('tier BLOCKED from validationResult', r, 'BLOCKED');
}

// ── dataLineage fields populated ─────────────────────────────────────────────
{
  const out = calculatePredictionOutput({ summary: makeSummary(), now: NOW });
  check('dataLineage.usedRawDocuments=false', out.dataLineage.usedRawDocuments, false);
  check('dataLineage.sourceSnapshotId=SID', out.dataLineage.sourceSnapshotId, SID);
  check('dataLineage.sourceAggregationLevel', out.dataLineage.sourceAggregationLevel, 'tenant_ingredient_period');
  checkTrue('dataLineage.dataQualityScore', out.dataLineage.dataQualityScore >= 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionEngineService verified');
