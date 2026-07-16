/**
 * laborSummaryService.test.ts — Feature 065 人力工時彙總。
 * Run with: npx tsx src/services/__tests__/laborSummaryService.test.ts
 */

import { summarizeLabor, estimateCompletionMinutes, type LaborTaskInput } from '../laborSummaryService';

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

function task(estimatedMinutes: number, staffRole?: string, staffCount = 1, taskStatus: 'active' | 'archived' = 'active'): LaborTaskInput {
  return { estimatedMinutes, staffRole, staffCount, taskStatus };
}

console.log('\n── laborSummaryService: summarizeLabor ────────────────────────────────');

// ── sums person-minutes, groups by role, sorts desc ────────────────────────
{
  const s = summarizeLabor([
    task(10, '助手'),
    task(20, '廚師'),
    task(5, '助手'),
  ]);
  check('total 35', s.totalMinutes, 35);
  check('taskCount 3', s.taskCount, 3);
  check('byRole sorted', s.byRole.map((r) => r.role), ['廚師', '助手']);
  check('助手 minutes 15', s.byRole.find((r) => r.role === '助手')!.minutes, 15);
}

// ── staffCount multiplies into person-minutes ──────────────────────────────
{
  const s = summarizeLabor([task(10, '廚師', 2)]);
  check('staffCount×minutes = 20', s.totalMinutes, 20);
}

// ── archived excluded; zero/negative minutes excluded ──────────────────────
{
  const s = summarizeLabor([
    task(10, '助手'),
    task(30, '廚師', 1, 'archived'),
    task(0, '助手'),
    task(-5, '助手'),
  ]);
  check('archived/zero/neg excluded: total 10', s.totalMinutes, 10);
  check('taskCount 1', s.taskCount, 1);
}

// ── missing role → 未指定 ──────────────────────────────────────────────────
{
  const s = summarizeLabor([task(8), task(4, '  ')]);
  check('blank/undefined role → 未指定', s.byRole.map((r) => r.role), ['未指定']);
  check('未指定 minutes 12', s.byRole[0].minutes, 12);
}

// ── empty ──────────────────────────────────────────────────────────────────
{
  const s = summarizeLabor([]);
  check('empty total 0', s.totalMinutes, 0);
  check('empty byRole []', s.byRole, []);
}

console.log('\n── laborSummaryService: estimateCompletionMinutes ─────────────────────');

check('60 / 2 = 30', estimateCompletionMinutes(60, 2), 30);
check('35 / 2 = ceil 18', estimateCompletionMinutes(35, 2), 18);
check('staff 0 → treated as 1', estimateCompletionMinutes(40, 0), 40);
check('staff 2.9 → floor 2', estimateCompletionMinutes(40, 2.9), 20);

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — laborSummaryService verified');
