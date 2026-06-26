/**
 * Feature 030 — Master Data Bootstrap & Unit Schema Backfill.
 *
 * Adds the missing Feature 010 (食材主檔管理) fields — baseUnit, purchaseUnit,
 * conversionFactorToBaseUnit, defaultPrice, defaultPriceUnit, normalizedName,
 * isActive — to existing `/ingredients/{id}` documents that predate that
 * schema, so RecipeForm's unit dropdown (unitOptions()) has data to read.
 *
 * Safety properties (do not weaken without a fresh Gatekeeper authorization):
 *   - Idempotent: re-running produces the same result, no duplicate writes.
 *   - Merge-only: never overwrites a field that already holds a valid value.
 *   - Dry-run by default: prints a report, writes nothing, unless --execute
 *     is passed explicitly on the command line.
 *   - Unknown ingredients (no entry in the id-keyed mapping table below) are
 *     never guessed at — they are reported and skipped.
 *
 * Run with:
 *   npx dotenv -e ../.env -- npx tsx scripts/backfillIngredientMasterFields.ts            # dry-run (default)
 *   npx dotenv -e ../.env -- npx tsx scripts/backfillIngredientMasterFields.ts --execute   # writes to Firestore
 *
 * --execute must NOT be run against production without separate, explicit
 * Gatekeeper authorization referencing this script's dry-run report output.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { INITIAL_INGREDIENTS } from '../src/constants/initialIngredients';
import { normalizeIngredientName } from '../src/utils/normalizeIngredientName';
import type { IngredientBaseUnit } from '../src/services/types';

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

/** id-keyed lookup built from the known seed source, used to fill in missing fields safely. */
const KNOWN_INGREDIENT_FIELDS = new Map(
  INITIAL_INGREDIENTS.map((ing) => [
    ing.id,
    {
      baseUnit: ing.baseUnit,
      purchaseUnit: ing.purchaseUnit,
      conversionFactorToBaseUnit: ing.conversionFactorToBaseUnit,
      defaultPrice: ing.defaultPrice,
      defaultPriceUnit: ing.defaultPriceUnit,
    },
  ]),
);

const VALID_BASE_UNITS: ReadonlySet<string> = new Set(['g', 'ml', 'pcs']);

export interface IngredientDocLike {
  id: string;
  name?: string;
  normalizedName?: string;
  baseUnit?: string;
  purchaseUnit?: string;
  conversionFactorToBaseUnit?: number;
  defaultPrice?: number;
  defaultPriceUnit?: string;
  isActive?: boolean;
}

export type ReportCategory =
  | 'willUpdate'
  | 'alreadyValid'
  | 'skippedNeedsManualMapping'
  | 'invalidOrUnsafe';

export interface BackfillRowResult {
  id: string;
  name: string;
  category: ReportCategory;
  /** Only present for willUpdate — the field subset that would be written. */
  fieldsToAdd?: Record<string, unknown>;
  reason: string;
}

/**
 * Pure planning function — no Firestore access. Given the current doc and
 * the known-ingredient lookup table, decides what (if anything) to do.
 * Exported so it can be exercised directly with local fixtures (verification
 * script) without touching a live database.
 */
export function planBackfillForIngredient(
  current: IngredientDocLike,
  knownFields = KNOWN_INGREDIENT_FIELDS,
): BackfillRowResult {
  const name = current.name ?? current.id;
  const hasValidBaseUnit = !!current.baseUnit && VALID_BASE_UNITS.has(current.baseUnit);
  const hasValidPurchaseUnit = !!current.purchaseUnit;
  const hasValidConversionFactor =
    typeof current.conversionFactorToBaseUnit === 'number' && current.conversionFactorToBaseUnit > 0;

  if (hasValidBaseUnit && hasValidPurchaseUnit && hasValidConversionFactor) {
    return { id: current.id, name, category: 'alreadyValid', reason: '已具備有效的 baseUnit / purchaseUnit / conversionFactorToBaseUnit' };
  }

  // Anything present but malformed (e.g. baseUnit set to an out-of-enum value
  // such as legacy 'kg') is unsafe to merge over — flag instead of guessing.
  if (current.baseUnit && !VALID_BASE_UNITS.has(current.baseUnit)) {
    return {
      id: current.id,
      name,
      category: 'invalidOrUnsafe',
      reason: `baseUnit="${current.baseUnit}" 不在允許集合 [g, ml, pcs] 內，需人工確認，不自動覆寫`,
    };
  }
  if (
    current.conversionFactorToBaseUnit !== undefined &&
    !(typeof current.conversionFactorToBaseUnit === 'number' && current.conversionFactorToBaseUnit > 0)
  ) {
    return {
      id: current.id,
      name,
      category: 'invalidOrUnsafe',
      reason: `conversionFactorToBaseUnit="${current.conversionFactorToBaseUnit}" 非正數，需人工確認，不自動覆寫`,
    };
  }

  const known = knownFields.get(current.id);
  if (!known) {
    return {
      id: current.id,
      name,
      category: 'skippedNeedsManualMapping',
      reason: '此 id 不在已知對照表中，需人工於配方/食材主檔管理介面補齊',
    };
  }

  const fieldsToAdd: Record<string, unknown> = {};
  if (!hasValidBaseUnit) fieldsToAdd.baseUnit = known.baseUnit;
  if (!hasValidPurchaseUnit) fieldsToAdd.purchaseUnit = known.purchaseUnit;
  if (!hasValidConversionFactor) fieldsToAdd.conversionFactorToBaseUnit = known.conversionFactorToBaseUnit;
  if (current.defaultPrice === undefined) fieldsToAdd.defaultPrice = known.defaultPrice;
  if (current.defaultPriceUnit === undefined) fieldsToAdd.defaultPriceUnit = known.defaultPriceUnit;
  if (current.normalizedName === undefined) fieldsToAdd.normalizedName = normalizeIngredientName(name);
  if (current.isActive === undefined) fieldsToAdd.isActive = true;

  return { id: current.id, name, category: 'willUpdate', fieldsToAdd, reason: '已知食材，補齊缺漏的 Feature 010 欄位（不覆寫既有有效值）' };
}

function printReport(results: BackfillRowResult[]): void {
  const byCategory: Record<ReportCategory, BackfillRowResult[]> = {
    willUpdate: [],
    alreadyValid: [],
    skippedNeedsManualMapping: [],
    invalidOrUnsafe: [],
  };
  for (const r of results) byCategory[r.category].push(r);

  console.log('\n=== Feature 030 Backfill Dry-Run Report ===\n');
  console.log(`Total ingredients inspected: ${results.length}`);
  for (const cat of Object.keys(byCategory) as ReportCategory[]) {
    console.log(`  ${cat}: ${byCategory[cat].length}`);
  }

  for (const cat of Object.keys(byCategory) as ReportCategory[]) {
    if (byCategory[cat].length === 0) continue;
    console.log(`\n--- ${cat} ---`);
    for (const r of byCategory[cat]) {
      const fields = r.fieldsToAdd ? ` fieldsToAdd=${JSON.stringify(r.fieldsToAdd)}` : '';
      console.log(`  [${r.id}] ${r.name} — ${r.reason}${fields}`);
    }
  }
  console.log('\n=== End of report ===\n');
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, 'group-meal');

  const snap = await getDocs(collection(db, 'ingredients'));
  const docs: IngredientDocLike[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as IngredientDocLike);

  const results = docs.map((d) => planBackfillForIngredient(d));
  printReport(results);

  if (!execute) {
    console.log('Dry-run only — no writes performed. Pass --execute to write (requires separate Gatekeeper authorization).');
    return;
  }

  console.log('\n--execute flag detected — writing missing fields now...\n');
  for (const r of results) {
    if (r.category !== 'willUpdate' || !r.fieldsToAdd) continue;
    await updateDoc(doc(db, 'ingredients', r.id), r.fieldsToAdd);
    console.log(`  ✓ updated ${r.id} (${r.name})`);
  }
  console.log('\nBackfill execute run complete.');
}

// Only run when invoked directly (e.g. `npx tsx scripts/backfillIngredientMasterFields.ts`),
// never as a side effect of importing planBackfillForIngredient() for verification/tests.
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error('Backfill 失敗：', err);
    process.exit(1);
  });
}
