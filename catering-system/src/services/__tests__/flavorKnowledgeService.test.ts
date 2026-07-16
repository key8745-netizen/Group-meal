/**
 * flavorKnowledgeService.test.ts — Feature 074 食材名 → 風味/技法比對。
 * Run with: npx tsx src/services/__tests__/flavorKnowledgeService.test.ts
 */

import { matchFlavorKnowledge } from '../flavorKnowledgeService';

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

console.log('\n── flavorKnowledgeService: matchFlavorKnowledge ───────────────────────');

// 九層塔：技法用「九層塔／羅勒」命中，再以共同 id 補出搭配 basil
{
  const k = matchFlavorKnowledge('九層塔');
  check('九層塔 → pairing basil', k.pairing?.id, 'basil');
  check('九層塔 → technique basil', k.technique?.id, 'basil');
}

// 大蒜：兩邊都直接命中
{
  const k = matchFlavorKnowledge('大蒜');
  check('大蒜 → pairing garlic', k.pairing?.id, 'garlic');
  check('大蒜 → technique garlic', k.technique?.id, 'garlic');
}

// 番茄：只有搭配、無技法
{
  const k = matchFlavorKnowledge('番茄');
  check('番茄 → pairing tomatoes', k.pairing?.id, 'tomatoes');
  check('番茄 → technique 無', k.technique, null);
  check('番茄 matchedName', k.matchedName, '番茄');
}

// 豬五花：只有技法（搭配庫無 pork-belly）
{
  const k = matchFlavorKnowledge('豬五花');
  check('豬五花 → technique pork-belly', k.technique?.id, 'pork-belly');
}

// 空心菜：技法用「空心菜／地瓜葉／小白菜」命中
{
  const k = matchFlavorKnowledge('空心菜');
  check('空心菜 → technique leafy-greens', k.technique?.id, 'leafy-greens');
}

// 蕈菇 paren 內 token 也可命中：使用者填「香菇」
{
  const k = matchFlavorKnowledge('香菇');
  check('香菇 → technique mushrooms', k.technique?.id, 'mushrooms');
}

// 無意義字串 → 全空
{
  const k = matchFlavorKnowledge('這不是食材xyz');
  check('無命中: pairing null', k.pairing, null);
  check('無命中: technique null', k.technique, null);
  check('無命中: matchedName null', k.matchedName, null);
}

// 空字串
{
  const k = matchFlavorKnowledge('');
  check('空字串: 全 null', [k.pairing, k.technique, k.matchedName], [null, null, null]);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — flavorKnowledgeService verified');
