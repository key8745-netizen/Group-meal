/**
 * dayStartService.test.ts
 *
 * Validation tests for the pure parts of dayStartService:
 * netItemsAgainstStock (Feature 046 採購扣庫存) and defaultScheduleInput.
 * Run with: npx tsx src/services/__tests__/dayStartService.test.ts
 */

import { netItemsAgainstStock, defaultScheduleInput, type NetAgainstStockItemInput } from '../dayStartService';

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

function item(ingredientId: string, demandQuantity: number, baseUnit: 'g' | 'ml' | 'pcs' = 'g'): NetAgainstStockItemInput {
  return { ingredientId, baseUnit, demandQuantity };
}

console.log('\n── dayStartService: netItemsAgainstStock ──────────────────────────────');

// ── partial stock → demand reduced, note shows arithmetic ────────────────
{
  const stock = new Map([['高麗菜', 3]]); // 3 kg = 3000 g
  const res = netItemsAgainstStock([item('高麗菜', 11000)], stock);
  check('partial stock: net demand', res.items[0].demandQuantity, 8000);
  check('partial stock: nettedCount', res.nettedCount, 1);
  check('partial stock: coveredCount', res.coveredCount, 0);
  check('partial stock: note', res.items[0].notes, '需求 11000g − 庫存 3000g → 淨採購 8000g');
}

// ── stock covers demand → 0, counted as covered ──────────────────────────
{
  const stock = new Map([['雞蛋', 10]]); // 10 kg
  const res = netItemsAgainstStock([item('雞蛋', 5000)], stock);
  check('covered: net demand 0', res.items[0].demandQuantity, 0);
  check('covered: coveredCount', res.coveredCount, 1);
}

// ── no stock entry / zero stock → untouched, no note ─────────────────────
{
  const res = netItemsAgainstStock([item('豬絞肉', 7000)], new Map([['豬絞肉', 0]]));
  check('zero stock: untouched', res.items[0].demandQuantity, 7000);
  check('zero stock: no note', res.items[0].notes, undefined);
  check('zero stock: nettedCount 0', res.nettedCount, 0);

  const res2 = netItemsAgainstStock([item('白米', 9000)], new Map());
  check('missing stock: untouched', res2.items[0].demandQuantity, 9000);
}

// ── pcs items never netted ────────────────────────────────────────────────
{
  const stock = new Map([['雞蛋', 100]]);
  const res = netItemsAgainstStock([item('雞蛋', 200, 'pcs')], stock);
  check('pcs: untouched', res.items[0].demandQuantity, 200);
  check('pcs: nettedCount 0', res.nettedCount, 0);
}

// ── ml compared via 1 ml ≈ 1 g ────────────────────────────────────────────
{
  const stock = new Map([['鮮奶', 2]]); // 2 kg ≈ 2000 ml
  const res = netItemsAgainstStock([item('鮮奶', 24000, 'ml')], stock);
  check('ml: net demand', res.items[0].demandQuantity, 22000);
  check('ml: note uses ml unit', res.items[0].notes, '需求 24000ml − 庫存 2000ml → 淨採購 22000ml');
}

// ── mixed list keeps order and only nets what it should ──────────────────
{
  const stock = new Map([['高麗菜', 1], ['雞蛋', 999]]);
  const res = netItemsAgainstStock(
    [item('高麗菜', 5000), item('豬絞肉', 3000), item('雞蛋', 100, 'pcs')],
    stock,
  );
  check('mixed: order preserved', res.items.map((i) => i.ingredientId), ['高麗菜', '豬絞肉', '雞蛋']);
  check('mixed: quantities', res.items.map((i) => i.demandQuantity), [4000, 3000, 100]);
  check('mixed: nettedCount', res.nettedCount, 1);
}

console.log('\n── dayStartService: defaultScheduleInput ──────────────────────────────');

{
  const input = defaultScheduleInput('2026-07-15');
  checkTrue('service datetime on the right date', input.targetServiceDateTime.getFullYear() === 2026
    && input.targetServiceDateTime.getMonth() === 6
    && input.targetServiceDateTime.getDate() === 15);
  check('service hour is 11', input.targetServiceDateTime.getHours(), 11);
  checkTrue('capacity window positive', input.capacityWindowMinutes > 0);
  checkTrue('has 廚師 and 助手 staff', input.availableStaff.some((s) => s.role === '廚師')
    && input.availableStaff.some((s) => s.role === '助手'));
  checkTrue('equipment covers task-draft template types',
    ['sink', 'cuttingStation', 'prepTable', 'wok'].every((t) => input.availableEquipment.some((e) => e.type === t)));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — dayStartService verified');
