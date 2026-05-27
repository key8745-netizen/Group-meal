/**
 * generateAutomatedOrder.ts
 *
 * Automated daily script — simulates tomorrow's demand, compares it against
 * live inventory, and writes a DRAFT purchase order for any shortages.
 *
 * Usage:
 *   npx tsx scripts/generateAutomatedOrder.ts [recipeId] [headCount]
 *
 * Arguments (both optional — use env vars or defaults if omitted):
 *   recipeId   Firestore document ID under `menus/`. Default: RECIPE_ID env var
 *              or the first menu document found in Firestore.
 *   headCount  Number of servings. Default: HEAD_COUNT env var or 360.
 *
 * Environment variables (see .env at repo root):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   RECIPE_ID      (optional — overridden by CLI arg)
 *   HEAD_COUNT     (optional — overridden by CLI arg)
 *
 * Run with env file:
 *   npx dotenv -e ../.env -- npx tsx scripts/generateAutomatedOrder.ts
 *
 * Or source the env manually:
 *   export $(grep -v '^#' ../.env | xargs) && npx tsx scripts/generateAutomatedOrder.ts
 */

import { initializeApp }          from 'firebase/app';
import { collection, addDoc, getDocs, getFirestore, serverTimestamp } from 'firebase/firestore';
import { checkInventoryFeasibility } from '../src/services/recipeMatchingService';

// ─── Firebase init ────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app, 'group-meal');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[generateAutomatedOrder] ${msg}`); }

async function resolveRecipeId(cliArg?: string): Promise<string> {
  if (cliArg) return cliArg;
  if (process.env.RECIPE_ID) return process.env.RECIPE_ID;

  log('No recipeId provided — fetching first menu from Firestore…');
  const snap = await getDocs(collection(db, 'menus'));
  if (snap.empty) throw new Error('No menus found in Firestore. Cannot resolve recipeId.');
  const first = snap.docs[0];
  const name  = (first.data().name as string | undefined) ?? first.id;
  log(`Using menu: "${name}" (${first.id})`);
  return first.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [,, cliRecipeId, cliHeadCount] = process.argv;

  const recipeId  = await resolveRecipeId(cliRecipeId);
  const headCount = cliHeadCount
    ? parseInt(cliHeadCount, 10)
    : process.env.HEAD_COUNT
      ? parseInt(process.env.HEAD_COUNT, 10)
      : 360;

  if (isNaN(headCount) || headCount <= 0) {
    throw new Error(`Invalid headCount: "${cliHeadCount ?? process.env.HEAD_COUNT}"`);
  }

  log(`Recipe: ${recipeId}  |  Head count: ${headCount}`);
  log('Checking inventory feasibility…');

  const result = await checkInventoryFeasibility(db, recipeId, headCount);

  const shortages = result.items.filter((i) => i.isShortage);

  if (shortages.length === 0) {
    log('✓ Inventory is sufficient — no purchase order needed.');
    process.exit(0);
  }

  log(`Found ${shortages.length} shortage(s):`);
  shortages.forEach((s) => {
    log(`  - ${s.name}: need ${s.requiredKg} kg, have ${s.currentStockKg} kg (short ${s.shortageKg} kg)`);
  });

  const items = shortages.map((s) => ({
    ingredientId:   s.ingredientId,
    name:           s.name,
    shortageKg:     s.shortageKg,
    shortageTaijin: s.shortageTaijin,
  }));

  const ref = await addDoc(collection(db, 'purchaseOrders'), {
    status:    'DRAFT',
    items,
    notes:     '系統自動生成',
    createdAt: serverTimestamp(),
  });

  log(`✓ Draft purchase order created: ${ref.id}`);
  log(`  Items: ${items.length}  |  Run the app to review and confirm.`);

  process.exit(0);
}

main().catch((err) => {
  console.error('[generateAutomatedOrder] Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
