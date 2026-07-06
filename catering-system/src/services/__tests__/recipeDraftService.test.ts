/**
 * recipeDraftService.test.ts
 *
 * Validation tests for planRecipeDrafts() plus sanity checks on the real
 * RECIPE_SEED_TEMPLATES / DISH_NAME_INGREDIENT_ALIASES dataset against
 * INGREDIENT_SEED_TEMPLATES (Feature 041).
 * Run with: npx tsx src/services/__tests__/recipeDraftService.test.ts
 */

import { planRecipeDrafts } from '../recipeDraftService';
import { normalizeIngredientName } from '../../utils/normalizeIngredientName';
import {
  RECIPE_SEED_TEMPLATES,
  DISH_NAME_INGREDIENT_ALIASES,
} from '../../constants/recipeSeedTemplates';
import { INGREDIENT_SEED_TEMPLATES } from '../../constants/ingredientSeedTemplates';
import type { IngredientMaster, Recipe } from '../types';

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

// ─── Fixtures ────────────────────────────────────────────────────────────

let nextId = 1;
function makeIngredient(name: string, category: string, overrides: Partial<IngredientMaster> = {}): IngredientMaster {
  return {
    id: `ing_${nextId++}_${name}`,
    name,
    normalizedName: normalizeIngredientName(name),
    category,
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 10,
    defaultPriceUnit: 'kg',
    isActive: true,
    ...overrides,
  };
}

/** Full ingredient master built from the real Feature 041 seed dataset (id = name). */
function makeFullIngredientMaster(): IngredientMaster[] {
  return INGREDIENT_SEED_TEMPLATES.map((t) =>
    makeIngredient(t.name, t.category, { id: t.name }),
  );
}

function makeRecipe(name: string): Recipe {
  return {
    id: `recipe_${name}`,
    name,
    recipeIngredients: [],
    isActive: true,
    createdBy: 'u',
    updatedBy: 'u',
  } as Recipe;
}

// ─── planRecipeDrafts: template matching ──────────────────────────────────

console.log('\n── recipeDraftService: planRecipeDrafts — template matching ──────────');

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['番茄炒蛋'], ingredients, []);
  check('exact template match: 1 item', plan.toCreate.length, 1);
  check('exact template match: source', plan.toCreate[0].source, 'template');
  check('exact template match: matchedTemplateName', plan.toCreate[0].matchedTemplateName, '番茄炒蛋');
  check('exact template match: bom', plan.toCreate[0].bom, [
    { ingredientId: '大番茄', ingredientName: '大番茄', grams: 60 },
    { ingredientId: '雞蛋', ingredientName: '雞蛋', grams: 50 },
    { ingredientId: '青蔥', ingredientName: '青蔥', grams: 3 },
  ]);
  check('exact template match: no notes', plan.toCreate[0].notes, []);
}

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['蕃茄炒蛋'], ingredients, []);
  check('alias template match: 1 item', plan.toCreate.length, 1);
  check('alias template match: source', plan.toCreate[0].source, 'template');
  check('alias template match: resolves to canonical dishName', plan.toCreate[0].matchedTemplateName, '番茄炒蛋');
  check('alias template match: dishName kept as input spelling', plan.toCreate[0].dishName, '蕃茄炒蛋');
}

// ─── ingredient resolution + dropped-line note ────────────────────────────

console.log('\n── recipeDraftService: dropped template line (missing ingredient) ────');

{
  // 三色蛋 = 雞蛋 60 + 胡蘿蔔 15 + 毛豆 15 — omit 毛豆 from the master.
  const ingredients = makeFullIngredientMaster().filter((i) => i.name !== '毛豆');
  const plan = planRecipeDrafts(['三色蛋'], ingredients, []);
  check('dropped line: still a template hit (not all lines dropped)', plan.toCreate[0].source, 'template');
  check('dropped line: bom keeps resolvable lines only', plan.toCreate[0].bom, [
    { ingredientId: '雞蛋', ingredientName: '雞蛋', grams: 60 },
    { ingredientId: '胡蘿蔔', ingredientName: '胡蘿蔔', grams: 15 },
  ]);
  check('dropped line: note explains the drop', plan.toCreate[0].notes, ['找不到食材「毛豆」，已略過']);
}

// ─── demote to inference when all template lines unresolvable ────────────

console.log('\n── recipeDraftService: demote to inference when all template lines drop ─');

{
  // 金針菇炒蛋 template = 金針菇 40 + 雞蛋 45. Omit both from master, but keep
  // 生香菇 so the dish name's lone "菇" keyword can still resolve via
  // DISH_NAME_INGREDIENT_ALIASES during the inference fallback.
  const ingredients = makeFullIngredientMaster().filter((i) => i.name !== '金針菇' && i.name !== '雞蛋');
  const plan = planRecipeDrafts(['金針菇炒蛋'], ingredients, []);
  check('demote: exactly 1 item created', plan.toCreate.length, 1);
  check('demote: source becomes inferred', plan.toCreate[0].source, 'inferred');
  check('demote: no matchedTemplateName', plan.toCreate[0].matchedTemplateName, undefined);
  check('demote: bom resolved via inference (菇 -> 生香菇)', plan.toCreate[0].bom, [
    { ingredientId: '生香菇', ingredientName: '生香菇', grams: 30 },
  ]);
  check('demote: note explains the demotion', plan.toCreate[0].notes, ['範本食材皆無法對應，已改用菜名推定']);
  check('demote: nothing left unmatched', plan.unmatched, []);
}

// ─── inference: longest-first consumption ─────────────────────────────────

console.log('\n── recipeDraftService: inference — longest-keyword-first consumption ──');

{
  // 紅蘿蔔炒蛋 is not a template. 紅蘿蔔 (alias, len 3) must consume before
  // 蘿蔔 (alias -> 白蘿蔔, len 2) can partially match, and before 蔥ambiguity.
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['紅蘿蔔炒蛋'], ingredients, []);
  check('longest-first: 1 item, inferred', plan.toCreate[0]?.source, 'inferred');
  check('longest-first: bom is 胡蘿蔔 + 雞蛋 only', plan.toCreate[0]?.bom, [
    { ingredientId: '胡蘿蔔', ingredientName: '胡蘿蔔', grams: 80 },
    { ingredientId: '雞蛋', ingredientName: '雞蛋', grams: 50 },
  ]);
  const names = (plan.toCreate[0]?.bom ?? []).map((b) => b.ingredientName);
  checkTrue('longest-first: no false-positive 白蘿蔔', !names.includes('白蘿蔔'));
  checkTrue('longest-first: no false-positive 青蔥', !names.includes('青蔥'));
}

// ─── inference: meat grams (first 70g, later 40g) ─────────────────────────

console.log('\n── recipeDraftService: inference — meat grams (first 70g / later 40g) ──');

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['雞胸肉炒豬絞肉'], ingredients, []);
  check('meat grams: bom order + grams', plan.toCreate[0]?.bom, [
    { ingredientId: '雞胸肉', ingredientName: '雞胸肉', grams: 70 },
    { ingredientId: '豬絞肉', ingredientName: '豬絞肉', grams: 40 },
  ]);
}

// ─── inference: 雞蛋 special-case 50g ──────────────────────────────────────

console.log('\n── recipeDraftService: inference — 雞蛋 special-case (50g not 60g) ────');

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['滑蛋牛肉燴飯什錦'], ingredients, []);
  const eggLine = plan.toCreate[0]?.bom.find((b) => b.ingredientName === '雞蛋');
  checkTrue('egg special-case: 雞蛋 matched', !!eggLine);
  check('egg special-case: grams is 50 (not the 蛋豆製品 default 60)', eggLine?.grams, 50);
}

// ─── dedupe of repeated dish names ─────────────────────────────────────────

console.log('\n── recipeDraftService: dedupe repeated dish names ─────────────────────');

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['白飯', '白飯', ' 白飯 '], ingredients, []);
  check('dedupe: only 1 item created', plan.toCreate.length, 1);
  check('dedupe: keeps first original spelling', plan.toCreate[0].dishName, '白飯');
}

// ─── skip existing recipes ─────────────────────────────────────────────────

console.log('\n── recipeDraftService: skip dishes with an existing same-named recipe ──');

{
  const ingredients = makeFullIngredientMaster();
  const existing = [makeRecipe('白飯')];
  const plan = planRecipeDrafts(['白飯', '炒高麗菜'], ingredients, existing);
  check('skip existing: skippedExisting has 白飯', plan.skippedExisting, [
    { dishName: '白飯', existingRecipeName: '白飯' },
  ]);
  check('skip existing: toCreate has only 炒高麗菜', plan.toCreate.map((i) => i.dishName), ['炒高麗菜']);
}

// ─── unmatched when nothing found ──────────────────────────────────────────

console.log('\n── recipeDraftService: unmatched when no template and no keyword ──────');

{
  const ingredients = makeFullIngredientMaster();
  const plan = planRecipeDrafts(['特製神秘拼盤組合'], ingredients, []);
  check('unmatched: no items created', plan.toCreate.length, 0);
  check('unmatched: dish listed as unmatched', plan.unmatched, ['特製神秘拼盤組合']);
}

// ─── deterministic order: template hits before inferred, each in input order ──

console.log('\n── recipeDraftService: deterministic order (template first, then inferred) ──');

{
  const ingredients = makeFullIngredientMaster();
  // 紅蘿蔔炒蛋 (inferred), 白飯 (template), 雞胸肉炒豬絞肉 (inferred) — input order
  // interleaves inferred/template; output must group template first.
  const plan = planRecipeDrafts(['紅蘿蔔炒蛋', '白飯', '雞胸肉炒豬絞肉'], ingredients, []);
  check('order: template item(s) first', plan.toCreate.map((i) => i.dishName), ['白飯', '紅蘿蔔炒蛋', '雞胸肉炒豬絞肉']);
  check('order: sources grouped', plan.toCreate.map((i) => i.source), ['template', 'inferred', 'inferred']);
}

// ─── dataset sanity: RECIPE_SEED_TEMPLATES vs INGREDIENT_SEED_TEMPLATES ────

console.log('\n── recipeDraftService: RECIPE_SEED_TEMPLATES dataset sanity ───────────');

{
  const masterNames = new Set(INGREDIENT_SEED_TEMPLATES.map((t) => t.name));

  const missingBomIngredients: string[] = [];
  for (const template of RECIPE_SEED_TEMPLATES) {
    for (const line of template.bom) {
      if (!masterNames.has(line.ingredientName)) {
        missingBomIngredients.push(`${template.dishName} -> ${line.ingredientName}`);
      }
    }
  }
  check('every template bom ingredientName exists in INGREDIENT_SEED_TEMPLATES', missingBomIngredients, []);

  const missingAliasTargets: string[] = [];
  for (const [key, masterName] of Object.entries(DISH_NAME_INGREDIENT_ALIASES)) {
    if (!masterNames.has(masterName)) missingAliasTargets.push(`${key} -> ${masterName}`);
  }
  check('every DISH_NAME_INGREDIENT_ALIASES value exists in INGREDIENT_SEED_TEMPLATES', missingAliasTargets, []);

  const badGrams: string[] = [];
  for (const template of RECIPE_SEED_TEMPLATES) {
    for (const line of template.bom) {
      if (!(line.gramsPerServing > 0)) badGrams.push(`${template.dishName} -> ${line.ingredientName}`);
    }
  }
  check('every template bom line has positive grams', badGrams, []);

  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const template of RECIPE_SEED_TEMPLATES) {
    for (const key of [template.dishName, ...(template.aliases ?? [])]) {
      const norm = normalizeIngredientName(key);
      if (seen.has(norm)) dupes.push(`${key} (as ${template.dishName}) vs ${seen.get(norm)}`);
      else seen.set(norm, template.dishName);
    }
  }
  check('no duplicate normalized dishName/alias collisions across templates', dupes, []);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — recipeDraftService verified');
