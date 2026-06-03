/**
 * predictionInputValidationService.test.ts
 * Run: npx tsx src/services/__tests__/predictionInputValidationService.test.ts
 */

import {
  validatePredictionInputSummary,
  calculateDataQualityScore,
} from '../predictionInputValidationService';
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
function checkFalse(label: string, v: boolean): void { check(label, v, false); }
function checkIncludes(label: string, arr: unknown[], item: unknown): void {
  checkTrue(label, arr.some(x => JSON.stringify(x) === JSON.stringify(item)));
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

console.log('\n── predictionInputValidationService ────────────────────────────');

// ── Happy path ─────────────────────────────────────────────────────────────────
{
  const r = validatePredictionInputSummary(makeSummary());
  checkTrue('happy: valid', r.valid);
  check('happy: no blocked', r.blockedReasons, []);
}

// ── containsRawData true → BLOCKED ────────────────────────────────────────────
{
  const bad = { ...makeSummary(), containsRawData: true as unknown as false };
  const r = validatePredictionInputSummary(bad);
  checkFalse('rawData: not valid', r.valid);
  checkIncludes('rawData: PREDICTION_RAW_DATA_DETECTED', r.blockedReasons, 'PREDICTION_RAW_DATA_DETECTED');
}

// ── Tenant mismatch → BLOCKED ─────────────────────────────────────────────────
{
  const bad = makeSummary({ tenantConsistencyCheck: { tenantId: T, allSourcesMatchTenant: false } });
  const r = validatePredictionInputSummary(bad);
  checkFalse('tenant mismatch: not valid', r.valid);
  checkIncludes('tenant mismatch: PREDICTION_TENANT_MISMATCH', r.blockedReasons, 'PREDICTION_TENANT_MISMATCH');
}

// ── tenantConsistencyCheck.tenantId differs → BLOCKED ────────────────────────
{
  const bad = makeSummary({ tenantConsistencyCheck: { tenantId: 'other-tenant' as TenantId, allSourcesMatchTenant: true } });
  const r = validatePredictionInputSummary(bad);
  checkFalse('tenantId mismatch: not valid', r.valid);
  checkIncludes('tenantId mismatch: PREDICTION_TENANT_MISMATCH', r.blockedReasons, 'PREDICTION_TENANT_MISMATCH');
}

// ── blocked_single_source → BLOCKED ──────────────────────────────────────────
{
  const bad = makeSummary({ sourceAggregationLevel: 'blocked_single_source' });
  const r = validatePredictionInputSummary(bad);
  checkFalse('single_source: not valid', r.valid);
  checkIncludes('single_source: PREDICTION_SINGLE_SOURCE_RISK', r.blockedReasons, 'PREDICTION_SINGLE_SOURCE_RISK');
}

// ── missing maxPurchaseLimitGrams → BLOCKED ───────────────────────────────────
{
  const bad = makeSummary({ maxPurchaseLimitGrams: undefined });
  const r = validatePredictionInputSummary(bad);
  checkFalse('maxLimit missing: not valid', r.valid);
  checkIncludes('maxLimit missing: PREDICTION_MAX_LIMIT_MISSING', r.blockedReasons, 'PREDICTION_MAX_LIMIT_MISSING');
}

// ── negative shortageQtyGrams → BLOCKED ──────────────────────────────────────
{
  const bad = { ...makeSummary(), shortageQtyGrams: -100 as unknown as ReturnType<typeof asGrams> };
  const r = validatePredictionInputSummary(bad);
  checkFalse('negative shortage: not valid', r.valid);
  checkIncludes('negative shortage: PREDICTION_NEGATIVE_QUANTITY', r.blockedReasons, 'PREDICTION_NEGATIVE_QUANTITY');
}

// ── dataQualityScore < 0.4 → BLOCKED ─────────────────────────────────────────
{
  // Force a very low score by using minimal sample counts
  const bad = makeSummary({
    sourceAggregationLevel: 'category_period',
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays:   2,
      sampleCount:  0,
      periodStart:  NOW,
      periodEnd:    NOW,
    },
    wasteRiskSummary:     { riskLevel: 'UNKNOWN', sampleCount: 0 },
    receivingDeltaSummary: { sampleCount: 0 },
  });
  const score = calculateDataQualityScore(bad);
  checkTrue('low score: score < 0.4', score < 0.4);
  const r = validatePredictionInputSummary(bad);
  checkFalse('low score: not valid', r.valid);
  checkIncludes('low score: PREDICTION_LOW_DATA_QUALITY', r.blockedReasons, 'PREDICTION_LOW_DATA_QUALITY');
}

// ── dataQualityScore 0.4–0.6 → LOW warning ───────────────────────────────────
{
  // category_period=0.07 + sampleCount=5→0.175 + sampleDays=15→0.075 + waste=2→0.08 + delta=2→0.08 = 0.48
  const mid = makeSummary({
    sourceAggregationLevel: 'category_period',
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays:   15,
      sampleCount:  5,
      periodStart:  NOW,
      periodEnd:    NOW,
    },
    wasteRiskSummary:     { riskLevel: 'LOW', sampleCount: 2 },
    receivingDeltaSummary: { sampleCount: 2 },
  });
  const score = calculateDataQualityScore(mid);
  checkTrue('mid score: score in [0.4, 0.6)', score >= 0.4 && score < 0.6);
  const r = validatePredictionInputSummary(mid);
  checkTrue('mid score: valid (warning only)', r.valid);
  checkIncludes('mid score: LOW warning', r.warnings, 'PREDICTION_LOW_DATA_QUALITY');
}

// ── sampleDays < 7 → warning ──────────────────────────────────────────────────
{
  const r = validatePredictionInputSummary(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 3,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('sampleDays<7: PREDICTION_INSUFFICIENT_HISTORY warning', r.warnings, 'PREDICTION_INSUFFICIENT_HISTORY');
}

// ── wasteRisk sampleCount < 3 → warning ──────────────────────────────────────
{
  const r = validatePredictionInputSummary(makeSummary({
    wasteRiskSummary: { riskLevel: 'LOW', sampleCount: 2 },
  }));
  checkIncludes('wasteRisk<3: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
}

// ── receivingDelta sampleCount < 3 → warning ─────────────────────────────────
{
  const r = validatePredictionInputSummary(makeSummary({
    receivingDeltaSummary: { sampleCount: 1 },
  }));
  checkIncludes('receivingDelta<3: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
}

// ── dataQualityScore formula sanity ──────────────────────────────────────────
{
  // Perfect summary: maxed out all sources + best aggregation level
  const perfect = makeSummary({
    sourceAggregationLevel: 'tenant_ingredient_period',
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays:   30,
      sampleCount:  10,
      periodStart:  NOW,
      periodEnd:    NOW,
    },
    wasteRiskSummary:     { riskLevel: 'LOW', sampleCount: 5 },
    receivingDeltaSummary: { sampleCount: 5 },
  });
  const score = calculateDataQualityScore(perfect);
  // 0.35 + 0.20 + 0.20 + 0.15 + 0.10 = 1.0
  check('perfect score = 1.0', Math.round(score * 100) / 100, 1.0);
}

{
  // Zero everything
  const zero = makeSummary({
    sourceAggregationLevel: 'blocked_single_source',
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays:   0,
      sampleCount:  0,
      periodStart:  NOW,
      periodEnd:    NOW,
    },
    wasteRiskSummary:     { riskLevel: 'UNKNOWN', sampleCount: 0 },
    receivingDeltaSummary: { sampleCount: 0 },
  });
  const score = calculateDataQualityScore(zero);
  check('zero score = 0.0', score, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionInputValidationService verified');
