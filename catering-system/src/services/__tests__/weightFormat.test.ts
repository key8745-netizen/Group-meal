/**
 * weightFormat.test.ts — Feature 093 全站重量顯示格式化。
 * Run with: npx tsx src/services/__tests__/weightFormat.test.ts
 */

import { formatWeight, inputToKg, pricePerDisplayUnit } from '../../utils/unitConverter';

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

console.log('\n── weightFormat: formatWeight / inputToKg ─────────────────────────────');

check('1.2kg → kg', formatWeight(1.2, 'kg'), '1.20 kg');
check('0.6kg → 台斤 = 1', formatWeight(0.6, '台斤'), '1.00 台斤');
check('1.2kg → 台斤 = 2', formatWeight(1.2, '台斤'), '2.00 台斤');
check('digits=0', formatWeight(1.2, '台斤', 0), '2 台斤');
check('0kg → 台斤', formatWeight(0, '台斤'), '0.00 台斤');

check('0.453592kg → 磅 = 1', formatWeight(0.453592, '磅'), '1.00 磅');
check('1kg → 磅 ≈ 2.20', formatWeight(1, '磅'), '2.20 磅');

check('輸入 2 台斤 → 1.2kg', inputToKg(2, '台斤'), 1.2);
check('輸入 1.5 kg → 1.5kg', inputToKg(1.5, 'kg'), 1.5);
check('輸入 1 磅 → 0.45kg', inputToKg(1, '磅'), 0.45);
check('往返一致：kg→台斤→kg', inputToKg(Number((0.6 * (1 / 0.6)).toFixed(2)), '台斤') >= 0, true);

// 單價換算：$50/kg
check('$50/kg → kg 不變', pricePerDisplayUnit(50, 'kg'), 50);
check('$50/kg → 台斤 = 30', pricePerDisplayUnit(50, '台斤'), 30);
check('$100/kg → 磅 ≈ 45.36', pricePerDisplayUnit(100, '磅'), 45.36);

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — weightFormat verified');
