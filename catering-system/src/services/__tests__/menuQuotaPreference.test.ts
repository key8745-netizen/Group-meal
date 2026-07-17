/**
 * menuQuotaPreference.test.ts — Feature 099 配額偏好解析/序列化。
 * Run with: npx tsx src/services/__tests__/menuQuotaPreference.test.ts
 */

import { parseStoredQuotas, serializeQuotas, totalQuotaCount, QUOTA_CATEGORIES } from '../menuQuotaPreference';

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

console.log('\n── menuQuotaPreference ────────────────────────────────────────────────');

// null → 預設（主菜1 主食1 蔬菜2 湯1）
{
  const q = parseStoredQuotas(null);
  check('null → 4 類', q.map((x) => x.category), ['主菜', '主食', '蔬菜', '湯']);
  check('null → 預設數', q.map((x) => x.count), [1, 1, 2, 1]);
}

// 自訂值
{
  const q = parseStoredQuotas(JSON.stringify({ 主菜: 2, 主食: 0, 蔬菜: 3, 湯: 1 }));
  check('自訂數', q.map((x) => x.count), [2, 0, 3, 1]);
}

// 缺漏欄位 → 該欄回落預設
{
  const q = parseStoredQuotas(JSON.stringify({ 蔬菜: 4 }));
  check('缺漏回落', q.map((x) => x.count), [1, 1, 4, 1]);
}

// 非法值 → 回落
{
  check('負數回落', parseStoredQuotas(JSON.stringify({ 主菜: -1 }))[0].count, 1);
  check('非數字回落', parseStoredQuotas(JSON.stringify({ 主菜: 'x' }))[0].count, 1);
  check('小數取整', parseStoredQuotas(JSON.stringify({ 主菜: 2.9 }))[0].count, 2);
  check('上限 20', parseStoredQuotas(JSON.stringify({ 主菜: 999 }))[0].count, 20);
}

// 非法 JSON → 全預設
{
  check('壞 JSON → 預設', parseStoredQuotas('not json').map((x) => x.count), [1, 1, 2, 1]);
}

// 序列化往返
{
  const q = parseStoredQuotas(JSON.stringify({ 主菜: 2, 主食: 1, 蔬菜: 2, 湯: 0 }));
  check('往返一致', parseStoredQuotas(serializeQuotas(q)).map((x) => x.count), [2, 1, 2, 0]);
}

// 總道數
{
  check('總道數', totalQuotaCount(parseStoredQuotas(null)), 5);
  check('類別常數', QUOTA_CATEGORIES.length, 4);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — menuQuotaPreference verified');
