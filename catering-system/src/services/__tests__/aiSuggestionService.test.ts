/**
 * aiSuggestionService.test.ts
 *
 * Validation tests for buildAIPurchaseSuggestion().
 * Run with: npx tsx src/services/__tests__/aiSuggestionService.test.ts
 */

import { buildAIPurchaseSuggestion } from '../aiSuggestionService';
import { generateAIContextSnapshot } from '../aiContextSnapshotService';
import { buildAIContextSummary } from '../aiContextSummaryService';
import { AIOperationBlockedError } from '../aiBoundaryService';
import type {
  TenantId, AIContextSnapshot, AIOperationRequest, AIContextSummary,
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
function checkThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    console.error(`  ❌ ${label} — expected throw but did not throw`);
    failed++;
  } catch (err) {
    console.log(`  ✅ ${label} (threw: ${(err as Error).message.slice(0, 80)})`);
    passed++;
  }
}

const TENANT = 'tenant-abc' as TenantId;
const NOW = new Date('2026-06-03T12:00:00.000Z');
const D_START = new Date('2026-06-01T00:00:00.000Z');
const D_END   = new Date('2026-06-07T00:00:00.000Z');

function makeBaseOperation(overrides: Partial<AIOperationRequest> = {}): AIOperationRequest {
  return {
    operationId:       'op-sug-001',
    tenantId:          TENANT,
    callerType:        'ai',
    callerId:          'ai-suggestion-fn',
    targetCollection:  'ai_suggestions',
    targetPath:        'ai_suggestions/sug-001',
    action:            'create',
    payloadSummary:    { tenantId: TENANT },
    sourceSnapshotId:  'snap-001',
    auditTrailId:      'audit-001',
    suggestionId:      'sug-001',
    requestId:         'req-sug-001',
    createdAt:         NOW,
    ...overrides,
  };
}

function makeSnapOperation(): AIOperationRequest {
  return {
    operationId:       'op-snap-001',
    tenantId:          TENANT,
    callerType:        'system',
    callerId:          'snapshot-service',
    targetCollection:  'ai_context_snapshots',
    targetPath:        'ai_context_snapshots/snap-001',
    action:            'create',
    payloadSummary:    { tenantId: TENANT },
    requestId:         'req-snap-001',
    createdAt:         NOW,
  };
}

function makeCleanSnapshot(summaryOverrides?: Partial<AIContextSummary>): AIContextSnapshot {
  const summary = {
    ...buildAIContextSummary({
      tenantId: TENANT, now: NOW,
      activeMealPlans: [], menus: [], inventoryItems: [],
      recentPurchaseOrders: [], performanceLogs: [],
      settings: { tenantId: TENANT },
    }),
    ...summaryOverrides,
  };
  return generateAIContextSnapshot(makeSnapOperation(), {
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary,
    sourceCollections: ['inventory', 'mealPlans'],
    recordCounts: { inventory: 10, mealPlans: 5 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  }).snapshot;
}

function makeShortageSnapshot() {
  // carrot: required=1000g, stock=300g → shortage=700g
  const summary = buildAIContextSummary({
    tenantId: TENANT, now: NOW,
    activeMealPlans: [{ mealPlanId: 'p1', date: '2026-06-03', menuIds: ['m1'], headCount: 10 }],
    menus: [{ menuId: 'm1', ingredients: [{ ingredientId: 'carrot', quantity: 0.1, unit: 'kg' }] }],
    inventoryItems: [{ ingredientId: 'carrot', name: 'Carrot', currentStockKg: 0.3, verified: true }],
    recentPurchaseOrders: [],
    performanceLogs: [
      {
        ingredientId: 'carrot', usedGrams: 1500,
        loggedAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
        verified: true, finalized: true,
      },
    ],
    settings: { tenantId: TENANT },
  });
  return generateAIContextSnapshot(makeSnapOperation(), {
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary,
    sourceCollections: ['inventory', 'mealPlans'],
    recordCounts: { inventory: 1, mealPlans: 1 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  }).snapshot;
}

console.log('\n── aiSuggestionService ────────────────────────────────────────');

// ── usableForDraft is ALWAYS false (Phase 3 invariant) ────────────────────────
{
  const snap = makeShortageSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  check('Phase 3 invariant: usableForDraft = false', suggestion.usableForDraft, false);
}

// ── valid shortage → suggestion items generated ───────────────────────────────
{
  const snap = makeShortageSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  checkTrue('shortage snapshot: at least one item', suggestion.items.length > 0);
  check('shortage: item ingredientId = carrot', suggestion.items[0].ingredientId, 'carrot');
  checkTrue('shortage: suggestedQtyGrams > 0', suggestion.items[0].suggestedQtyGrams > 0);
  checkTrue('shortage: shortageGrams > 0', suggestion.items[0].shortageGrams > 0);
}

// ── audit event returned: SUGGESTION_GENERATED ────────────────────────────────
{
  const snap = makeShortageSnapshot();
  const { suggestion, auditEvent } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  check('auditEvent: eventType = SUGGESTION_GENERATED', auditEvent.eventType, 'SUGGESTION_GENERATED');
  check('auditEvent: actorType = ai', auditEvent.actorType, 'ai');
  check('auditEvent: eventVersion = 1', auditEvent.eventVersion, 1);
  checkTrue('auditEvent: eventHash present', auditEvent.eventHash.length > 0);
  check('auditEvent matches suggestion.auditEvent', auditEvent.eventHash, suggestion.auditEvent.eventHash);
  check('metadata: usableForDraft = false',
    (auditEvent.metadata as Record<string, unknown>)?.usableForDraft, false);
}

// ── expired snapshot → BLOCKED suggestion (not throw) ────────────────────────
{
  const snap = makeCleanSnapshot();
  const pastNow = new Date(snap.expiresAt.getTime() + 1000);
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: pastNow, operation: makeBaseOperation() });
  check('expired: level = BLOCKED', suggestion.overallConfidence.level, 'BLOCKED');
  checkTrue('expired: EXPIRED_SNAPSHOT in blockedReasons', suggestion.blockedReasons.includes('EXPIRED_SNAPSHOT'));
  check('expired: usableForDraft = false', suggestion.usableForDraft, false);
  check('expired: items empty', suggestion.items, []);
}

// ── contaminated snapshot → BLOCKED suggestion ───────────────────────────────
{
  const contaminatedSnap = generateAIContextSnapshot(makeSnapOperation(), {
    tenantId: TENANT, mode: 'summary', now: NOW,
    dateRangeStart: D_START, dateRangeEnd: D_END,
    summary: buildAIContextSummary({
      tenantId: TENANT, now: NOW,
      activeMealPlans: [], menus: [],
      inventoryItems: [{ ingredientId: 'beef', currentStockKg: 5, isOcr: true, verified: false }],
      recentPurchaseOrders: [], performanceLogs: [],
      settings: { tenantId: TENANT },
    }),
    sourceCollections: ['inventory'],
    recordCounts: { inventory: 1 },
    contaminationDetected: false,
    contaminationReasons: [],
    createdBy: 'system',
  }).snapshot;
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: contaminatedSnap, now: NOW, operation: makeBaseOperation() });
  check('contaminated: level = BLOCKED', suggestion.overallConfidence.level, 'BLOCKED');
  check('contaminated: usableForDraft = false', suggestion.usableForDraft, false);
}

// ── debug snapshot → BLOCKED suggestion ──────────────────────────────────────
{
  const debugSnap: AIContextSnapshot = { ...makeCleanSnapshot(), mode: 'debug' };
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: debugSnap, now: NOW, operation: makeBaseOperation() });
  check('debug: level = BLOCKED', suggestion.overallConfidence.level, 'BLOCKED');
  checkTrue('debug: SNAPSHOT_DEBUG_NOT_ALLOWED', suggestion.blockedReasons.includes('SNAPSHOT_DEBUG_NOT_ALLOWED'));
}

// ── missing callerType → throws AIOperationBlockedError ──────────────────────
{
  checkThrows('missing callerType → throws', () => {
    const op = makeBaseOperation();
    (op as unknown as Record<string, unknown>)['callerType'] = undefined;
    buildAIPurchaseSuggestion({ snapshot: makeCleanSnapshot(), now: NOW, operation: op });
  });
}

// ── missing tenantId in operation → throws ────────────────────────────────────
{
  let threw = false;
  try {
    buildAIPurchaseSuggestion({ snapshot: makeCleanSnapshot(), now: NOW, operation: makeBaseOperation({ tenantId: '' }) });
  } catch (err) {
    if (err instanceof AIOperationBlockedError) {
      threw = true;
    }
  }
  check('missing op tenantId → AIOperationBlockedError', threw, true);
}

// ── suggestion has sourceSnapshotId matching the snapshot ────────────────────
{
  const snap = makeCleanSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  check('sourceSnapshotId matches snapshot', suggestion.sourceSnapshotId, snap.snapshotId);
  check('tenantId matches', suggestion.tenantId, TENANT);
}

// ── suggestion expiresAt = now + 2 hours ──────────────────────────────────────
{
  const snap = makeCleanSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  const expectedExpiry = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
  check('expiresAt = now + 2h', suggestion.expiresAt.getTime(), expectedExpiry.getTime());
}

// ── no items when no shortage ─────────────────────────────────────────────────
{
  const snap = makeCleanSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  check('no shortage: items empty', suggestion.items, []);
  // level: LOW (no items → overall is LOW)
  check('no shortage: level = LOW', suggestion.overallConfidence.level, 'LOW');
}

// ── suggestion does NOT contain raw data fields ───────────────────────────────
{
  const snap = makeShortageSnapshot();
  const { suggestion } = buildAIPurchaseSuggestion({ snapshot: snap, now: NOW, operation: makeBaseOperation() });
  const forbiddenFields = ['transactions', 'performanceLogs', 'rawBOM', 'ocrText', 'customerData', 'purchaseOrders'];
  for (const field of forbiddenFields) {
    check(`suggestion has no raw field: ${field}`, Object.keys(suggestion).includes(field), false);
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiSuggestionService verified');
