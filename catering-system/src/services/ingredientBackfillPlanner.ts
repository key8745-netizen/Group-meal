/**
 * Feature 030/031 — pure planning logic for Master Data Bootstrap & Unit
 * Schema Backfill. No I/O, no Firestore access — given an ingredient doc and
 * the known-ingredient lookup table, decides what (if anything) is missing.
 *
 * Shared by:
 *   - scripts/backfillIngredientMasterFields.ts (Node dry-run/--execute script)
 *   - scripts/verifyMasterDataBackfillDryRun.ts (local fixture verification)
 *   - src/pages/MasterDataDryRunReportPage.tsx (Feature 031 authenticated
 *     in-app dry-run report — read-only, never writes)
 *
 * Safety properties (do not weaken without a fresh Gatekeeper authorization):
 *   - Merge-only: never overwrites a field that already holds a valid value.
 *   - Unknown ingredients (no entry in KNOWN_INGREDIENT_FIELDS) are never
 *     guessed at — they are reported and skipped.
 */

import { INITIAL_INGREDIENTS } from '../constants/initialIngredients';
import { normalizeIngredientName } from '../utils/normalizeIngredientName';

/** id-keyed lookup built from the known seed source, used to fill in missing fields safely. */
export const KNOWN_INGREDIENT_FIELDS = new Map(
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

export const VALID_BASE_UNITS: ReadonlySet<string> = new Set(['g', 'ml', 'pcs']);

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
