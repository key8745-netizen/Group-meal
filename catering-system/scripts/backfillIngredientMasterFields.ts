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
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import {
  planBackfillForIngredient,
  type IngredientDocLike,
  type ReportCategory,
  type BackfillRowResult,
} from '../src/services/ingredientBackfillPlanner';

export type { IngredientDocLike, ReportCategory, BackfillRowResult };
export { planBackfillForIngredient };

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

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
// Comparing via resolved filesystem paths (rather than raw string equality against
// `file://${process.argv[1]}`) keeps this correct on Windows, where import.meta.url
// is URL-encoded (e.g. spaces as %20, forward slashes) and differs in form from
// process.argv[1]'s native OS path — a direct string comparison never matches there.
const isDirectRun =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error('Backfill 失敗：', err);
    process.exit(1);
  });
}
