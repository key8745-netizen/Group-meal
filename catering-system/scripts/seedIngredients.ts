/**
 * One-shot seeding script — writes the 10 core ingredients to Firestore.
 *
 * Run with:
 *   npx dotenv -e ../.env -- npx tsx scripts/seedIngredients.ts
 *
 * Or source the env manually and run:
 *   npx tsx scripts/seedIngredients.ts
 *
 * Requires env vars: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
 *   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET,
 *   VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
 *
 * Uses setDoc (not addDoc) so re-running is idempotent — existing docs are
 * overwritten rather than duplicated.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import { INITIAL_INGREDIENTS } from '../src/constants/initialIngredients';
import { normalizeIngredientName } from '../src/utils/normalizeIngredientName';

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

/**
 * Writes all INITIAL_INGREDIENTS to Firestore.
 * Each ingredient is written to two collections:
 *
 *   ingredients/{id}  — master data (name, unit, cost, wasteFactor)
 *   inventory/{id}    — stock snapshot (currentStock, lastUpdated)
 *
 * Both documents use the ingredient's `id` as the Firestore doc ID so that
 * lookups across the two collections stay O(1) without extra joins.
 */
export async function seedIngredients(): Promise<void> {
  for (const ing of INITIAL_INGREDIENTS) {
    // ── ingredients collection (master data) ────────────────────────────────
    await setDoc(doc(db, 'ingredients', ing.id), {
      id:           ing.id,
      name:         ing.name,
      unit:         'kg',
      unitCost:     ing.unitCostPerKg,   // field name used by the app's Ingredient type
      wasteFactor:  ing.wasteFactor,
      category:     '核心食材',
      minStockLevel: 0,
      supplierIds:  [],
      // ── Feature 010 食材主檔管理 fields — required for RecipeForm unit dropdown ──
      normalizedName: normalizeIngredientName(ing.name),
      baseUnit:                    ing.baseUnit,
      purchaseUnit:                ing.purchaseUnit,
      conversionFactorToBaseUnit:  ing.conversionFactorToBaseUnit,
      defaultPrice:                ing.defaultPrice,
      defaultPriceUnit:            ing.defaultPriceUnit,
      isActive: true,
    });
    console.log(`✓ ingredient: ${ing.name}`);

    // ── inventory collection (current stock) ────────────────────────────────
    await setDoc(doc(db, 'inventory', ing.id), {
      ingredientId:   ing.id,
      ingredientName: ing.name,
      currentStock:   ing.currentStockKg,
      unit:           'kg',
      lastUpdated:    Timestamp.now(),
    });
    console.log(`  ↳ inventory: ${ing.id} = ${ing.currentStockKg} kg`);
  }

  console.log(`\n🎉 Seed 完成！共寫入 ${INITIAL_INGREDIENTS.length} 項食材。`);
}

// Run immediately when invoked as a script
seedIngredients().catch((err) => {
  console.error('Seed 失敗：', err);
  process.exit(1);
});
