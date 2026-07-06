/**
 * ingredientSeedService — Feature 041: 常用食材一鍵建檔
 *
 * Plans and executes a one-click import of the curated ingredient template
 * set (`src/constants/ingredientSeedTemplates.ts`) into the `ingredients`
 * master collection.
 *
 * Duplicate detection reuses the exact same `normalizeIngredientName()`
 * helper that `ingredientMasterService.createIngredient()` uses to compute
 * `normalizedName`, so a template is only ever skipped when it would truly
 * collide with an existing (or earlier-in-template) ingredient.
 *
 * Creation goes strictly through `createIngredient()` — one Firestore write
 * per ingredient, sequential, never a direct batch write — so every imported
 * ingredient passes the exact same security-rule validation and gets the
 * exact same audit fields (`createdBy`/`updatedBy`/timestamps) as a manually
 * entered one.
 */

import type { Firestore } from 'firebase/firestore';
import { normalizeIngredientName } from '@/utils/normalizeIngredientName';
import { createIngredient } from './ingredientMasterService';
import type { IngredientMaster } from './types';
import type { IngredientSeedTemplate } from '@/constants/ingredientSeedTemplates';

export interface SeedImportPlan {
  /** Templates to create, in template order. */
  toCreate: IngredientSeedTemplate[];
  /** Templates skipped because a name-normalized match already exists (either
   * in the current ingredient list, or earlier in the template list itself). */
  skippedExisting: { template: IngredientSeedTemplate; existingName: string }[];
}

/**
 * Pure planning function — no Firestore access.
 *
 * Determinism: iterates `templates` in array order. A template is skipped if
 * its normalized name matches either an existing ingredient's normalized name
 * (or a normalized form of its raw `name`, defensively, in case
 * `normalizedName` is missing on an older doc) or a template already placed
 * into `toCreate` earlier in this same call.
 */
export function planSeedImport(
  existing: IngredientMaster[],
  templates: IngredientSeedTemplate[],
): SeedImportPlan {
  const claimedBy = new Map<string, string>(); // normalizedName -> display name that claims it

  for (const ing of existing) {
    const norm = ing.normalizedName || normalizeIngredientName(ing.name);
    if (!claimedBy.has(norm)) {
      claimedBy.set(norm, ing.name);
    }
  }

  const toCreate: IngredientSeedTemplate[] = [];
  const skippedExisting: SeedImportPlan['skippedExisting'] = [];

  for (const template of templates) {
    const norm = normalizeIngredientName(template.name);
    const existingName = claimedBy.get(norm);
    if (existingName) {
      skippedExisting.push({ template, existingName });
    } else {
      toCreate.push(template);
      claimedBy.set(norm, template.name);
    }
  }

  return { toCreate, skippedExisting };
}

export interface SeedImportResult {
  createdCount: number;
  skippedCount: number;
  failed: { name: string; error: string }[];
}

/**
 * Executes a previously computed plan: creates `plan.toCreate` sequentially
 * (one `createIngredient()` call at a time), collecting per-item failures
 * without aborting the whole run. Calls `onProgress(done, total)` after each
 * attempt (success or failure).
 */
export async function runSeedImport(
  db: Firestore,
  plan: SeedImportPlan,
  uid: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SeedImportResult> {
  const total = plan.toCreate.length;
  let createdCount = 0;
  const failed: { name: string; error: string }[] = [];

  for (let i = 0; i < plan.toCreate.length; i++) {
    const template = plan.toCreate[i];
    try {
      await createIngredient(
        db,
        {
          name: template.name,
          category: template.category,
          baseUnit: template.baseUnit,
          purchaseUnit: template.purchaseUnit,
          conversionFactorToBaseUnit: template.conversionFactorToBaseUnit,
          defaultPrice: template.defaultPrice,
          defaultPriceUnit: template.defaultPriceUnit,
          marketCropName: template.marketCropName ?? null,
        },
        uid,
      );
      createdCount++;
    } catch (err) {
      failed.push({
        name: template.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    onProgress?.(i + 1, total);
  }

  return {
    createdCount,
    skippedCount: plan.skippedExisting.length,
    failed,
  };
}
