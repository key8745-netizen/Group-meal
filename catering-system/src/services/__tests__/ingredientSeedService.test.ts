/**
 * ingredientSeedService.test.ts
 *
 * Validation tests for planSeedImport() plus sanity checks on the real
 * INGREDIENT_SEED_TEMPLATES dataset.
 * Run with: npx tsx src/services/__tests__/ingredientSeedService.test.ts
 */

import { planSeedImport } from '../ingredientSeedService';
import { normalizeIngredientName } from '../../utils/normalizeIngredientName';
import { INGREDIENT_SEED_TEMPLATES, type IngredientSeedTemplate } from '../../constants/ingredientSeedTemplates';
import type { IngredientMaster } from '../types';

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

function makeTemplate(name: string, overrides: Partial<IngredientSeedTemplate> = {}): IngredientSeedTemplate {
  return {
    name,
    category: '測試類',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 10,
    defaultPriceUnit: 'kg',
    ...overrides,
  };
}

function makeExisting(name: string, normalizedName?: string): IngredientMaster {
  return {
    id: `id_${name}`,
    name,
    normalizedName: normalizedName ?? normalizeIngredientName(name),
    category: '測試類',
    baseUnit: 'g',
    purchaseUnit: 'kg',
    conversionFactorToBaseUnit: 1000,
    defaultPrice: 10,
    defaultPriceUnit: 'kg',
    isActive: true,
  } as IngredientMaster;
}

console.log('\n── ingredientSeedService: planSeedImport ──────────────────────');

// ── empty existing → all created ──────────────────────────────────────────
{
  const templates = [makeTemplate('高麗菜'), makeTemplate('地瓜葉')];
  const plan = planSeedImport([], templates);
  check('empty existing: all created', plan.toCreate.length, 2);
  check('empty existing: none skipped', plan.skippedExisting.length, 0);
  check('empty existing: order preserved', plan.toCreate.map((t) => t.name), ['高麗菜', '地瓜葉']);
}

// ── exact-name duplicate skipped ───────────────────────────────────────────
{
  const templates = [makeTemplate('高麗菜'), makeTemplate('地瓜葉')];
  const existing = [makeExisting('高麗菜')];
  const plan = planSeedImport(existing, templates);
  check('exact dup: toCreate only 地瓜葉', plan.toCreate.map((t) => t.name), ['地瓜葉']);
  check('exact dup: skipped count', plan.skippedExisting.length, 1);
  check('exact dup: skipped existingName', plan.skippedExisting[0].existingName, '高麗菜');
}

// ── normalization-equivalent duplicate skipped (whitespace/case) ──────────
{
  // normalizeIngredientName trims, lowercases, collapses internal whitespace.
  const templates = [makeTemplate('Chicken Breast')];
  const existing = [makeExisting('  chicken   breast  ')];
  const plan = planSeedImport(existing, templates);
  check('normalized dup: skipped', plan.toCreate.length, 0);
  check('normalized dup: skippedExisting count', plan.skippedExisting.length, 1);
  check('normalized dup: existingName reported', plan.skippedExisting[0].existingName, '  chicken   breast  ');
}

// ── normalization fallback when existing.normalizedName missing ──────────
{
  const templates = [makeTemplate('  高麗菜 ')];
  const existingWithoutNorm = { ...makeExisting('高麗菜'), normalizedName: '' } as IngredientMaster;
  const plan = planSeedImport([existingWithoutNorm], templates);
  check('fallback normalization: skipped via raw name', plan.toCreate.length, 0);
}

// ── within-template dedupe ─────────────────────────────────────────────────
{
  const templates = [makeTemplate('青蔥'), makeTemplate(' 青蔥 '), makeTemplate('薑')];
  const plan = planSeedImport([], templates);
  check('within-template dedupe: toCreate', plan.toCreate.map((t) => t.name), ['青蔥', '薑']);
  check('within-template dedupe: skipped count', plan.skippedExisting.length, 1);
  check('within-template dedupe: existingName is first occurrence', plan.skippedExisting[0].existingName, '青蔥');
}

// ── order determinism: toCreate follows template order regardless of existing order ──
{
  const templates = [makeTemplate('A'), makeTemplate('B'), makeTemplate('C')];
  const existing = [makeExisting('C'), makeExisting('A')];
  const plan = planSeedImport(existing, templates);
  check('order determinism: toCreate', plan.toCreate.map((t) => t.name), ['B']);
}

console.log('\n── ingredientSeedService: INGREDIENT_SEED_TEMPLATES dataset sanity ─────');

// ── no duplicate normalized names within the real dataset ────────────────
{
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const t of INGREDIENT_SEED_TEMPLATES) {
    const norm = normalizeIngredientName(t.name);
    if (seen.has(norm)) dupes.push(`${t.name} vs ${seen.get(norm)}`);
    else seen.set(norm, t.name);
  }
  check('no duplicate normalized names', dupes, []);
}

// ── every entry has positive defaultPrice and conversionFactorToBaseUnit ──
{
  const badPrice = INGREDIENT_SEED_TEMPLATES.filter((t) => !(t.defaultPrice > 0)).map((t) => t.name);
  check('all entries have positive defaultPrice', badPrice, []);

  const badFactor = INGREDIENT_SEED_TEMPLATES.filter((t) => !(t.conversionFactorToBaseUnit > 0)).map((t) => t.name);
  check('all entries have positive conversionFactorToBaseUnit', badFactor, []);
}

// ── baseUnit is a valid IngredientBaseUnit for every entry ────────────────
// (most entries use 'g'; liquids like 鮮奶 deliberately use 'ml')
{
  const badUnit = INGREDIENT_SEED_TEMPLATES
    .filter((t) => t.baseUnit !== 'g' && t.baseUnit !== 'ml' && t.baseUnit !== 'pcs')
    .map((t) => t.name);
  check('all entries use a valid baseUnit (g/ml/pcs)', badUnit, []);
}

// ── marketCropName, when present, is a non-empty trimmed string ──────────
{
  const badCropName = INGREDIENT_SEED_TEMPLATES
    .filter((t) => t.marketCropName !== undefined)
    .filter((t) => t.marketCropName!.length === 0 || t.marketCropName !== t.marketCropName!.trim())
    .map((t) => t.name);
  check('marketCropName (when present) is non-empty and trimmed', badCropName, []);
}

// ── at least 40 entries carry a marketCropName ────────────────────────────
{
  const withCropName = INGREDIENT_SEED_TEMPLATES.filter((t) => !!t.marketCropName).length;
  checkTrue(`at least 40 entries have marketCropName (actual: ${withCropName})`, withCropName >= 40);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} validation(s) failed`);
else console.log('PASSED — ingredientSeedService verified');
