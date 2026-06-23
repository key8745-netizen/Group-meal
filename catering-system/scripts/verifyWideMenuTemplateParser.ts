/**
 * One-off verification script for Feature 026 wide monthly menu template
 * parsing. Builds an in-memory matrix fixture matching the reported real
 * file shape (115年7月份服務對象(愛心家園)營養午餐菜單) and asserts the
 * parser's output. No Firestore access — pure function verification.
 *
 * Run: npx tsx scripts/verifyWideMenuTemplateParser.ts
 */
import { isWideMonthlyMenuTemplate, parseWideMonthlyMenuTemplate } from '../src/services/wideMenuTemplateParser';

function assert(cond: unknown, message: string): void {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

const HEADER = ['日期', '星期', '主食', '主菜A', '主菜B', '副菜一', '副菜二', '湯品', '早療午點', '營養份量'];

function dayRow(day: number, dishes: string[]): unknown[] {
  return [day, '', ...dishes, ''];
}

const matrix: unknown[][] = [
  ['115年7月份服務對象(愛心家園)營養午餐菜單'],
  [],
  HEADER,
  dayRow(1, ['白飯', '紅燒肉', '滷雞腿', '炒青菜', '涼拌豆腐', '蘿蔔湯', '布丁']),
  dayRow(2, ['白飯', '糖醋魚', '炒蛋', '炒高麗菜', '滷海帶', '玉米湯', '果凍']),
  ['服務準備周', '', '', '', '', '', '', '', '', ''],
  ['不供餐', '', '', '', '', '', '', '', '', ''],
  ['不供餐', '', '', '', '', '', '', '', '', ''],
  ['不供餐', '', '', '', '', '', '', '', '', ''],
  ['不供餐', '', '', '', '', '', '', '', '', ''],
];

assert(isWideMonthlyMenuTemplate(matrix), 'detects wide monthly menu template');

const result = parseWideMonthlyMenuTemplate(matrix);
assert(result.yearMonth === '2026-07', `ROC 115年7月 -> Gregorian 2026-07 (got ${result.yearMonth})`);
assert(
  result.headers.join(',') === '日期,主食,主菜A,主菜B,副菜一,副菜二,湯品,早療午點',
  `slot headers extracted in order, 營養份量/星期 excluded (got ${result.headers.join(',')})`,
);

const lines = result.csvText.split('\n');
assert(lines.length === 3, `2 service days produce 2 CSV data rows + header (got ${lines.length} lines)`);
assert(lines[1].startsWith('2026-07-01,'), `day 1 normalized to 2026-07-01 (got ${lines[1]})`);
assert(lines[2].startsWith('2026-07-02,'), `day 2 normalized to 2026-07-02 (got ${lines[2]})`);
assert(
  result.warnings.some((w) => w.includes('服務準備周')),
  '服務準備周 row produces a skip warning',
);
assert(
  result.warnings.filter((w) => w.includes('已略過')).length === 5,
  `non-service rows all skipped with warnings (got ${result.warnings.length} warnings)`,
);

if (process.exitCode === 1) {
  console.error('\nVerification FAILED');
} else {
  console.log('\nAll verifications PASSED');
}
