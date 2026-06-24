/**
 * Manual verification helper for Feature 028 (匯入月菜單轉正式營運菜單).
 * Exercises the pure, Firestore-free eligibility logic in
 * menuFinalizationService.ts. Firestore-dependent paths (findOperationalMenuConflicts,
 * finalizeToOperationalMenu) require a live db and are out of scope for this
 * offline script — they were reviewed by direct code inspection instead.
 *
 * Run: npx tsx scripts/verifyFinalizeToOperationalMenu.ts
 */
import { evaluateOperationalFinalizeEligibility } from '../src/services/menuFinalizationService';
import type { MenuImportBatch, MenuImportItem } from '../src/services/types';

function assert(cond: unknown, message: string): void {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function fakeBatch(overrides: Partial<MenuImportBatch>): MenuImportBatch {
  return {
    id: 'batch1',
    sourceFileName: 'test.xls',
    organizationName: '愛心家園',
    yearMonth: '2026-07',
    mealProgram: '成人午餐',
    servingBaseline: 100,
    columnMapping: {},
    importStatus: 'finalized',
    rowCount: 1,
    itemCount: 1,
    reviewedItemCount: 0,
    createdAt: 0 as never,
    createdBy: 'uid1',
    updatedAt: 0 as never,
    updatedBy: 'uid1',
    ...overrides,
  };
}

function fakeItem(overrides: Partial<MenuImportItem>): MenuImportItem {
  return {
    id: 'item1',
    batchId: 'batch1',
    rowId: 'row1',
    rowIndex: 0,
    columnKey: 'staple',
    rawDishName: '白飯',
    normalizedDishName: '白飯',
    date: '2026-07-01',
    mealType: '午餐',
    slot: 'staple',
    reviewStatus: 'pending',
    matchStatus: 'mapped',
    createdAt: 0 as never,
    createdBy: 'uid1',
    updatedAt: 0 as never,
    updatedBy: 'uid1',
    matchedRecipeId: 'recipe1',
    ...overrides,
  };
}

function main() {
  // Scenario 1: eligible — finalized batch, all items mapped.
  const eligible = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ id: 'i1' }), fakeItem({ id: 'i2' })],
  );
  assert(eligible.eligible, 'all-mapped finalized batch is eligible');
  assert(eligible.blockedReasons.length === 0, 'eligible batch has no blocked reasons');

  // Scenario 2: blocked — batch not yet finalized (still reviewing).
  const notFinalized = evaluateOperationalFinalizeEligibility(
    fakeBatch({ importStatus: 'reviewing' }),
    [fakeItem({})],
  );
  assert(!notFinalized.eligible, 'reviewing-status batch is blocked');

  // Scenario 3: blocked — unmatched items remain.
  const hasUnmatched = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ matchStatus: 'mapped' }), fakeItem({ id: 'i2', matchStatus: 'unmatched', matchedRecipeId: undefined })],
  );
  assert(!hasUnmatched.eligible, 'batch with unmatched items is blocked');
  assert(hasUnmatched.blockedReasons.some((r) => r.includes('未比對')), 'blocked reason mentions unmatched items');

  // Scenario 4: blocked — pending_review items remain.
  const hasPending = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ matchStatus: 'pending_review', matchedRecipeId: undefined })],
  );
  assert(!hasPending.eligible, 'batch with pending_review items is blocked');

  // Scenario 5: blocked — unresolved items remain.
  const hasUnresolved = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ matchStatus: 'unresolved', matchedRecipeId: undefined })],
  );
  assert(!hasUnresolved.eligible, 'batch with unresolved items is blocked');

  // Scenario 6: rejected items do not block — only mapped items are converted, rejected are excluded.
  const hasRejectedOnly = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ id: 'i1', matchStatus: 'mapped' }), fakeItem({ id: 'i2', matchStatus: 'rejected', matchedRecipeId: undefined })],
  );
  assert(hasRejectedOnly.eligible, 'rejected items alongside mapped items do not block finalization');
  assert(hasRejectedOnly.statusCounts.rejected === 1, 'rejected item is counted but not blocking');

  // Scenario 7: blocked — already operationally finalized (duplicate-finalize prevention).
  const alreadyDone = evaluateOperationalFinalizeEligibility(
    fakeBatch({ operationalFinalizedAt: 1 as never, operationalFinalizedBy: 'uid1' }),
    [fakeItem({})],
  );
  assert(!alreadyDone.eligible, 'already operationally-finalized batch is blocked from re-finalizing');
  assert(alreadyDone.alreadyFinalized, 'alreadyFinalized flag is set correctly');

  // Scenario 8: blocked — no items at all.
  const noItems = evaluateOperationalFinalizeEligibility(fakeBatch({}), []);
  assert(!noItems.eligible, 'batch with zero items is blocked');

  // Scenario 9: blocked — all items rejected, none mapped (nothing to convert).
  const allRejected = evaluateOperationalFinalizeEligibility(
    fakeBatch({}),
    [fakeItem({ matchStatus: 'rejected', matchedRecipeId: undefined })],
  );
  assert(!allRejected.eligible, 'batch with zero mapped items (all rejected) is blocked');

  if (process.exitCode === 1) {
    console.error('\nVerification FAILED');
  } else {
    console.log('\nAll verifications PASSED');
  }
}

main();
