/**
 * recipeCostBreakdown.test.ts — Feature 064 配方成本明細。
 * Run with: npx tsx src/services/__tests__/recipeCostBreakdown.test.ts
 */

import { breakdownRecipeCost } from '../costAwareMenuSuggestionService';
import type { IngredientMaster, MarketPriceSnapshot } from '../types';

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

// 基準價 pricePerBaseUnit 走 defaultPrice / defaultPriceUnit：以 kg 計價、g 為基準
// → pricePerBaseUnit = defaultPrice / 1000。故 baseQuantity(g) × (price/1000)。
function ing(id: string, pricePerKg: number | null): IngredientMaster {
  return {
    id, name: id, normalizedName: id, category: '測試',
    baseUnit: 'g', purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000,
    defaultPrice: pricePerKg ?? 0,
    // null → 用無法解析的價格單位（'' 不匹配 kg/台斤/g/purchaseUnit）→ resolveIngredientPrice 回 null
    defaultPriceUnit: pricePerKg == null ? '' : 'kg',
    isActive: true,
  };
}
const NO_SNAP: MarketPriceSnapshot | null = null;

console.log('\n── costAwareMenuSuggestionService: breakdownRecipeCost ────────────────');

// ── per-ingredient cost + sorted desc + percent ────────────────────────────
{
  const map = new Map([['豬肉', ing('豬肉', 200)], ['高麗菜', ing('高麗菜', 30)]]);
  // 豬肉 100g × 200/1000 = 20；高麗菜 200g × 30/1000 = 6；total 26
  const b = breakdownRecipeCost(
    [{ ingredientId: '高麗菜', baseQuantity: 200 }, { ingredientId: '豬肉', baseQuantity: 100 }],
    map, NO_SNAP,
  );
  check('total 26', b.costPerServing, 26);
  check('sorted: 豬肉 first', b.lines.map((l) => l.ingredientId), ['豬肉', '高麗菜']);
  check('豬肉 cost 20', b.lines[0].costPerServing, 20);
  check('豬肉 percent ~76.9', b.lines[0].percent, 76.9);
  check('complete true', b.complete, true);
  // Feature 068: 每行帶每份用量與基本單位（供批量試算）
  check('豬肉 baseQuantity 100', b.lines[0].baseQuantity, 100);
  check('baseUnit g', b.lines[0].baseUnit, 'g');
}

// ── unpriced ingredient sorted last, complete=false ────────────────────────
{
  const map = new Map([['豬肉', ing('豬肉', 200)], ['神秘', ing('神秘', null)]]);
  const b = breakdownRecipeCost(
    [{ ingredientId: '豬肉', baseQuantity: 100 }, { ingredientId: '神秘', baseQuantity: 50 }],
    map, NO_SNAP,
  );
  check('unpriced last', b.lines.map((l) => l.ingredientId), ['豬肉', '神秘']);
  check('unpriced cost null', b.lines[1].costPerServing, null);
  check('pricedLineCount 1', b.pricedLineCount, 1);
  check('complete false', b.complete, false);
}

// ── missing ingredient master → unpriced, name = id ────────────────────────
{
  const b = breakdownRecipeCost([{ ingredientId: '幽靈', baseQuantity: 10 }], new Map(), NO_SNAP);
  check('missing: costPerServing null', b.costPerServing, null);
  check('missing: name falls back to id', b.lines[0].name, '幽靈');
}

// ── empty lines ────────────────────────────────────────────────────────────
{
  const b = breakdownRecipeCost([], new Map(), NO_SNAP);
  check('empty: lines []', b.lines, []);
  check('empty: complete false', b.complete, false);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — recipeCostBreakdown verified');
