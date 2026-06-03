/**
 * predictionFactorService.test.ts
 * Run: npx tsx src/services/__tests__/predictionFactorService.test.ts
 */

import { calculatePredictionFactors } from '../predictionFactorService';
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
function checkClose(label: string, actual: number, expected: number, tol = 0.001): void {
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

console.log('\n── predictionFactorService ──────────────────────────────────────');

// ── Happy path: avg === expected → historicalUsageFactor = 1.0 ────────────────
{
  const r = calculatePredictionFactors(makeSummary());
  checkClose('happy: historicalUsageFactor = 1.0', r.factors.historicalUsageFactor, 1.0);
  checkClose('happy: wasteRiskFactor (LOW) = 1.0', r.factors.wasteRiskFactor, 1.0);
  // averageDeltaPercent=0.02 → 1 - 0.02 = 0.98, clamped [0.85,1.15]
  checkClose('happy: receivingDeltaFactor = 0.98', r.factors.receivingDeltaFactor, 0.98);
  check('happy: no blocked', r.blockedReasons, []);
  check('happy: no warnings', r.warnings, []);
}

// ── historicalUsageFactor clamped at max 1.2 ─────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(400),  // 2× expected → raw 2.0, clamp to 1.2
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 30,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkClose('historicalUsageFactor clamped at 1.2', r.factors.historicalUsageFactor, 1.2);
}

// ── historicalUsageFactor clamped at min 0.8 ─────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(50),   // 0.25× expected → raw 0.25, clamp to 0.8
      expectedDailyUsageGrams: asGrams(200),
      sampleDays: 30,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkClose('historicalUsageFactor clamped at 0.8', r.factors.historicalUsageFactor, 0.8);
}

// ── expectedDailyUsage = 0 → BLOCKED ─────────────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    historicalUsageSummary: {
      averageDailyUsageGrams: asGrams(200),
      expectedDailyUsageGrams: asGrams(0),
      sampleDays: 30,
      sampleCount: 10,
      periodStart: NOW,
      periodEnd: NOW,
    },
  }));
  checkIncludes('expectedDailyUsage=0: PREDICTION_INVALID_FACTOR blocked', r.blockedReasons, 'PREDICTION_INVALID_FACTOR');
}

// ── wasteRiskFactor: MEDIUM = 0.95 ───────────────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    wasteRiskSummary: { riskLevel: 'MEDIUM', sampleCount: 5 },
  }));
  checkClose('wasteRiskFactor MEDIUM = 0.95', r.factors.wasteRiskFactor, 0.95);
}

// ── wasteRiskFactor: HIGH = 0.9 ───────────────────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    wasteRiskSummary: { riskLevel: 'HIGH', sampleCount: 5 },
  }));
  checkClose('wasteRiskFactor HIGH = 0.9', r.factors.wasteRiskFactor, 0.90);
}

// ── wasteRiskFactor: UNKNOWN = 1.0 + warning ─────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    wasteRiskSummary: { riskLevel: 'UNKNOWN', sampleCount: 5 },
  }));
  checkClose('wasteRiskFactor UNKNOWN = 1.0', r.factors.wasteRiskFactor, 1.0);
  checkIncludes('wasteRiskFactor UNKNOWN: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
}

// ── receivingDeltaFactor clamped at max 1.15 ─────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    receivingDeltaSummary: { averageDeltaPercent: -0.20, sampleCount: 5 },
  }));
  checkClose('receivingDeltaFactor clamped at 1.15', r.factors.receivingDeltaFactor, 1.15);
}

// ── receivingDeltaFactor clamped at min 0.85 ─────────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    receivingDeltaSummary: { averageDeltaPercent: 0.20, sampleCount: 5 },
  }));
  checkClose('receivingDeltaFactor clamped at 0.85', r.factors.receivingDeltaFactor, 0.85);
}

// ── missing averageDeltaPercent → 1.0 + warning ───────────────────────────────
{
  const r = calculatePredictionFactors(makeSummary({
    receivingDeltaSummary: { sampleCount: 5 },
  }));
  checkClose('missing averageDeltaPercent → factor 1.0', r.factors.receivingDeltaFactor, 1.0);
  checkIncludes('missing averageDeltaPercent: PREDICTION_SOURCE_SAMPLE_TOO_SMALL warning', r.warnings, 'PREDICTION_SOURCE_SAMPLE_TOO_SMALL');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionFactorService verified');
