/**
 * aiSuggestionFeedbackService.test.ts
 *
 * Validation tests for createAISuggestionFeedback() and createSuggestionViewedEvent().
 * Run with: npx tsx src/services/__tests__/aiSuggestionFeedbackService.test.ts
 */

import {
  createAISuggestionFeedback,
  createSuggestionViewedEvent,
} from '../aiSuggestionFeedbackService';
import type {
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
  Grams, AIPurchaseSuggestion, OverrideReason,
} from '../../types/aiBoundary';

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

const TENANT  = 'tenant-p4' as TenantId;
const SUG_ID  = 'sug_p4_001' as SuggestionId;
const SNAP_ID = 'snap_p4_001' as SnapshotId;
const TRAIL_ID = 'trail_p4_001' as AuditTrailId;
const NOW = new Date('2026-06-03T12:00:00Z');

function makeSuggestion(overrides: Partial<AIPurchaseSuggestion> = {}): AIPurchaseSuggestion {
  return {
    suggestionId:     SUG_ID,
    tenantId:         TENANT,
    sourceSnapshotId: SNAP_ID,
    generatedAt:      NOW,
    expiresAt:        new Date(NOW.getTime() + 7200000),
    items: [{
      ingredientId:          'carrot',
      name:                  'Carrot',
      suggestedQtyGrams:     770 as Grams,
      currentStockGrams:     300 as Grams,
      shortageGrams:         700 as Grams,
      averageDailyUsageGrams: 50 as Grams,
      confidence: {
        level: 'HIGH', reasons: [], blockReason: null,
        blockedReasons: [], warnings: [], canCreateDraft: false,
        sourceSnapshotId: SNAP_ID,
      },
    }],
    overallConfidence: {
      level: 'HIGH', reasons: [], blockReason: null,
      blockedReasons: [], warnings: [], canCreateDraft: false,
      sourceSnapshotId: SNAP_ID,
    },
    usableForDraft:  false,
    blockedReasons:  [],
    warnings:        [],
    auditEvent: {
      eventType: 'SUGGESTION_GENERATED', actorType: 'ai',
      actorId: 'test', at: NOW, eventHash: 'hash001', eventVersion: 1,
    },
    ...overrides,
  };
}

console.log('\n── aiSuggestionFeedbackService ────────────────────────────────');

// ── Happy path ────────────────────────────────────────────────────────────────
{
  const { feedback, humanOverride, auditEvent, blockedReasons } = createAISuggestionFeedback({
    suggestion:      makeSuggestion(),
    ingredientId:    'carrot',
    finalQtyGrams:   500 as Grams,
    overrideReason:  'too_high',
    actorId:         'chef-001',
    auditTrailId:    TRAIL_ID,
    now:             NOW,
  });

  check('happy: no blockedReasons', blockedReasons, []);
  check('happy: feedback.tenantId',         feedback.tenantId,         TENANT);
  check('happy: feedback.suggestionId',     feedback.suggestionId,     SUG_ID);
  check('happy: feedback.sourceSnapshotId', feedback.sourceSnapshotId, SNAP_ID);
  check('happy: feedback.auditTrailId',     feedback.auditTrailId,     TRAIL_ID);
  check('happy: feedback.ingredientId',     feedback.ingredientId,     'carrot');
  check('happy: feedback.overrideReason',   feedback.overrideReason,   'too_high');
  check('happy: feedback.actorType',        feedback.actorType,        'human');
  check('happy: feedback.finalQtyGrams',    feedback.finalQtyGrams,    500);
  check('happy: feedback.originalRecommendedQtyGrams', feedback.originalRecommendedQtyGrams, 770);
  check('happy: humanOverride.finalQtyGrams', humanOverride.finalQtyGrams, 500);
  check('happy: humanOverride.originalQtyGrams', humanOverride.originalQtyGrams, 770);
  check('happy: auditEvent.eventType', auditEvent.eventType, 'SUGGESTION_OVERRIDDEN');
  check('happy: auditEvent.actorType', auditEvent.actorType, 'human');
  checkTrue('happy: auditEvent.eventHash present', auditEvent.eventHash.length > 0);
  checkTrue('happy: feedbackId present', feedback.feedbackId.length > 0);
  checkTrue('happy: overrideId present', humanOverride.overrideId.length > 0);
}

// ── Audit event metadata ──────────────────────────────────────────────────────
{
  const { auditEvent } = createAISuggestionFeedback({
    suggestion:     makeSuggestion(),
    ingredientId:   'carrot',
    finalQtyGrams:  400 as Grams,
    overrideReason: 'chef_override',
    actorId:        'chef-001',
    auditTrailId:   TRAIL_ID,
    now:            NOW,
  });
  const meta = auditEvent.metadata as Record<string, unknown>;
  check('audit meta: overrideReason',    meta.overrideReason,  'chef_override');
  check('audit meta: finalQtyGrams',     meta.finalQtyGrams,   400);
  check('audit meta: originalQtyGrams',  meta.originalQtyGrams, 770);
  check('audit meta: suggestionId',      meta.suggestionId,    SUG_ID);
  check('audit meta: sourceSnapshotId',  meta.sourceSnapshotId, SNAP_ID);
  check('audit meta: auditTrailId',      meta.auditTrailId,    TRAIL_ID);
}

// ── Optional note ─────────────────────────────────────────────────────────────
{
  const { feedback } = createAISuggestionFeedback({
    suggestion:     makeSuggestion(),
    ingredientId:   'carrot',
    finalQtyGrams:  300 as Grams,
    overrideReason: 'seasonal_adjustment',
    note:           '夏季用量減少',
    actorId:        'chef-001',
    auditTrailId:   TRAIL_ID,
    now:            NOW,
  });
  check('note: stored correctly', feedback.note, '夏季用量減少');
}

// ── Missing actorId → blockedReasons ─────────────────────────────────────────
{
  const { blockedReasons } = createAISuggestionFeedback({
    suggestion:     makeSuggestion(),
    ingredientId:   'carrot',
    finalQtyGrams:  500 as Grams,
    overrideReason: 'too_low',
    actorId:        '',
    auditTrailId:   TRAIL_ID,
    now:            NOW,
  });
  checkTrue('missing actorId → MISSING_CALLER_ID', blockedReasons.includes('MISSING_CALLER_ID'));
}

// ── Missing auditTrailId → blockedReasons ────────────────────────────────────
{
  const { blockedReasons } = createAISuggestionFeedback({
    suggestion:     makeSuggestion(),
    ingredientId:   'carrot',
    finalQtyGrams:  500 as Grams,
    overrideReason: 'too_low',
    actorId:        'chef-001',
    auditTrailId:   '' as AuditTrailId,
    now:            NOW,
  });
  checkTrue('missing auditTrailId → MISSING_AUDIT_TRAIL_ID', blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'));
}

// ── Missing ingredientId → blockedReasons ────────────────────────────────────
{
  const { blockedReasons } = createAISuggestionFeedback({
    suggestion:     makeSuggestion(),
    ingredientId:   '',
    finalQtyGrams:  500 as Grams,
    overrideReason: 'other',
    actorId:        'chef-001',
    auditTrailId:   TRAIL_ID,
    now:            NOW,
  });
  checkTrue('missing ingredientId → MISSING_INGREDIENT_ID', blockedReasons.includes('MISSING_INGREDIENT_ID'));
}

// ── All override reasons are accepted ────────────────────────────────────────
{
  const reasons: OverrideReason[] = [
    'too_high', 'too_low', 'supplier_limit', 'chef_override',
    'unit_conversion_issue', 'ingredient_unavailable', 'seasonal_adjustment', 'other',
  ];
  for (const r of reasons) {
    const { blockedReasons } = createAISuggestionFeedback({
      suggestion: makeSuggestion(), ingredientId: 'carrot',
      finalQtyGrams: 500 as Grams, overrideReason: r,
      actorId: 'chef-001', auditTrailId: TRAIL_ID, now: NOW,
    });
    check(`reason ${r}: no blocked`, blockedReasons, []);
  }
}

// ── Does NOT write Firestore / does NOT create draft ─────────────────────────
{
  // Structural proof: function returns a plain object — no async, no imports from
  // purchaseOrderService or inventoryService in this module.
  const result = createAISuggestionFeedback({
    suggestion: makeSuggestion(), ingredientId: 'carrot',
    finalQtyGrams: 500 as Grams, overrideReason: 'other',
    actorId: 'chef-001', auditTrailId: TRAIL_ID, now: NOW,
  });
  // If this returned a Promise the test would catch it; it's sync.
  check('sync: result is not a Promise', result instanceof Promise, false);
  // No draft purchase suggestion field on the result
  check('no draft field on result', 'draftPurchaseSuggestion' in result, false);
}

// ── SUGGESTION_VIEWED event ───────────────────────────────────────────────────
{
  const evt = createSuggestionViewedEvent({
    suggestion: makeSuggestion(),
    actorId: 'human-001',
    now: NOW,
  });
  check('viewed: eventType', evt.eventType, 'SUGGESTION_VIEWED');
  check('viewed: actorType', evt.actorType, 'human');
  checkTrue('viewed: eventHash present', evt.eventHash.length > 0);
  const meta = evt.metadata as Record<string, unknown>;
  check('viewed meta: suggestionId', meta.suggestionId, SUG_ID);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiSuggestionFeedbackService verified');
