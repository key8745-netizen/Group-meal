/**
 * Manual verification helper for Feature 029 (批次將匯入菜色對應既有配方).
 * Exercises the pure, Firestore-free grouping/eligibility logic in
 * bulkDishMappingService.ts. The Firestore-dependent write path
 * (bulkConfirmMapping -> confirmMapping) requires a live db and is out of
 * scope for this offline script; it was reviewed by direct code inspection
 * (it is a thin loop over Feature 024's already-shipped confirmMapping()).
 *
 * Run: npx tsx scripts/verifyBulkDishMapping.ts
 */
import { groupItemsByDishName, actionableGroups } from '../src/services/bulkDishMappingService';
import type { MenuImportItem } from '../src/services/types';

function assert(cond: unknown, message: string): void {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function fakeItem(overrides: Partial<MenuImportItem>): MenuImportItem {
  return {
    id: 'item1',
    batchId: 'batch1',
    rowId: 'row1',
    rowIndex: 0,
    columnKey: 'staple',
    rawDishName: '香Q白飯',
    normalizedDishName: '香q白飯',
    date: '2026-07-01',
    mealType: '午餐',
    slot: 'staple',
    reviewStatus: 'confirmed',
    matchStatus: 'unmatched',
    createdAt: 0 as never,
    createdBy: 'uid1',
    updatedAt: 0 as never,
    updatedBy: 'uid1',
    ...overrides,
  };
}

function main() {
  // Scenario 1: grouping by normalizedDishName collects repeated occurrences together.
  const items = [
    fakeItem({ id: 'i1', date: '2026-07-01' }),
    fakeItem({ id: 'i2', date: '2026-07-02' }),
    fakeItem({ id: 'i3', date: '2026-07-03' }),
    fakeItem({ id: 'i4', normalizedDishName: '白粥', rawDishName: '白粥', date: '2026-07-01' }),
  ];
  const groups = groupItemsByDishName(items);
  assert(groups.length === 2, `grouping produces 2 distinct dish-name groups (got ${groups.length})`);
  const riceGroup = groups.find((g) => g.normalizedDishName === '香q白飯')!;
  assert(riceGroup.items.length === 3, 'repeated dish name group collects all 3 occurrences');
  assert(riceGroup.mappableItems.length === 3, 'all unmatched items in group are mappable');

  // Scenario 2: already-mapped items are counted but excluded from mappableItems.
  const mixedGroup = groupItemsByDishName([
    fakeItem({ id: 'i1', matchStatus: 'unmatched' }),
    fakeItem({ id: 'i2', matchStatus: 'mapped', matchedRecipeId: 'recipeX' }),
  ]);
  assert(mixedGroup[0].mappableItems.length === 1, 'already-mapped item is excluded from mappableItems');
  assert(mixedGroup[0].alreadyMappedCount === 1, 'already-mapped item is counted in alreadyMappedCount');

  // Scenario 3: rejected items are counted but excluded from mappableItems.
  const rejectedGroup = groupItemsByDishName([
    fakeItem({ id: 'i1', matchStatus: 'unmatched' }),
    fakeItem({ id: 'i2', matchStatus: 'rejected' }),
  ]);
  assert(rejectedGroup[0].mappableItems.length === 1, 'rejected item is excluded from mappableItems');
  assert(rejectedGroup[0].rejectedCount === 1, 'rejected item is counted in rejectedCount');

  // Scenario 4: pending_review and unresolved items are mappable.
  const pendingAndUnresolved = groupItemsByDishName([
    fakeItem({ id: 'i1', matchStatus: 'pending_review' }),
    fakeItem({ id: 'i2', matchStatus: 'unresolved' }),
  ]);
  assert(pendingAndUnresolved[0].mappableItems.length === 2, 'pending_review and unresolved items are both mappable');

  // Scenario 5: a group with zero mappable items (all mapped/rejected) is excluded from actionableGroups.
  const allDone = [
    fakeItem({ id: 'i1', matchStatus: 'mapped', matchedRecipeId: 'recipeX' }),
    fakeItem({ id: 'i2', matchStatus: 'rejected' }),
  ];
  const actionable = actionableGroups(allDone);
  assert(actionable.length === 0, 'group with zero mappable items is excluded from actionableGroups');

  // Scenario 6: a batch with one mappable group is included in actionableGroups.
  const oneActionable = actionableGroups([fakeItem({ id: 'i1', matchStatus: 'unmatched' })]);
  assert(oneActionable.length === 1, 'group with at least one mappable item is included in actionableGroups');

  // Scenario 7: groups are sorted with the largest mappable group first.
  const sorted = groupItemsByDishName([
    fakeItem({ id: 'i1', normalizedDishName: 'a', matchStatus: 'unmatched' }),
    fakeItem({ id: 'i2', normalizedDishName: 'b', matchStatus: 'unmatched' }),
    fakeItem({ id: 'i3', normalizedDishName: 'b', matchStatus: 'unmatched' }),
  ]);
  assert(sorted[0].normalizedDishName === 'b' && sorted[0].mappableItems.length === 2, 'groups sorted by mappable count descending');

  if (process.exitCode === 1) {
    console.error('\nVerification FAILED');
  } else {
    console.log('\nAll verifications PASSED');
  }
}

main();
