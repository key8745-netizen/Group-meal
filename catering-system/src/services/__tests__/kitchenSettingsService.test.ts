/**
 * kitchenSettingsService.test.ts
 *
 * Validation tests for mergeKitchenSettings / buildScheduleInput
 * (Feature 049: 我的廚房設定).
 * Run with: npx tsx src/services/__tests__/kitchenSettingsService.test.ts
 */

import {
  mergeKitchenSettings,
  buildScheduleInput,
  DEFAULT_KITCHEN_SETTINGS,
  EQUIPMENT_LABELS,
} from '../kitchenSettingsService';

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

console.log('\n── kitchenSettingsService: mergeKitchenSettings ───────────────────────');

// ── null/missing doc → full defaults ───────────────────────────────────────
{
  const s = mergeKitchenSettings(null);
  check('null: equals defaults', s, DEFAULT_KITCHEN_SETTINGS);
}

// ── valid custom values pass through ───────────────────────────────────────
{
  const s = mergeKitchenSettings({
    serviceTime: '10:30',
    capacityWindowMinutes: 300,
    bufferMinutes: 15,
    availableStaff: [{ role: '主廚', count: 1 }],
    availableEquipment: [{ type: 'steamer', count: 3 }],
  });
  check('custom: serviceTime', s.serviceTime, '10:30');
  check('custom: window', s.capacityWindowMinutes, 300);
  check('custom: buffer', s.bufferMinutes, 15);
  check('custom: staff', s.availableStaff, [{ role: '主廚', count: 1 }]);
  check('custom: equipment', s.availableEquipment, [{ type: 'steamer', count: 3 }]);
}

// ── invalid values fall back field-by-field ────────────────────────────────
{
  const s = mergeKitchenSettings({
    serviceTime: '9:30',            // 一位數小時 → 非法，退回預設
    capacityWindowMinutes: -5,
    availableStaff: [{ role: '  ', count: 2 }, { role: '廚師', count: 0 }],
    availableEquipment: [{ type: 'notAMachine', count: 1 }],
  });
  check('invalid time falls back', s.serviceTime, DEFAULT_KITCHEN_SETTINGS.serviceTime);
  check('invalid window falls back', s.capacityWindowMinutes, DEFAULT_KITCHEN_SETTINGS.capacityWindowMinutes);
  check('missing buffer falls back', s.bufferMinutes, DEFAULT_KITCHEN_SETTINGS.bufferMinutes);
  check('all-invalid staff falls back', s.availableStaff, DEFAULT_KITCHEN_SETTINGS.availableStaff);
  check('unknown equipment type falls back', s.availableEquipment, DEFAULT_KITCHEN_SETTINGS.availableEquipment);
}

// ── partial staff rows: valid rows kept, invalid dropped ───────────────────
{
  const s = mergeKitchenSettings({
    availableStaff: [{ role: '廚師', count: 3 }, { role: '', count: 2 }],
  });
  check('partial staff: valid row kept', s.availableStaff, [{ role: '廚師', count: 3 }]);
}

console.log('\n── kitchenSettingsService: buildScheduleInput ─────────────────────────');

{
  const input = buildScheduleInput('2026-07-15', {
    ...DEFAULT_KITCHEN_SETTINGS,
    serviceTime: '10:45',
    capacityWindowMinutes: 300,
  });
  checkTrue('date parsed', input.targetServiceDateTime.getFullYear() === 2026
    && input.targetServiceDateTime.getMonth() === 6
    && input.targetServiceDateTime.getDate() === 15);
  check('hour from settings', input.targetServiceDateTime.getHours(), 10);
  check('minute from settings', input.targetServiceDateTime.getMinutes(), 45);
  check('window from settings', input.capacityWindowMinutes, 300);
  check('staff copied not referenced', input.availableStaff === DEFAULT_KITCHEN_SETTINGS.availableStaff, false);
}

// ── targetCostPerServing (Feature 055) ─────────────────────────────────────
{
  check('target default 0（未設定）', mergeKitchenSettings(null).targetCostPerServing, 0);
  check('target valid value kept (rounded 1dp)',
    mergeKitchenSettings({ targetCostPerServing: 35.55 }).targetCostPerServing, 35.6);
  check('target negative falls back to 0',
    mergeKitchenSettings({ targetCostPerServing: -5 }).targetCostPerServing, 0);
  check('target non-number falls back to 0',
    mergeKitchenSettings({ targetCostPerServing: '35' }).targetCostPerServing, 0);
}

// ── every default equipment type has a label ──────────────────────────────
{
  const missing = DEFAULT_KITCHEN_SETTINGS.availableEquipment
    .filter((e) => !(e.type in EQUIPMENT_LABELS))
    .map((e) => e.type);
  check('default equipment types all labelled', missing, []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — kitchenSettingsService verified');
