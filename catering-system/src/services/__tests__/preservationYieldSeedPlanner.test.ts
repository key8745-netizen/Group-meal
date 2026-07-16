/**
 * preservationYieldSeedPlanner.test.ts — Feature 082 加工延壽良率種子計畫。
 * Run with: npx tsx src/services/__tests__/preservationYieldSeedPlanner.test.ts
 */

import { planYieldSeed, matchYieldRule, type YieldSeedIngredient } from '../preservationYieldSeedPlanner';

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

const ing = (over: Partial<YieldSeedIngredient>): YieldSeedIngredient => ({ id: 'x', name: '', ...over });

console.log('\n── preservationYieldSeedPlanner ───────────────────────────────────────');

// 名稱命中
{
  check('豬五花 → 0.70', planYieldSeed(ing({ name: '豬五花' })).ratio, 0.70);
  check('雞胸肉 → 0.75', planYieldSeed(ing({ name: '雞胸肉' })).ratio, 0.75);
  check('牛腩 → 0.65', planYieldSeed(ing({ name: '牛腩' })).ratio, 0.65);
  check('高麗菜 → 0.55', planYieldSeed(ing({ name: '高麗菜' })).ratio, 0.55);
  check('馬鈴薯 → 0.90', planYieldSeed(ing({ name: '馬鈴薯' })).ratio, 0.90);
  check('板豆腐 → 0.95', planYieldSeed(ing({ name: '板豆腐' })).ratio, 0.95);
  check('willSet action', planYieldSeed(ing({ name: '豬五花' })).action, 'willSet');
}

// 第一個命中者勝（具體優先）：名稱含五花不會被後面規則蓋掉
{
  check('五花肉優先命中五花', planYieldSeed(ing({ name: '五花肉' })).matchedRule?.includes('五花'), true);
}

// 類別備援：名稱對不上、但類別命中
{
  const r = planYieldSeed(ing({ name: '本地時蔬', category: '葉菜類' }));
  check('類別葉菜 → 0.55', r.ratio, 0.55);
  check('類別備援標記', r.matchedRule?.includes('依類別'), true);
}

// merge-only：已設定不動
{
  const r = planYieldSeed(ing({ name: '豬五花', processedYieldRatio: 0.6 }));
  check('已設定 → alreadySet', r.action, 'alreadySet');
  check('已設定 → 保留原值', r.ratio, 0.6);
}

// 乾貨略過
{
  check('乾貨 → skippedNonPerishable', planYieldSeed(ing({ name: '白米', isPerishable: false })).action, 'skippedNonPerishable');
}

// 不臆測：名稱與類別都對不上 → noMatch
{
  const r = planYieldSeed(ing({ name: '神祕食材', category: '未知' }));
  check('無命中 → noMatch', r.action, 'noMatch');
  check('無命中 → 無 ratio', r.ratio, undefined);
}

// matchYieldRule 直接測
{
  check('matchYieldRule 蝦 → 0.85', matchYieldRule('白蝦')?.ratio, 0.85);
  check('matchYieldRule 無 → null', matchYieldRule('xyz'), null);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — preservationYieldSeedPlanner verified');
