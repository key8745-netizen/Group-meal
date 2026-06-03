/**
 * aiConfidenceService.test.ts
 *
 * Validation tests for gradeIngredientConfidence() and gradeOverallConfidence().
 * Run with: npx tsx src/services/__tests__/aiConfidenceService.test.ts
 */

import { gradeIngredientConfidence, gradeOverallConfidence } from '../aiConfidenceService';
import type {
  Grams, SnapshotId, InventoryIngredientSummary,
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

const SNAP_ID = 'snap_test_001' as SnapshotId;

function makeVerifiedInventory(ingredientId = 'carrot'): InventoryIngredientSummary {
  return {
    ingredientId,
    name: 'Carrot',
    currentStockGrams: 500 as Grams,
    isVerified: true,
    source: 'manual',
    warnings: [],
    blockedReasons: [],
  };
}

console.log('\n── aiConfidenceService ────────────────────────────────────────');

// ── HIGH: all data complete, verified ─────────────────────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: 'carrot',
    shortageGrams: 500 as Grams,
    averageDailyUsageGrams: 50 as Grams,
    inventorySummary: makeVerifiedInventory(),
    summaryWarnings: [],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('HIGH: all data complete', r.level, 'HIGH');
  check('HIGH: canCreateDraft always false', r.canCreateDraft, false);
  check('HIGH: no blocked reasons', r.blockedReasons, []);
}

// ── MEDIUM: legacy kg fallback warning caps at MEDIUM ─────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: 'onion',
    shortageGrams: 1000 as Grams,
    averageDailyUsageGrams: 100 as Grams,
    inventorySummary: makeVerifiedInventory('onion'),
    summaryWarnings: ['LEGACY_KG_FALLBACK_USED'],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('MEDIUM: legacy kg caps at MEDIUM', r.level, 'MEDIUM');
  check('MEDIUM: canCreateDraft always false', r.canCreateDraft, false);
  checkTrue('MEDIUM: LEGACY_KG_FALLBACK_USED in warnings', r.warnings.includes('LEGACY_KG_FALLBACK_USED'));
}

// ── LOW: missing daily usage → LOW ────────────────────────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: 'beef',
    shortageGrams: 2000 as Grams,
    averageDailyUsageGrams: undefined,
    inventorySummary: makeVerifiedInventory('beef'),
    summaryWarnings: [],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('LOW: no daily usage → LOW', r.level, 'LOW');
  checkTrue('LOW: INCOMPLETE_BOM in warnings', r.warnings.includes('INCOMPLETE_BOM'));
}

// ── LOW: missing inventory summary → LOW ─────────────────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: 'pork',
    shortageGrams: 500 as Grams,
    averageDailyUsageGrams: 100 as Grams,
    inventorySummary: undefined,
    summaryWarnings: [],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('LOW: no inventory summary → LOW', r.level, 'LOW');
  checkTrue('LOW: MISSING_GRAMS_FIELD in warnings', r.warnings.includes('MISSING_GRAMS_FIELD'));
}

// ── BLOCKED: unverified OCR ingredient ───────────────────────────────────────
{
  const ocrInventory: InventoryIngredientSummary = {
    ...makeVerifiedInventory('chicken'),
    isVerified: false,
  };
  const r = gradeIngredientConfidence({
    ingredientId: 'chicken',
    shortageGrams: 300 as Grams,
    averageDailyUsageGrams: 30 as Grams,
    inventorySummary: ocrInventory,
    summaryWarnings: [],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('BLOCKED: unverified OCR → BLOCKED', r.level, 'BLOCKED');
  checkTrue('BLOCKED: UNVERIFIED_OCR_SOURCE', r.blockedReasons.includes('UNVERIFIED_OCR_SOURCE'));
  check('BLOCKED: canCreateDraft = false', r.canCreateDraft, false);
}

// ── BLOCKED: global blocked reason propagated ─────────────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: 'rice',
    shortageGrams: 500 as Grams,
    averageDailyUsageGrams: 50 as Grams,
    inventorySummary: makeVerifiedInventory('rice'),
    summaryWarnings: [],
    summaryBlockedReasons: ['UNIT_MIGRATION_MISMATCH'],
    sourceSnapshotId: SNAP_ID,
  });
  check('BLOCKED: global blocked propagated', r.level, 'BLOCKED');
  checkTrue('BLOCKED: UNIT_MIGRATION_MISMATCH', r.blockedReasons.includes('UNIT_MIGRATION_MISMATCH'));
}

// ── BLOCKED: missing ingredientId ─────────────────────────────────────────────
{
  const r = gradeIngredientConfidence({
    ingredientId: '',
    shortageGrams: 500 as Grams,
    summaryWarnings: [],
    summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  check('BLOCKED: missing ingredientId', r.level, 'BLOCKED');
  checkTrue('BLOCKED: MISSING_INGREDIENT_ID', r.blockedReasons.includes('MISSING_INGREDIENT_ID'));
}

// ── Overall: minimum across items ─────────────────────────────────────────────
{
  const high = gradeIngredientConfidence({
    ingredientId: 'a', shortageGrams: 100 as Grams, averageDailyUsageGrams: 20 as Grams,
    inventorySummary: makeVerifiedInventory('a'), summaryWarnings: [], summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  const low = gradeIngredientConfidence({
    ingredientId: 'b', shortageGrams: 200 as Grams, averageDailyUsageGrams: undefined,
    inventorySummary: makeVerifiedInventory('b'), summaryWarnings: [], summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  const overall = gradeOverallConfidence([high, low], [], [], SNAP_ID);
  check('overall: minimum is LOW', overall.level, 'LOW');
  check('overall: canCreateDraft always false', overall.canCreateDraft, false);
}

// ── Overall: empty items → LOW ────────────────────────────────────────────────
{
  const overall = gradeOverallConfidence([], [], [], SNAP_ID);
  check('overall: no items → LOW', overall.level, 'LOW');
}

// ── Overall: any BLOCKED item → overall BLOCKED ───────────────────────────────
{
  const high = gradeIngredientConfidence({
    ingredientId: 'a', shortageGrams: 100 as Grams, averageDailyUsageGrams: 20 as Grams,
    inventorySummary: makeVerifiedInventory('a'), summaryWarnings: [], summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  const blocked = gradeIngredientConfidence({
    ingredientId: '', shortageGrams: 100 as Grams, summaryWarnings: [], summaryBlockedReasons: [],
    sourceSnapshotId: SNAP_ID,
  });
  const overall = gradeOverallConfidence([high, blocked], [], [], SNAP_ID);
  check('overall: any BLOCKED → BLOCKED', overall.level, 'BLOCKED');
}

// ── Phase 3 invariant: canCreateDraft is always false ────────────────────────
{
  const levels = ['HIGH', 'MEDIUM', 'LOW', 'BLOCKED'] as const;
  for (const level of levels) {
    const r = gradeIngredientConfidence({
      ingredientId: level === 'BLOCKED' ? '' : 'x',
      shortageGrams: 100 as Grams,
      averageDailyUsageGrams: level === 'LOW' ? undefined : (50 as Grams),
      inventorySummary: level === 'BLOCKED' ? undefined : makeVerifiedInventory('x'),
      summaryWarnings: level === 'MEDIUM' ? ['LEGACY_KG_FALLBACK_USED'] : [],
      summaryBlockedReasons: [],
      sourceSnapshotId: SNAP_ID,
    });
    check(`canCreateDraft always false for level=${level}`, r.canCreateDraft, false);
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiConfidenceService verified');
