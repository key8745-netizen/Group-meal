/**
 * predictionSuppressionService.test.ts
 * Run: npx tsx src/services/__tests__/predictionSuppressionService.test.ts
 */

import { applySmallGroupSuppression } from '../predictionSuppressionService';
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
function checkNotIncludes(label: string, arr: unknown[], item: unknown): void {
  checkFalse(label, arr.some(x => JSON.stringify(x) === JSON.stringify(item)));
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

console.log('\n── predictionSuppressionService ────────────────────────────────');

// ── Happy path — no blocks ────────────────────────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary());
  check('happy: no blocked', r.blockedReasons, []);
  check('happy: no warnings', r.warnings, []);
}

// ── historicalUsage sampleCount < 3 → BLOCKED ─────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 30,
      sampleCount: 2,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('historicalUsage sampleCount<3: PREDICTION_SAMPLE_TOO_SMALL blocked', r.blockedReasons, 'PREDICTION_SAMPLE_TOO_SMALL');
}

// ── historicalUsage sampleCount = 0 → BLOCKED ────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 10,
      sampleCount: 0,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('historicalUsage sampleCount=0: PREDICTION_SAMPLE_TOO_SMALL blocked', r.blockedReasons, 'PREDICTION_SAMPLE_TOO_SMALL');
}

// ── historicalUsage sampleCount = 3 → NOT blocked ────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 30,
      sampleCount: 3,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkNotIncludes('historicalUsage sampleCount=3: not blocked', r.blockedReasons, 'PREDICTION_SAMPLE_TOO_SMALL');
}

// ── sampleDays < 7 → warning ──────────────────────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 5,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('sampleDays<7: PREDICTION_INSUFFICIENT_HISTORY warning', r.warnings, 'PREDICTION_INSUFFICIENT_HISTORY');
  check('sampleDays<7: not blocked', r.blockedReasons, []);
}

// ── sampleDays = 7 → no warning ───────────────────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 7,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkNotIncludes('sampleDays=7: no PREDICTION_INSUFFICIENT_HISTORY', r.warnings, 'PREDICTION_INSUFFICIENT_HISTORY');
}

// ── wasteRisk sampleCount < 3 → warning (not blocked) ────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    wasteRiskSummary: { riskLevel: 'LOW', sampleCount: 2 },
  }));
  checkIncludes('wasteRisk<3: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  check('wasteRisk<3: not blocked', r.blockedReasons, []);
}

// ── receivingDelta sampleCount < 3 → warning (not blocked) ───────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    receivingDeltaSummary: { sampleCount: 1 },
  }));
  checkIncludes('receivingDelta<3: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
  check('receivingDelta<3: not blocked', r.blockedReasons, []);
}

// ── blocked_single_source → BLOCKED ──────────────────────────────────────────
{
  const r = applySmallGroupSuppression(makeSummary({
    sourceAggregationLevel: 'blocked_single_source',
  }));
  checkIncludes('blocked_single_source: PREDICTION_SINGLE_SOURCE_RISK blocked', r.blockedReasons, 'PREDICTION_SINGLE_SOURCE_RISK');
}

// ── sampleCount=1 and sampleDays<=1 → PREDICTION_AGGREGATE_DISCLOSURE_RISK ───
{
  const r = applySmallGroupSuppression(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 1,
      sampleCount: 1,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('sampleCount=1+sampleDays<=1: PREDICTION_AGGREGATE_DISCLOSURE_RISK blocked', r.blockedReasons, 'PREDICTION_AGGREGATE_DISCLOSURE_RISK');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionSuppressionService verified');
