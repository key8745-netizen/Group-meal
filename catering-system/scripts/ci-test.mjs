/**
 * ci-test.mjs — Feature 080: CI 單元測試執行器。
 *
 * 跑 src/services/__tests__ 下所有 *.test.ts（每支為獨立 tsx 腳本，失敗時 throw
 * 並以非零結束）。排除需要 Firebase 模擬器的 *.emulator.test.ts。任一支失敗即
 * 整體以 exit 1 結束，讓 CI 轉紅。逐支只在失敗時印出完整輸出，成功印一行 ✓。
 */

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = 'src/services/__tests__';
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.ts') && !f.includes('.emulator.'))
  .sort();

const failed = [];
for (const f of files) {
  const res = spawnSync('npx', ['tsx', path.join(dir, f)], { encoding: 'utf8' });
  if (res.status === 0) {
    console.log(`✓ ${f}`);
  } else {
    console.log(`✗ ${f}`);
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    failed.push(f);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} suites passed`);
if (failed.length > 0) {
  console.error(`FAILED (${failed.length}): ${failed.join(', ')}`);
  process.exit(1);
}
