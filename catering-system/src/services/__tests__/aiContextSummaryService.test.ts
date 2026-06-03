/**
 * aiContextSummaryService.test.ts
 *
 * Validation tests for buildAIContextSummary().
 * Run with: npx tsx src/services/__tests__/aiContextSummaryService.test.ts
 */

import { buildAIContextSummary } from '../aiContextSummaryService';
import type { TenantId } from '../../types/aiBoundary';

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

function checkTrue(label: string, actual: boolean): void {
  check(label, actual, true);
}

const TENANT = 'tenant-abc' as TenantId;
const NOW = new Date('2026-06-03T12:00:00.000Z');

const baseSettings = {
  tenantId: TENANT,
  wasteFactorWarning: 0.3,
  aiPurchaseSuggestionEnabled: true,
  requireHumanApproval: true as const,
};

console.log('\n── aiContextSummaryService ────────────────────────────────────');

// ── Shortage formula ──────────────────────────────────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [{
      mealPlanId: 'plan-1',
      date: '2026-06-03',
      menuIds: ['menu-1'],
      headCount: 10,
    }],
    menus: [{
      menuId: 'menu-1',
      ingredients: [{ ingredientId: 'carrot', quantity: 0.1, unit: 'kg', wasteFactor: 0 }],
    }],
    inventoryItems: [{
      ingredientId: 'carrot',
      name: 'Carrot',
      currentStockKg: 0.5,  // 500g
      verified: true,
    }],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: baseSettings,
  });

  // required = 0.1 kg * 10 headCount * 1 wasteFactor = 1 kg = 1000g
  check('shortage formula: requiredQtyGrams carrot = 1000', r.requiredQtyGramsByIngredient['carrot'], 1000);
  // shortage = max(1000 + 0 - 500, 0) = 500
  check('shortage formula: shortageQtyGrams carrot = 500', r.shortageQtyGramsByIngredient['carrot'], 500);
  check('shortage formula: no blockedReasons', r.blockedReasons, []);
}

// ── Legacy kg fallback causes blocked ─────────────────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [],
    menus: [],
    inventoryItems: [],
    recentPurchaseOrders: [{
      orderId: 'po-1',
      status: 'RECEIVED',
      receivedAt: new Date(NOW.getTime() - 1000),
      items: [{ ingredientId: 'onion', purchasedQtyKg: 2 }],
    }],
    performanceLogs: [],
    settings: baseSettings,
  });
  // kg-only fallback → LEGACY_KG_FALLBACK_USED in warnings
  checkTrue('legacy kg fallback: LEGACY_KG_FALLBACK_USED in warnings', r.warnings.includes('LEGACY_KG_FALLBACK_USED'));
  // value still computed: 2 kg = 2000g
  check('legacy kg fallback: recentPurchaseTotals onion = 2000', r.recentPurchaseTotalsGramsByIngredient['onion'], 2000);
}

// ── Unverified OCR data excluded / blocked ────────────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [],
    menus: [],
    inventoryItems: [{
      ingredientId: 'beef',
      name: 'Beef',
      currentStockKg: 5,
      isOcr: true,
      verified: false,  // unverified OCR
    }],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: baseSettings,
  });
  checkTrue('unverified OCR item: blockedReasons contains UNVERIFIED_OCR_SOURCE',
    r.blockedReasons.includes('UNVERIFIED_OCR_SOURCE'));
  check('unverified OCR item: isVerified = false in inventorySummary',
    r.inventorySummaryByIngredient['beef']?.isVerified, false);
}

// ── OCR menu excluded from required qty ───────────────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [{ mealPlanId: 'p1', date: '2026-06-03', menuIds: ['ocr-menu'], headCount: 10 }],
    menus: [{ menuId: 'ocr-menu', isOcr: true, verified: false, ingredients: [{ ingredientId: 'pork', quantity: 0.5, unit: 'kg' }] }],
    inventoryItems: [],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: baseSettings,
  });
  check('unverified OCR menu: pork excluded from requiredQty', r.requiredQtyGramsByIngredient['pork'], undefined);
  checkTrue('unverified OCR menu: UNVERIFIED_OCR_SOURCE in warnings', r.warnings.includes('UNVERIFIED_OCR_SOURCE'));
}

// ── averageDailyUsage = total last 30 days / 30 ───────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [],
    menus: [],
    inventoryItems: [],
    recentPurchaseOrders: [],
    performanceLogs: [{
      ingredientId: 'rice',
      usedGrams: 3000,
      loggedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
      verified: true,
      finalized: true,
    }],
    settings: baseSettings,
  });
  // 3000g / 30 days = 100g/day
  check('averageDailyUsage: rice = 100', r.averageDailyUsageGramsByIngredient['rice'], 100);
}

// ── missing ingredientId → MISSING_INGREDIENT_ID ─────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [{ mealPlanId: 'p1', date: '2026-06-03', menuIds: ['menu-x'], headCount: 5 }],
    menus: [{ menuId: 'menu-x', ingredients: [{ ingredientId: '', quantity: 1, unit: 'kg' }] }],
    inventoryItems: [],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: baseSettings,
  });
  checkTrue('missing ingredientId: MISSING_INGREDIENT_ID in blockedReasons', r.blockedReasons.includes('MISSING_INGREDIENT_ID'));
}

// ── safety stock applied to shortage ─────────────────────────────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT,
    now: NOW,
    activeMealPlans: [{ mealPlanId: 'p1', date: '2026-06-03', menuIds: ['m1'], headCount: 1 }],
    menus: [{ menuId: 'm1', ingredients: [{ ingredientId: 'salt', quantity: 100, unit: 'grams' }] }],
    inventoryItems: [{ ingredientId: 'salt', currentStockKg: 0.2, safetyStockKg: 0.15, verified: true }],
    recentPurchaseOrders: [],
    performanceLogs: [],
    settings: baseSettings,
  });
  // required=100g, safety=150g, stock=200g → shortage=max(100+150-200,0)=50
  check('safety stock shortage: salt = 50', r.shortageQtyGramsByIngredient['salt'], 50);
}

// ── settingsSummary always has requireHumanApproval = true ───────────────────
{
  const r = buildAIContextSummary({
    tenantId: TENANT, now: NOW, activeMealPlans: [], menus: [], inventoryItems: [],
    recentPurchaseOrders: [], performanceLogs: [],
    settings: { tenantId: TENANT, requireHumanApproval: false },
  });
  check('settingsSummary.requireHumanApproval is always true', r.settingsSummary.requireHumanApproval, true);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — aiContextSummaryService verified');
