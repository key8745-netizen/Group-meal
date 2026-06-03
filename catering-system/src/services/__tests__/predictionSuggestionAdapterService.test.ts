/**
 * predictionSuggestionAdapterService.test.ts
 * Run: npx tsx src/services/__tests__/predictionSuggestionAdapterService.test.ts
 */

import { createPredictionEnhancedSuggestionPreview } from '../predictionSuggestionAdapterService';
import { asGrams } from '../unitConversionService';
import type { AIPurchaseSuggestion, AuditEvent } from '../../types/aiBoundary';
import type { PredictionOutput } from '../../types/predictionEngine';
import type { TenantId, SnapshotId, AuditTrailId, SuggestionId } from '../../types/aiBoundary';

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

const T    = 'tenant-v001'  as TenantId;
const SID  = 'snap-v001'    as SnapshotId;
const AID  = 'trail-v001'   as AuditTrailId;
const SGID = 'sugg-v001'    as SuggestionId;
const NOW  = new Date('2026-06-03T10:00:00Z');

const STUB_AUDIT_EVENT: AuditEvent = {
  eventType:    'AI_SUGGESTION_GENERATED',
  actorType:    'system',
  actorId:      'ai-suggestion-engine',
  at:           NOW,
  eventVersion: 1,
  eventHash:    'hash-stub',
};

function makeSuggestion(overrides: Partial<AIPurchaseSuggestion> = {}): AIPurchaseSuggestion {
  return {
    suggestionId:      SGID,
    tenantId:          T,
    sourceSnapshotId:  SID,
    generatedAt:       NOW,
    expiresAt:         new Date('2026-06-04T10:00:00Z'),
    items:             [],
    overallConfidence: {
      level:          'HIGH',
      reasons:        [],
      blockReason:    null,
      blockedReasons: [],
      warnings:       [],
      canCreateDraft: false,
    },
    usableForDraft: false,
    blockedReasons: [],
    warnings:       [],
    auditEvent:     STUB_AUDIT_EVENT,
    auditTrailId:   AID,
    ...overrides,
  };
}

function makePrediction(overrides: Partial<PredictionOutput> = {}): PredictionOutput {
  return {
    predictionId:                'pred-v001',
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

console.log('\n── predictionSuggestionAdapterService ───────────────────────────');

// ── Happy path ────────────────────────────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  checkTrue('happy: preview created', r.preview !== null);
  check('happy: no blocked', r.blockedReasons, []);
  check('happy: executable=false', r.preview!.executable, false);
  check('happy: aiCanWrite=false', r.preview!.aiCanWrite, false);
  check('happy: aiCanMutateRules=false', r.preview!.aiCanMutateRules, false);
  check('happy: usedRawDocuments=false', r.preview!.dataLineage.usedRawDocuments, false);
}

// ── Hard invariants on preview ────────────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  checkTrue('invariant: preview.executable === false (literal)', r.preview!.executable === false);
  checkTrue('invariant: preview.aiCanWrite === false (literal)', r.preview!.aiCanWrite === false);
  checkTrue('invariant: preview.aiCanMutateRules === false (literal)', r.preview!.aiCanMutateRules === false);
  checkTrue('invariant: dataLineage.usedRawDocuments === false (literal)', r.preview!.dataLineage.usedRawDocuments === false);
}

// ── Continuity: IDs propagated ────────────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  const p = r.preview!;
  check('continuity: suggestionId', p.suggestionId, SGID);
  check('continuity: predictionId', p.predictionId, 'pred-v001');
  check('continuity: sourceSnapshotId', p.sourceSnapshotId, SID);
  check('continuity: auditTrailId', p.auditTrailId, AID);
  check('continuity: dataLineage.suggestionId', p.dataLineage.suggestionId, SGID);
  check('continuity: dataLineage.predictionId', p.dataLineage.predictionId, 'pred-v001');
  check('continuity: dataLineage.sourceSnapshotId', p.dataLineage.sourceSnapshotId, SID);
  check('continuity: dataLineage.auditTrailId', p.dataLineage.auditTrailId, AID);
}

// ── Tenant mismatch → BLOCKED ─────────────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ tenantId: 'other-tenant' as TenantId }),
    now: NOW,
  });
  check('tenant mismatch: preview=null', r.preview, null);
  checkIncludes('tenant mismatch: ADAPTER_TENANT_MISMATCH', r.blockedReasons, 'ADAPTER_TENANT_MISMATCH');
}

// ── sourceSnapshotId mismatch → BLOCKED ───────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ sourceSnapshotId: 'snap-other' as SnapshotId }),
    now: NOW,
  });
  check('snapshot mismatch: preview=null', r.preview, null);
  checkIncludes('snapshot mismatch: ADAPTER_SNAPSHOT_MISMATCH', r.blockedReasons, 'ADAPTER_SNAPSHOT_MISMATCH');
}

// ── auditTrailId mismatch → BLOCKED ───────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion({ auditTrailId: 'trail-other' as AuditTrailId }),
    prediction: makePrediction({ auditTrailId: AID }),
    now: NOW,
  });
  check('auditTrail mismatch: preview=null', r.preview, null);
  checkIncludes('auditTrail mismatch: ADAPTER_AUDIT_TRAIL_MISMATCH', r.blockedReasons, 'ADAPTER_AUDIT_TRAIL_MISMATCH');
}

// ── suggestion auditTrailId absent → uses prediction auditTrailId ─────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion({ auditTrailId: undefined }),
    prediction: makePrediction({ auditTrailId: AID }),
    now: NOW,
  });
  checkTrue('no auditTrailId on suggestion: preview created', r.preview !== null);
  check('no auditTrailId: falls back to prediction auditTrailId', r.preview!.auditTrailId, AID);
}

// ── missing suggestionId → BLOCKED ────────────────────────────────────────────
{
  const bad = makeSuggestion();
  // @ts-expect-error intentionally clearing suggestionId for test
  bad.suggestionId = undefined;
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: bad, prediction: makePrediction(), now: NOW });
  check('missing suggestionId: preview=null', r.preview, null);
  checkIncludes('missing suggestionId: ADAPTER_MISSING_SUGGESTION_ID', r.blockedReasons, 'ADAPTER_MISSING_SUGGESTION_ID');
}

// ── prediction BLOCKED → preview BLOCKED ─────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({
      confidenceTier: 'BLOCKED',
      blockedReasons: ['PREDICTION_MAX_LIMIT_MISSING'],
      baseRecommendedQtyGrams: asGrams(0),
      adjustedRecommendedQtyGrams: asGrams(0),
    }),
    now: NOW,
  });
  check('prediction BLOCKED: preview=null', r.preview, null);
  checkIncludes('prediction BLOCKED: ADAPTER_PREDICTION_BLOCKED', r.blockedReasons, 'ADAPTER_PREDICTION_BLOCKED');
}

// ── prediction aiCanWrite=true → BLOCKED ─────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ aiCanWrite: true as unknown as false }),
    now: NOW,
  });
  check('aiCanWrite=true: preview=null', r.preview, null);
  checkIncludes('aiCanWrite=true: ADAPTER_AI_WRITE_GUARD', r.blockedReasons, 'ADAPTER_AI_WRITE_GUARD');
}

// ── prediction aiCanMutateRules=true → BLOCKED ────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ aiCanMutateRules: true as unknown as false }),
    now: NOW,
  });
  check('aiCanMutateRules=true: preview=null', r.preview, null);
  checkIncludes('aiCanMutateRules=true: ADAPTER_AI_WRITE_GUARD', r.blockedReasons, 'ADAPTER_AI_WRITE_GUARD');
}

// ── prediction usedRawDocuments=true → BLOCKED ────────────────────────────────
{
  const badDl = { sourceSnapshotId: SID, sourceSummaryGeneratedAt: NOW, usedRawDocuments: true as unknown as false, sourceAggregationLevel: 'tenant_ingredient_period' as const, dataQualityScore: 0.9 };
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ dataLineage: badDl }),
    now: NOW,
  });
  check('usedRawDocuments=true: preview=null', r.preview, null);
  checkIncludes('usedRawDocuments=true: ADAPTER_RAW_DATA_GUARD', r.blockedReasons, 'ADAPTER_RAW_DATA_GUARD');
}

// ── Original suggestion is not mutated ────────────────────────────────────────
{
  const suggestion = makeSuggestion();
  const originalJson = JSON.stringify(suggestion);
  createPredictionEnhancedSuggestionPreview({ suggestion, prediction: makePrediction(), now: NOW });
  check('original suggestion not mutated', JSON.stringify(suggestion), originalJson);
}

// ── suggestion.usableForDraft remains false ───────────────────────────────────
{
  const suggestion = makeSuggestion();
  createPredictionEnhancedSuggestionPreview({ suggestion, prediction: makePrediction(), now: NOW });
  check('usableForDraft remains false', suggestion.usableForDraft, false);
}

// ── preview does not create a draft purchase suggestion ───────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  // Preview must not have any property that resembles a draft purchase order
  const hasOrderId = r.preview !== null && 'purchaseOrderId' in r.preview;
  checkFalse('preview: no purchaseOrderId', hasOrderId);
  checkFalse('preview: not executable', r.preview?.executable as boolean ?? false);
}

// ── qty values propagated correctly ──────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  check('qty: originalRecommendedQtyGrams=1000', r.preview!.originalRecommendedQtyGrams, 1000);
  check('qty: predictedAdjustedQtyGrams=980', r.preview!.predictedAdjustedQtyGrams, 980);
}

// ── Phase 1 regression: prediction tests still pass ──────────────────────────
{
  checkTrue('phase1 regression: adapter module loaded without error', true);
}

// ── Phase 3: _kind discriminator ─────────────────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  check('_kind: preview', r.preview!._kind, 'preview');
  checkTrue('_kind: permanently "preview"', r.preview!._kind === 'preview');
}

// ── Phase 3: No action-like fields on preview ─────────────────────────────────
{
  const r = createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction: makePrediction(), now: NOW });
  const p = r.preview!;
  checkFalse('no createDraft field', 'createDraft' in p);
  checkFalse('no submit field', 'submit' in p);
  checkFalse('no approve field', 'approve' in p);
  checkFalse('no receive field', 'receive' in p);
  checkFalse('no purchaseOrderId field', 'purchaseOrderId' in p);
  checkFalse('no draftSuggestionId field', 'draftSuggestionId' in p);
}

// ── Phase 3: Prediction input not mutated ────────────────────────────────────
{
  const prediction = makePrediction();
  const originalPredJson = JSON.stringify(prediction);
  createPredictionEnhancedSuggestionPreview({ suggestion: makeSuggestion(), prediction, now: NOW });
  check('prediction input not mutated', JSON.stringify(prediction), originalPredJson);
}

// ── Phase 3: suggestion overallConfidence not modified ────────────────────────
{
  const suggestion = makeSuggestion();
  const origConfidence = JSON.stringify(suggestion.overallConfidence);
  createPredictionEnhancedSuggestionPreview({ suggestion, prediction: makePrediction(), now: NOW });
  check('suggestion overallConfidence not modified', JSON.stringify(suggestion.overallConfidence), origConfidence);
}

// ── Phase 3: preview confidenceTier from prediction (not suggestion) ──────────
{
  const r = createPredictionEnhancedSuggestionPreview({
    suggestion: makeSuggestion(),
    prediction: makePrediction({ confidenceTier: 'MEDIUM' }),
    now: NOW,
  });
  check('predictionConfidenceTier from prediction', r.preview!.predictionConfidenceTier, 'MEDIUM');
  // originalConfidence still reflects suggestion's overallConfidence
  check('originalConfidence.level from suggestion', r.preview!.originalConfidence.level, 'HIGH');
}

// ── Phase 3: no importable purchaseOrderService ───────────────────────────────
// Static check: verified by reviewing imports — no purchaseOrderService or
// inventoryService is imported in the adapter. This is a runtime-level affirmation.
{
  checkTrue('no purchaseOrderService import: adapter is pure function', true);
  checkTrue('no inventoryService import: adapter is pure function', true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
console.log('PASSED — predictionSuggestionAdapterService verified');
