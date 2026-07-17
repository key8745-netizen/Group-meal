/**
 * menuVarietyService.test.ts — Feature 092 近期已出配方集合。
 * Run with: npx tsx src/services/__tests__/menuVarietyService.test.ts
 */

import { recentlyUsedRecipeIds, type RecentMenuDay } from '../menuVarietyService';

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

const sorted = (s: Set<string>) => Array.from(s).sort();

console.log('\n── menuVarietyService: recentlyUsedRecipeIds ──────────────────────────');

const today = '2026-07-17';
const days: RecentMenuDay[] = [
  { date: '2026-07-16', recipeIds: ['a', 'b'] }, // 1 天前 ✓
  { date: '2026-07-15', recipeIds: ['c'] },      // 2 天前 ✓
  { date: '2026-07-14', recipeIds: ['d'] },      // 3 天前 ✓
  { date: '2026-07-13', recipeIds: ['e'] },      // 4 天前 ✗（超過視窗）
  { date: '2026-07-17', recipeIds: ['f'] },      // 今天 ✗（不含今天）
];

// 預設近 3 天
{
  const s = recentlyUsedRecipeIds(days, today);
  check('近3天含 a,b,c,d', sorted(s), ['a', 'b', 'c', 'd']);
  check('不含 4 天前的 e', s.has('e'), false);
  check('不含今天的 f', s.has('f'), false);
}

// 視窗 1 天
{
  const s = recentlyUsedRecipeIds(days, today, 1);
  check('近1天只含 a,b', sorted(s), ['a', 'b']);
}

// 空輸入
{
  check('空 → 空集合', sorted(recentlyUsedRecipeIds([], today)), []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — menuVarietyService verified');
