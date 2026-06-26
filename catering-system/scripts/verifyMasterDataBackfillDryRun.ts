/**
 * Feature 030 — local verification for backfillIngredientMasterFields.ts.
 *
 * Exercises planBackfillForIngredient() against safe, hardcoded fixture
 * data only — no Firestore connection, no env vars, no network access.
 * Confirms the four report categories are produced correctly and that
 * known-valid / unknown / malformed documents are never silently mutated.
 *
 * Run with:
 *   npx tsx scripts/verifyMasterDataBackfillDryRun.ts
 */

import { planBackfillForIngredient, type IngredientDocLike } from './backfillIngredientMasterFields';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

// ── Fixture 1: legacy doc, known id, missing all Feature 010 fields ────────
const fixtureLegacyKnown: IngredientDocLike = {
  id: 'white-rice',
  name: '白米',
  // no baseUnit / purchaseUnit / conversionFactorToBaseUnit / isActive
};

// ── Fixture 2: already-valid Feature 010 doc ────────────────────────────────
const fixtureAlreadyValid: IngredientDocLike = {
  id: 'tofu',
  name: '豆腐',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  conversionFactorToBaseUnit: 1000,
  defaultPrice: 35,
  defaultPriceUnit: 'kg',
  normalizedName: '豆腐',
  isActive: true,
};

// ── Fixture 3: unknown id, not in mapping table ─────────────────────────────
const fixtureUnknown: IngredientDocLike = {
  id: 'mystery-ingredient-added-via-ui',
  name: '神秘食材',
};

// ── Fixture 4: malformed legacy baseUnit (e.g. someone set baseUnit: 'kg') ──
const fixtureInvalidBaseUnit: IngredientDocLike = {
  id: 'pork',
  name: '豬肉',
  baseUnit: 'kg', // not in ['g','ml','pcs'] — must not be auto-corrected
};

// ── Fixture 5: malformed conversion factor ──────────────────────────────────
const fixtureInvalidFactor: IngredientDocLike = {
  id: 'chicken',
  name: '雞肉',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  conversionFactorToBaseUnit: 0, // invalid, must not be auto-corrected
};

const results = [
  planBackfillForIngredient(fixtureLegacyKnown),
  planBackfillForIngredient(fixtureAlreadyValid),
  planBackfillForIngredient(fixtureUnknown),
  planBackfillForIngredient(fixtureInvalidBaseUnit),
  planBackfillForIngredient(fixtureInvalidFactor),
];

console.log('\n=== Sample Dry-Run Report (local fixtures only) ===');
for (const r of results) {
  console.log(`[${r.id}] category=${r.category} reason="${r.reason}" fieldsToAdd=${JSON.stringify(r.fieldsToAdd ?? null)}`);
}
console.log('=== End sample report ===\n');

check('legacy known doc → willUpdate', results[0].category === 'willUpdate');
check('legacy known doc fieldsToAdd includes baseUnit=g', results[0].fieldsToAdd?.baseUnit === 'g');
check('legacy known doc fieldsToAdd includes isActive=true', results[0].fieldsToAdd?.isActive === true);

check('already-valid doc → alreadyValid', results[1].category === 'alreadyValid');
check('already-valid doc has no fieldsToAdd', results[1].fieldsToAdd === undefined);

check('unknown id → skippedNeedsManualMapping', results[2].category === 'skippedNeedsManualMapping');

check('invalid baseUnit → invalidOrUnsafe (not overwritten)', results[3].category === 'invalidOrUnsafe');

check('invalid conversionFactorToBaseUnit → invalidOrUnsafe (not overwritten)', results[4].category === 'invalidOrUnsafe');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
