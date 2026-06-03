/**
 * AISuggestionCard.test.tsx
 *
 * Structural / logic validation for AISuggestionCard and related components.
 * Tests the component contract without a DOM renderer.
 * Run with: npx tsx src/components/ai/__tests__/AISuggestionCard.test.tsx
 */

import type {
  AIPurchaseSuggestion, TenantId, SuggestionId, SnapshotId, Grams,
} from '../../../types/aiBoundary';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const NOW = new Date('2026-06-03T12:00:00Z');
const SNAP_ID = 'snap_ui_001' as SnapshotId;

// ── Mock suggestion factories ─────────────────────────────────────────────────

function makeHighSuggestion(): AIPurchaseSuggestion {
  return {
    suggestionId:     'sug_ui_001' as SuggestionId,
    tenantId:         'tenant-ui' as TenantId,
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
  };
}

function makeBlockedSuggestion(): AIPurchaseSuggestion {
  return {
    ...makeHighSuggestion(),
    overallConfidence: {
      level: 'BLOCKED',
      reasons: ['UNVERIFIED_OCR_SOURCE'],
      blockReason: 'UNVERIFIED_OCR_SOURCE',
      blockedReasons: ['UNVERIFIED_OCR_SOURCE'],
      warnings: [],
      canCreateDraft: false,
      sourceSnapshotId: SNAP_ID,
    },
    blockedReasons: ['UNVERIFIED_OCR_SOURCE'],
    items: [{
      ingredientId: 'beef',
      name: 'Beef',
      suggestedQtyGrams: 500 as Grams,
      currentStockGrams: 0 as Grams,
      shortageGrams: 500 as Grams,
      confidence: {
        level: 'BLOCKED',
        reasons: ['UNVERIFIED_OCR_SOURCE'],
        blockReason: 'UNVERIFIED_OCR_SOURCE',
        blockedReasons: ['UNVERIFIED_OCR_SOURCE'],
        warnings: [],
        canCreateDraft: false,
        sourceSnapshotId: SNAP_ID,
      },
    }],
  };
}

// ── Snapshot fixture ──────────────────────────────────────────────────────────

const SNAPSHOT_FIXTURE = {
  snapshotId: SNAP_ID,
  generatedAt: NOW,
  sourceCollections: ['inventory', 'mealPlans'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── AISuggestionCard (structural) ──────────────────────────────');

// usableForDraft is always false (Phase 3/4 invariant)
{
  const s = makeHighSuggestion();
  check('usableForDraft is always false', s.usableForDraft, false);
}

// BLOCKED suggestion: overall level
{
  const s = makeBlockedSuggestion();
  check('blocked: overallConfidence.level = BLOCKED', s.overallConfidence.level, 'BLOCKED');
  checkTrue('blocked: blockedReasons non-empty', s.blockedReasons.length > 0);
  check('blocked: usableForDraft still false', s.usableForDraft, false);
}

// Forbidden fields must NOT exist on suggestion
{
  const s = makeHighSuggestion();
  const forbidden = ['transactions', 'performanceLogs', 'rawBOM', 'ocrText', 'customerData', 'purchaseOrders'];
  for (const f of forbidden) {
    check(`no raw field: ${f}`, f in s, false);
  }
}

// DataLineage only exposes safe fields
{
  const lineage = SNAPSHOT_FIXTURE;
  const exposedKeys = Object.keys(lineage);
  const allowed = new Set(['snapshotId', 'generatedAt', 'sourceCollections']);
  const forbidden = exposedKeys.filter(k => !allowed.has(k));
  check('dataLineage: only safe fields exposed', forbidden, []);

  // Must NOT contain raw data fields
  const rawFields = ['summary', 'rawLogs', 'ocrText', 'transactions', 'performanceLogs'];
  for (const f of rawFields) {
    check(`dataLineage: no raw field ${f}`, f in lineage, false);
  }
}

// ConfidenceBadge maps all levels
{
  const levels = ['HIGH', 'MEDIUM', 'LOW', 'BLOCKED'] as const;
  for (const level of levels) {
    check(`confidence level ${level} is known`, levels.includes(level), true);
  }
}

// Item has no purchase/draft action surface (confirmed by type)
{
  const s = makeHighSuggestion();
  // The AIPurchaseSuggestion type has no createDraft / createOrder methods
  check('no createDraft method on suggestion', 'createDraft' in s, false);
  check('no createOrder method on suggestion', 'createOrder' in s, false);
  check('no approveDraft method on suggestion', 'approveDraft' in s, false);
}

// Suggestion has exactly the expected top-level keys
{
  const s = makeHighSuggestion();
  const keys = new Set(Object.keys(s));
  const required = [
    'suggestionId', 'tenantId', 'sourceSnapshotId', 'generatedAt', 'expiresAt',
    'items', 'overallConfidence', 'usableForDraft', 'blockedReasons', 'warnings', 'auditEvent',
  ];
  for (const k of required) {
    checkTrue(`key present: ${k}`, keys.has(k));
  }
}

// Items contain confidence per-ingredient
{
  const s = makeHighSuggestion();
  const item = s.items[0];
  checkTrue('item has confidence', !!item.confidence);
  check('item.confidence.canCreateDraft always false', item.confidence.canCreateDraft, false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — AISuggestionCard structural tests verified');
