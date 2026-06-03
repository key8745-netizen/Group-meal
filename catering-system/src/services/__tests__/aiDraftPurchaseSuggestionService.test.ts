/**
 * aiDraftPurchaseSuggestionService.test.ts
 *
 * Validation tests for prepareDraftPurchaseSuggestion().
 * Run with: npx tsx src/services/__tests__/aiDraftPurchaseSuggestionService.test.ts
 */

import { prepareDraftPurchaseSuggestion } from '../aiDraftPurchaseSuggestionService';
import type {
  TenantId, SuggestionId, SnapshotId, AuditTrailId,
  Grams, AIPurchaseSuggestion, AISuggestionFeedback, HumanOverride,
  OverrideReason, ConfidenceLevel,
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

const TENANT    = 'tenant-p5' as TenantId;
const SUG_ID    = 'sug_p5_001' as SuggestionId;
const SNAP_ID   = 'snap_p5_001' as SnapshotId;
const TRAIL_ID  = 'trail_p5_001' as AuditTrailId;
const NOW       = new Date('2026-06-03T12:00:00Z');

function makeSuggestion(levelOverride?: ConfidenceLevel): AIPurchaseSuggestion {
  const level: ConfidenceLevel = levelOverride ?? 'HIGH';
  return {
    suggestionId:      SUG_ID,
    tenantId:          TENANT,
    sourceSnapshotId:  SNAP_ID,
    generatedAt:       NOW,
    expiresAt:         new Date(NOW.getTime() + 7200000),
    auditTrailId:      TRAIL_ID,
    items: [{
      ingredientId:          'carrot',
      name:                  'Carrot',
      suggestedQtyGrams:     770 as Grams,
      currentStockGrams:     300 as Grams,
      shortageGrams:         700 as Grams,
      averageDailyUsageGrams: 50 as Grams,
      confidence: {
        level, reasons: [], blockReason: null,
        blockedReasons: level === 'BLOCKED' ? ['UNVERIFIED_OCR_SOURCE'] : [],
        warnings: [], canCreateDraft: false, sourceSnapshotId: SNAP_ID,
      },
    }],
    overallConfidence: {
      level, reasons: [], blockReason: level === 'BLOCKED' ? 'UNVERIFIED_OCR_SOURCE' : null,
      blockedReasons: level === 'BLOCKED' ? ['UNVERIFIED_OCR_SOURCE'] : [],
      warnings: [], canCreateDraft: false, sourceSnapshotId: SNAP_ID,
    },
    usableForDraft:  false,
    blockedReasons:  level === 'BLOCKED' ? ['UNVERIFIED_OCR_SOURCE'] : [],
    warnings:        [],
    auditEvent: {
      eventType: 'SUGGESTION_GENERATED', actorType: 'ai',
      actorId: 'test', at: NOW, eventHash: 'hash001', eventVersion: 1,
    },
  };
}

function makeFeedback(suggestionId = SUG_ID, auditTrailId = TRAIL_ID): AISuggestionFeedback {
  return {
    feedbackId:                  'fb_p5_001',
    tenantId:                    TENANT,
    suggestionId,
    sourceSnapshotId:            SNAP_ID,
    auditTrailId,
    ingredientId:                'carrot',
    originalRecommendedQtyGrams: 770 as Grams,
    finalQtyGrams:               600 as Grams,
    overrideReason:              'too_high' as OverrideReason,
    actorType:                   'human',
    actorId:                     'chef-001',
    createdAt:                   NOW,
  };
}

function makeOverride(suggestionId = SUG_ID, auditTrailId = TRAIL_ID): HumanOverride {
  return {
    overrideId:       'ov_p5_001',
    tenantId:         TENANT,
    suggestionId,
    auditTrailId,
    ingredientId:     'carrot',
    originalQtyGrams: 770 as Grams,
    finalQtyGrams:    600 as Grams,
    reason:           'too_high' as OverrideReason,
    createdBy:        'chef-001',
    createdAt:        NOW,
  };
}

const BASE_INPUT = {
  actorId:   'chef-001',
  actorType: 'human' as const,
  requestId: 'req-p5-001',
  now:       NOW,
};

console.log('\n── aiDraftPurchaseSuggestionService ───────────────────────────');

// ── HIGH suggestion + human → DRAFT_PREPARED ─────────────────────────────────
{
  const { draftSuggestion, auditEvent, blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion('HIGH'),
  });

  check('HIGH: no blocked', blockedReasons, []);
  check('HIGH: status = DRAFT_PREPARED', draftSuggestion?.status, 'DRAFT_PREPARED');
  check('HIGH: requiresHumanApproval = true', draftSuggestion?.requiresHumanApproval, true);
  check('HIGH: createdBy = human', draftSuggestion?.createdBy, 'human');
  check('HIGH: auditEvent DRAFT_SUGGESTION_CREATED', auditEvent.eventType, 'DRAFT_SUGGESTION_CREATED');
  checkTrue('HIGH: draftSuggestionId present', (draftSuggestion?.draftSuggestionId ?? '').length > 0);
  check('HIGH: suggestionId matches', draftSuggestion?.suggestionId, SUG_ID);
  check('HIGH: sourceSnapshotId matches', draftSuggestion?.sourceSnapshotId, SNAP_ID);
  check('HIGH: auditTrailId matches', draftSuggestion?.auditTrailId, TRAIL_ID);
}

// ── MEDIUM suggestion + human → DRAFT_PREPARED ───────────────────────────────
{
  const { draftSuggestion, blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion('MEDIUM'),
  });
  check('MEDIUM: no blocked', blockedReasons, []);
  check('MEDIUM: status = DRAFT_PREPARED', draftSuggestion?.status, 'DRAFT_PREPARED');
}

// ── LOW suggestion → BLOCKED ──────────────────────────────────────────────────
{
  const { draftSuggestion, blockedReasons, auditEvent } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion('LOW'),
  });
  checkTrue('LOW: DRAFT_FROM_LOW_CONFIDENCE_BLOCKED', blockedReasons.includes('DRAFT_FROM_LOW_CONFIDENCE_BLOCKED'));
  check('LOW: draftSuggestion undefined', draftSuggestion, undefined);
  check('LOW: auditEvent DRAFT_SUGGESTION_BLOCKED', auditEvent.eventType, 'DRAFT_SUGGESTION_BLOCKED');
}

// ── BLOCKED suggestion → BLOCKED ──────────────────────────────────────────────
{
  const { draftSuggestion, blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion('BLOCKED'),
  });
  checkTrue('BLOCKED: DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED',
    blockedReasons.includes('DRAFT_FROM_BLOCKED_SUGGESTION_BLOCKED'));
  check('BLOCKED: draftSuggestion undefined', draftSuggestion, undefined);
}

// ── Missing sourceSnapshotId → BLOCKED ────────────────────────────────────────
{
  const s = { ...makeSuggestion(), sourceSnapshotId: '' as SnapshotId };
  const { blockedReasons } = prepareDraftPurchaseSuggestion({ ...BASE_INPUT, suggestion: s });
  checkTrue('missing sourceSnapshotId → MISSING_SNAPSHOT_ID', blockedReasons.includes('MISSING_SNAPSHOT_ID'));
}

// ── Missing auditTrailId → BLOCKED ────────────────────────────────────────────
{
  const s = { ...makeSuggestion(), auditTrailId: undefined };
  const { blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: s,
    auditTrailId: undefined,
  });
  checkTrue('missing auditTrailId → MISSING_AUDIT_TRAIL_ID', blockedReasons.includes('MISSING_AUDIT_TRAIL_ID'));
}

// ── AI caller → BLOCKED ───────────────────────────────────────────────────────
{
  const { blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    actorType: 'ai',
    suggestion: makeSuggestion(),
  });
  checkTrue('AI caller → AI_DRAFT_CREATION_FORBIDDEN', blockedReasons.includes('AI_DRAFT_CREATION_FORBIDDEN'));
  checkTrue('AI caller → DRAFT_REQUIRES_HUMAN_ACTOR', blockedReasons.includes('DRAFT_REQUIRES_HUMAN_ACTOR'));
}

// ── Feedback suggestion mismatch → BLOCKED ────────────────────────────────────
{
  const mismatchFeedback = makeFeedback('wrong_sug_id' as SuggestionId);
  const { blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion(),
    feedback: mismatchFeedback,
  });
  checkTrue('feedback mismatch → FEEDBACK_SUGGESTION_MISMATCH',
    blockedReasons.includes('FEEDBACK_SUGGESTION_MISMATCH'));
}

// ── Override suggestion mismatch → BLOCKED ────────────────────────────────────
{
  const mismatchOverride = makeOverride('wrong_sug_id' as SuggestionId);
  const { blockedReasons } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion(),
    humanOverride: mismatchOverride,
  });
  checkTrue('override mismatch → OVERRIDE_SUGGESTION_MISMATCH',
    blockedReasons.includes('OVERRIDE_SUGGESTION_MISMATCH'));
}

// ── With valid feedback → feedbackId stored ───────────────────────────────────
{
  const { draftSuggestion } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion:    makeSuggestion(),
    feedback:      makeFeedback(),
    humanOverride: makeOverride(),
  });
  check('feedback: feedbackId stored', draftSuggestion?.feedbackId, 'fb_p5_001');
  check('override: overrideId stored', draftSuggestion?.overrideId, 'ov_p5_001');
  check('override: finalQtyGrams = 600', draftSuggestion?.finalQtyGrams, 600);
}

// ── Audit event metadata ──────────────────────────────────────────────────────
{
  const { auditEvent } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion(),
    feedback:   makeFeedback(),
  });
  const meta = auditEvent.metadata as Record<string, unknown>;
  check('audit meta: requiresHumanApproval', meta.requiresHumanApproval, true);
  check('audit meta: suggestionId', meta.suggestionId, SUG_ID);
  check('audit meta: sourceSnapshotId', meta.sourceSnapshotId, SNAP_ID);
  check('audit meta: auditTrailId', meta.auditTrailId, TRAIL_ID);
  checkTrue('audit meta: draftSuggestionId present', typeof meta.draftSuggestionId === 'string');
}

// ── approvedBy / approvedAt must NOT exist on draft ──────────────────────────
{
  const { draftSuggestion } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion(),
  });
  check('no approvedBy on draft', 'approvedBy' in (draftSuggestion ?? {}), false);
  check('no approvedAt on draft', 'approvedAt' in (draftSuggestion ?? {}), false);
}

// ── Does NOT write Firestore / does NOT call purchaseOrderService ────────────
{
  const result = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion: makeSuggestion(),
  });
  check('sync: result is not a Promise', result instanceof Promise, false);
  check('no purchaseOrder field on result', 'purchaseOrder' in result, false);
  check('no draftPurchaseOrder field on result', 'draftPurchaseOrder' in result, false);
}

// ── dataLineage fields ────────────────────────────────────────────────────────
{
  const { draftSuggestion } = prepareDraftPurchaseSuggestion({
    ...BASE_INPUT,
    suggestion:    makeSuggestion(),
    feedback:      makeFeedback(),
    humanOverride: makeOverride(),
  });
  check('dataLineage: snapshotId', draftSuggestion?.dataLineage.snapshotId, SNAP_ID);
  check('dataLineage: suggestionId', draftSuggestion?.dataLineage.suggestionId, SUG_ID);
  check('dataLineage: feedbackId', draftSuggestion?.dataLineage.feedbackId, 'fb_p5_001');
  check('dataLineage: overrideId', draftSuggestion?.dataLineage.overrideId, 'ov_p5_001');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiDraftPurchaseSuggestionService verified');
