/**
 * recipeDraftService — Feature 042: 配方草稿自動建立
 *
 * Generates rough-but-editable `recipes` drafts from imported monthly-menu
 * dish names (`menuImportBatches/{batchId}/items[].rawDishName`), so the
 * owner doesn't have to type recipes by hand after Feature 023 (menu import)
 * + Feature 041 (ingredient seed import).
 *
 * Matching pipeline, in priority order:
 *   1. Curated templates (`@/constants/recipeSeedTemplates.ts`) — exact match
 *      against a template's `dishName` or one of its `aliases`.
 *   2. Name-based ingredient inference — scans the dish name for ingredient
 *      mentions (ingredient master names + `DISH_NAME_INGREDIENT_ALIASES`
 *      keys), longest-keyword-first so e.g. 洋蔥 consumes 蔥 and 紅蘿蔔 maps
 *      to 胡蘿蔔 rather than partially matching 蘿蔔/白蘿蔔.
 *   3. Unmatched — neither a template nor any ingredient keyword found.
 *
 * A template hit whose every BOM line fails to resolve against the current
 * ingredient master (e.g. an ingredient was deactivated/renamed) is demoted
 * to inference rather than silently producing an empty recipe.
 *
 * All planning is pure (no Firestore access) so it can be unit tested
 * directly; only `runRecipeDraftImport` and the two read helpers touch
 * Firestore. Recipe creation goes strictly through `recipeService.createRecipe()`
 * — one write per dish, sequential — so every created draft passes the same
 * security-rule validation as a manually entered recipe. This module never
 * writes to `menuImportBatches` (read-only wrt menu-import staging) and
 * never overwrites an existing recipe — dishes that already have a
 * same-named recipe are skipped.
 */

import type { Firestore } from 'firebase/firestore';
import { normalizeIngredientName } from '@/utils/normalizeIngredientName';
import {
  RECIPE_SEED_TEMPLATES,
  DISH_NAME_INGREDIENT_ALIASES,
  type RecipeSeedTemplate,
} from '@/constants/recipeSeedTemplates';
import { createRecipe, type RecipeInput } from './recipeService';
import { listBatches, listItems } from './menuImportService';
import type { IngredientMaster, Recipe } from './types';

// ─── Planning types ─────────────────────────────────────────────────────────

export type DraftSource = 'template' | 'inferred';

export interface RecipeDraftBomLine {
  ingredientId: string;
  ingredientName: string;
  grams: number;
  /**
   * The ingredient's base unit ('g' when absent). Quantities are always the
   * template/inferred gram figure, interpreted 1:1 in this unit — for
   * ml-based ingredients (e.g. 鮮奶) that means ml, per the repo-wide
   * 1 g ≈ 1 ml approximation.
   */
  baseUnit?: 'g' | 'ml' | 'pcs';
}

export interface RecipeDraftPlanItem {
  /** Original rawDishName, trimmed. */
  dishName: string;
  source: DraftSource;
  /** Set when `source === 'template'` (including alias hits). */
  matchedTemplateName?: string;
  bom: RecipeDraftBomLine[];
  /** e.g. dropped template lines whose ingredient is missing, or a demotion note. */
  notes: string[];
}

export interface RecipeDraftPlan {
  toCreate: RecipeDraftPlanItem[];
  skippedExisting: { dishName: string; existingRecipeName: string }[];
  /** No template hit AND no ingredient keyword found. */
  unmatched: string[];
}

// ─── Inference constants ────────────────────────────────────────────────────

/** Grams-per-serving fallback by ingredient category, for name-inferred BOM lines. */
const CATEGORY_GRAMS: Record<string, number> = {
  葉菜類: 100,
  根莖類: 80,
  瓜果類: 80,
  豆菜類: 60,
  辛香類: 5,
  菇蕈類: 30,
  水果類: 150,
  米麵乾貨: 100,
};
const DEFAULT_CATEGORY_GRAMS = 50;
// 便當基準（成人一餐＝1 主菜 + 4 副菜）：菜名含肉的多半是主菜，主肉抓 90g；
// 同一道菜的第二種肉（配角）維持 40g。
const FIRST_MEAT_GRAMS = 90;
const LATER_MEAT_GRAMS = 40;
const EGG_GRAMS = 50;
const TOFU_EGG_DEFAULT_GRAMS = 60;
const EGG_INGREDIENT_NAME = '雞蛋';
const MEAT_CATEGORY = '肉類';
const TOFU_EGG_CATEGORY = '蛋豆製品';

// ─── Internal helpers ───────────────────────────────────────────────────────

interface InferenceCandidate {
  keyword: string;
  ingredient: IngredientMaster;
}

/** normalized dish/ingredient name -> active IngredientMaster, first-wins. */
function buildIngredientLookup(ingredients: IngredientMaster[]): Map<string, IngredientMaster> {
  const lookup = new Map<string, IngredientMaster>();
  for (const ing of ingredients) {
    if (ing.isActive === false) continue;
    const norm = normalizeIngredientName(ing.name);
    if (!lookup.has(norm)) lookup.set(norm, ing);
  }
  return lookup;
}

/** normalized dishName/alias -> template, first-wins (dataset is guaranteed collision-free). */
function buildTemplateLookup(templates: RecipeSeedTemplate[]): Map<string, RecipeSeedTemplate> {
  const lookup = new Map<string, RecipeSeedTemplate>();
  for (const template of templates) {
    for (const key of [template.dishName, ...(template.aliases ?? [])]) {
      const norm = normalizeIngredientName(key);
      if (!lookup.has(norm)) lookup.set(norm, template);
    }
  }
  return lookup;
}

/**
 * Candidates for name-based inference: every active ingredient's own name,
 * plus every `DISH_NAME_INGREDIENT_ALIASES` key that resolves to an active
 * ingredient. Sorted longest-keyword-first (stable) so matching consumes the
 * longest applicable span at each position.
 */
function buildInferenceCandidates(ingredientLookup: Map<string, IngredientMaster>): InferenceCandidate[] {
  const candidates: InferenceCandidate[] = [];
  const seenKeywords = new Set<string>();

  for (const ing of ingredientLookup.values()) {
    if (seenKeywords.has(ing.name)) continue;
    candidates.push({ keyword: ing.name, ingredient: ing });
    seenKeywords.add(ing.name);
  }

  for (const [key, masterName] of Object.entries(DISH_NAME_INGREDIENT_ALIASES)) {
    if (seenKeywords.has(key)) continue;
    const ing = ingredientLookup.get(normalizeIngredientName(masterName));
    if (!ing) continue;
    candidates.push({ keyword: key, ingredient: ing });
    seenKeywords.add(key);
  }

  candidates.sort((a, b) => b.keyword.length - a.keyword.length);
  return candidates;
}

function gramsForIngredient(ingredient: IngredientMaster, meatCountSoFar: number): number {
  if (ingredient.category === MEAT_CATEGORY) {
    return meatCountSoFar === 0 ? FIRST_MEAT_GRAMS : LATER_MEAT_GRAMS;
  }
  if (ingredient.category === TOFU_EGG_CATEGORY) {
    return ingredient.name === EGG_INGREDIENT_NAME ? EGG_GRAMS : TOFU_EGG_DEFAULT_GRAMS;
  }
  return CATEGORY_GRAMS[ingredient.category] ?? DEFAULT_CATEGORY_GRAMS;
}

/**
 * Scans `dishName` left-to-right; at each position tries candidates
 * longest-first and, on a match, consumes the matched span before resuming
 * (so a shorter keyword can never re-match inside an already-consumed span).
 * Returns matched ingredients deduped, in order of first appearance, with
 * grams assigned per category (meat count tracked within this single dish).
 */
function inferBom(dishName: string, candidates: InferenceCandidate[]): RecipeDraftBomLine[] {
  const matched: IngredientMaster[] = [];
  const matchedIds = new Set<string>();

  let i = 0;
  while (i < dishName.length) {
    const hit = candidates.find((c) => dishName.startsWith(c.keyword, i));
    if (hit) {
      if (!matchedIds.has(hit.ingredient.id)) {
        matchedIds.add(hit.ingredient.id);
        matched.push(hit.ingredient);
      }
      i += hit.keyword.length;
    } else {
      i += 1;
    }
  }

  let meatCount = 0;
  return matched.map((ing) => {
    const grams = gramsForIngredient(ing, meatCount);
    if (ing.category === MEAT_CATEGORY) meatCount++;
    return { ingredientId: ing.id, ingredientName: ing.name, grams, baseUnit: ing.baseUnit };
  });
}

/** Resolves a template's BOM against the ingredient master; drops unresolvable lines with a note. */
function resolveTemplateBom(
  template: RecipeSeedTemplate,
  ingredientLookup: Map<string, IngredientMaster>,
): { bom: RecipeDraftBomLine[]; notes: string[] } {
  const bom: RecipeDraftBomLine[] = [];
  const notes: string[] = [];
  for (const line of template.bom) {
    const ing = ingredientLookup.get(normalizeIngredientName(line.ingredientName));
    if (!ing) {
      notes.push(`找不到食材「${line.ingredientName}」，已略過`);
      continue;
    }
    bom.push({ ingredientId: ing.id, ingredientName: ing.name, grams: line.gramsPerServing, baseUnit: ing.baseUnit });
  }
  return { bom, notes };
}

// ─── Public planning API ────────────────────────────────────────────────────

/**
 * Pure planning function — no Firestore access.
 *
 * 1. Normalizes/dedupes `dishNames` (trim, drop empty, dedupe by normalized
 *    form keeping the first original spelling). Dishes whose normalized name
 *    already matches an existing recipe are skipped.
 * 2. Template match (exact dishName or alias) — BOM lines resolved against
 *    `ingredients`; unresolvable lines are dropped with a note. If every
 *    line drops, the dish is demoted to inference.
 * 3. Inference — keyword scan over ingredient names + alias keys.
 * 4. Deterministic order: template hits first, then inferred, each in
 *    input order.
 */
export function planRecipeDrafts(
  dishNames: string[],
  ingredients: IngredientMaster[],
  existingRecipes: Recipe[],
): RecipeDraftPlan {
  const ingredientLookup = buildIngredientLookup(ingredients);
  const templateLookup = buildTemplateLookup(RECIPE_SEED_TEMPLATES);
  const candidates = buildInferenceCandidates(ingredientLookup);

  const existingNameByNorm = new Map<string, string>();
  for (const recipe of existingRecipes) {
    const norm = normalizeIngredientName(recipe.name);
    if (!existingNameByNorm.has(norm)) existingNameByNorm.set(norm, recipe.name);
  }

  const seenDish = new Set<string>();
  // Bucketed by final `source` (not by pipeline path — a demoted template hit
  // ends up in `inferredItems`), each preserving input order; concatenated at
  // the end so template hits sort before inferred ones deterministically.
  const templateItems: RecipeDraftPlanItem[] = [];
  const inferredItems: RecipeDraftPlanItem[] = [];
  const skippedExisting: RecipeDraftPlan['skippedExisting'] = [];
  const unmatched: string[] = [];

  for (const raw of dishNames) {
    const dishName = raw.trim();
    if (!dishName) continue;
    const norm = normalizeIngredientName(dishName);
    if (seenDish.has(norm)) continue;
    seenDish.add(norm);

    const existingRecipeName = existingNameByNorm.get(norm);
    if (existingRecipeName) {
      skippedExisting.push({ dishName, existingRecipeName });
      continue;
    }

    const template = templateLookup.get(norm);
    if (template) {
      const { bom, notes } = resolveTemplateBom(template, ingredientLookup);
      if (bom.length > 0) {
        templateItems.push({ dishName, source: 'template', matchedTemplateName: template.dishName, bom, notes });
        continue;
      }
      const inferred = inferBom(dishName, candidates);
      if (inferred.length > 0) {
        inferredItems.push({
          dishName,
          source: 'inferred',
          bom: inferred,
          notes: ['範本食材皆無法對應，已改用菜名推定'],
        });
      } else {
        unmatched.push(dishName);
      }
      continue;
    }

    const inferred = inferBom(dishName, candidates);
    if (inferred.length > 0) {
      inferredItems.push({ dishName, source: 'inferred', bom: inferred, notes: [] });
    } else {
      unmatched.push(dishName);
    }
  }

  return { toCreate: [...templateItems, ...inferredItems], skippedExisting, unmatched };
}

// ─── Import execution ───────────────────────────────────────────────────────

export interface RecipeDraftImportResult {
  createdCount: number;
  skippedCount: number;
  unmatchedCount: number;
  failed: { dishName: string; error: string }[];
}

/**
 * Executes a previously computed plan: creates `plan.toCreate` sequentially
 * (one `createRecipe()` call at a time), collecting per-item failures
 * without aborting the whole run. Calls `onProgress(done, total)` after each
 * attempt (success or failure).
 */
export async function runRecipeDraftImport(
  db: Firestore,
  plan: RecipeDraftPlan,
  uid: string,
  onProgress?: (done: number, total: number) => void,
): Promise<RecipeDraftImportResult> {
  const total = plan.toCreate.length;
  let createdCount = 0;
  const failed: RecipeDraftImportResult['failed'] = [];

  for (let i = 0; i < plan.toCreate.length; i++) {
    const item = plan.toCreate[i];
    try {
      const input: RecipeInput = {
        name: item.dishName,
        isActive: true,
        notes: `自動產生配方草稿（${item.source === 'template' ? '範本' : '菜名推定'}），請人工確認食材與份量`,
        recipeIngredients: item.bom.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: line.grams,
          unit: line.baseUnit ?? 'g',
        })),
      };
      await createRecipe(db, input, uid);
      createdCount++;
    } catch (err) {
      failed.push({ dishName: item.dishName, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(i + 1, total);
  }

  return {
    createdCount,
    skippedCount: plan.skippedExisting.length,
    unmatchedCount: plan.unmatched.length,
    failed,
  };
}

// ─── Read helpers (menu-import staging, read-only) ─────────────────────────

export interface ImportBatchLite {
  id: string;
  label: string;
}

/**
 * Lightweight batch list for a picker UI. Built on top of
 * `menuImportService.listBatches()` — no direct Firestore reads here, and no
 * writes anywhere in this module.
 */
export async function listImportBatchesLite(db: Firestore): Promise<ImportBatchLite[]> {
  const batches = await listBatches(db);
  return batches.map((b) => {
    const parts = [b.yearMonth, b.organizationName, b.mealProgram].filter((p): p is string => !!p);
    const base = parts.join(' ') || b.sourceFileName || b.id;
    return { id: b.id, label: `${base}（${b.itemCount} 項菜色）` };
  });
}

/** Distinct, trimmed `rawDishName`s for a batch's items, in item order. */
export async function listBatchDishNames(db: Firestore, batchId: string): Promise<string[]> {
  const items = await listItems(db, batchId);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of items) {
    const name = item.rawDishName?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
