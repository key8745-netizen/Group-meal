/**
 * costAwareMenuSuggestionService — Feature 033: 性價比菜單建議與採購成本標註
 * (Cost/Inventory-Aware Menu Suggestions + Purchase Cost Annotation, Part A).
 *
 * Ranks active recipes by a simple "value score" that rewards a lower
 * estimated cost per serving and being cookable from current inventory up to
 * the target serving count. Prices are resolved per-ingredient via
 * `resolveIngredientPrice`, preferring the Feature 032 market price cache
 * (`marketPrices/{date}`) and falling back to each ingredient's
 * `defaultPrice`/`defaultPriceUnit`. Follows the `menuMixRecommendationService`
 * pattern: a pure `calculate...` function + create-only immutable Firestore
 * records + list.
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type {
  IngredientMaster,
  MarketPriceSnapshot,
  Recipe,
  CostAwareMenuSuggestion,
  CostAwareRecipeAssessmentItem,
} from './types';
import { pricePerKgFromDefault } from './marketPriceService';

const COLLECTION = 'costAwareMenuSuggestions';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type PriceSource = 'market' | 'default' | 'none';

export interface IngredientPriceResolution {
  /** Price per the ingredient's baseUnit (g / ml / pcs), rounded to 4dp. */
  pricePerBaseUnit: number | null;
  /** Price per kg, rounded to 2dp (null for pcs — not meaningfully denominated in kg). */
  pricePerKg: number | null;
  source: PriceSource;
  cropName?: string;
}

/**
 * Resolves a single ingredient's unit price, preferring the cached market
 * price (when `marketCropName` is linked and the snapshot has a priced
 * entry for it) and falling back to the ingredient's default price.
 *
 * - `baseUnit` 'g'/'ml': price is denominated per kg (market or default,
 *   `pricePerKgFromDefault`) then divided by 1000 for the per-base-unit
 *   figure. 'ml' assumes water-density (1g ≈ 1ml), same as Feature 032.
 * - `baseUnit` 'pcs': market/per-kg pricing is not applicable. Only usable
 *   when `defaultPriceUnit === purchaseUnit` and `conversionFactorToBaseUnit
 *   > 0`, giving `defaultPrice / conversionFactorToBaseUnit` (source
 *   'default'). Otherwise unresolvable (source 'none').
 */
export function resolveIngredientPrice(
  ing: IngredientMaster,
  snapshot: MarketPriceSnapshot | null,
): IngredientPriceResolution {
  if (ing.baseUnit === 'pcs') {
    if (
      ing.defaultPriceUnit === ing.purchaseUnit &&
      ing.conversionFactorToBaseUnit > 0
    ) {
      return {
        pricePerBaseUnit: round4(ing.defaultPrice / ing.conversionFactorToBaseUnit),
        pricePerKg: null,
        source: 'default',
      };
    }
    return { pricePerBaseUnit: null, pricePerKg: null, source: 'none' };
  }

  if (ing.marketCropName && ing.marketCropName.trim() && snapshot) {
    const entry = snapshot.entries.find((e) => e.cropName === ing.marketCropName);
    if (entry && entry.avgPrice != null) {
      const pricePerKg = round2(entry.avgPrice);
      return {
        pricePerBaseUnit: round4(pricePerKg / 1000),
        pricePerKg,
        source: 'market',
        cropName: ing.marketCropName,
      };
    }
  }

  const defaultPerKg = pricePerKgFromDefault(ing);
  if (defaultPerKg != null) {
    return { pricePerBaseUnit: round4(defaultPerKg / 1000), pricePerKg: defaultPerKg, source: 'default' };
  }

  return { pricePerBaseUnit: null, pricePerKg: null, source: 'none' };
}

// ─── Feature 053: 單配方成本速估（挑菜時即時顯示）───────────────────────────

export interface RecipeCostEstimate {
  /**
   * 每份食材成本（僅加總「有價」的行，2 位小數）；全部無價時為 null。
   * 與 `CostAwareRecipeAssessmentItem.estimatedCostPerServing`（任一行無價
   * 即 null 的嚴格版）不同——這是給 UI 即時顯示用的寬鬆版，搭配
   * `complete` 標示是否完整。
   */
  costPerServing: number | null;
  pricedLineCount: number;
  totalLineCount: number;
  /** true = 每一行都有價，估算完整。 */
  complete: boolean;
}

/** Pure 單配方每份成本速估——市價優先、基準價備援（同 resolveIngredientPrice）。 */
export function estimateRecipeCostPerServing(
  recipe: Recipe,
  ingredientById: Map<string, IngredientMaster>,
  snapshot: MarketPriceSnapshot | null,
): RecipeCostEstimate {
  const lines = recipe.recipeIngredients ?? [];
  let costTotal = 0;
  let pricedLineCount = 0;
  for (const line of lines) {
    const ing = ingredientById.get(line.ingredientId);
    const resolution = ing
      ? resolveIngredientPrice(ing, snapshot)
      : { pricePerBaseUnit: null };
    if (resolution.pricePerBaseUnit != null) {
      costTotal += line.baseQuantity * resolution.pricePerBaseUnit;
      pricedLineCount++;
    }
  }
  return {
    costPerServing: pricedLineCount > 0 ? round2(costTotal) : null,
    pricedLineCount,
    totalLineCount: lines.length,
    complete: lines.length > 0 && pricedLineCount === lines.length,
  };
}

// ─── Feature 064: 配方成本明細（逐食材貢獻，找出成本大戶）───────────────────

export interface RecipeCostBreakdownLine {
  ingredientId: string;
  name: string;
  /** 該食材每份成本（2 位小數）；無價為 null。 */
  costPerServing: number | null;
  /** 占「有價總成本」的百分比（1 位小數）；無價為 null。 */
  percent: number | null;
}

export interface RecipeCostBreakdown {
  /** 有價項依成本由高到低，無價項排在最後（保留原順序）。 */
  lines: RecipeCostBreakdownLine[];
  costPerServing: number | null;
  pricedLineCount: number;
  totalLineCount: number;
  complete: boolean;
}

/**
 * Pure 配方成本明細——逐食材算出每份成本與占比，方便找出「成本大戶」。
 * 接受食材行（{ ingredientId, baseQuantity }）以同時支援已存配方與編輯中即時
 * 試算。市價優先、基準價備援（同 resolveIngredientPrice）。
 */
export function breakdownRecipeCost(
  lines: { ingredientId: string; baseQuantity: number }[],
  ingredientById: Map<string, IngredientMaster>,
  snapshot: MarketPriceSnapshot | null,
): RecipeCostBreakdown {
  const priced: RecipeCostBreakdownLine[] = [];
  const unpriced: RecipeCostBreakdownLine[] = [];
  let costTotal = 0;

  for (const line of lines) {
    const ing = ingredientById.get(line.ingredientId);
    const name = ing?.name ?? line.ingredientId;
    const resolution = ing ? resolveIngredientPrice(ing, snapshot) : { pricePerBaseUnit: null };
    if (resolution.pricePerBaseUnit != null) {
      const cost = round2(line.baseQuantity * resolution.pricePerBaseUnit);
      costTotal += cost;
      priced.push({ ingredientId: line.ingredientId, name, costPerServing: cost, percent: null });
    } else {
      unpriced.push({ ingredientId: line.ingredientId, name, costPerServing: null, percent: null });
    }
  }

  priced.sort((a, b) => (b.costPerServing ?? 0) - (a.costPerServing ?? 0));
  const total = round2(costTotal);
  for (const l of priced) {
    l.percent = total > 0 && l.costPerServing != null
      ? Math.round((l.costPerServing / total) * 1000) / 10
      : null;
  }

  return {
    lines: [...priced, ...unpriced],
    costPerServing: priced.length > 0 ? total : null,
    pricedLineCount: priced.length,
    totalLineCount: lines.length,
    complete: lines.length > 0 && priced.length === lines.length,
  };
}

export interface CostAwareSuggestionInput {
  targetServingCount: number;
}

export type CostAwareMenuSuggestionResult = Omit<CostAwareMenuSuggestion, 'id' | 'createdAt' | 'createdBy'>;

/**
 * Pure, zero-Firestore. Assesses every recipe passed in (caller is
 * responsible for passing only active recipes).
 *
 * valueScore formula (kept simple & deterministic):
 *   feasibleServings = maxServingsFromStock == null ? 0 : min(maxServingsFromStock, targetServingCount)
 *   stockFactor       = targetServingCount > 0 ? feasibleServings / targetServingCount : 0
 *   valueScore        = estimatedCostPerServing > 0
 *                          ? round2((1 + stockFactor) / estimatedCostPerServing * 100)
 *                          : null
 * i.e. cheaper per serving scores higher, and being fully cookable from
 * current stock up to the target serving count doubles the score.
 */
export function calculateCostAwareMenuSuggestion(
  input: CostAwareSuggestionInput,
  recipes: Recipe[],
  ingredients: IngredientMaster[],
  inventoryByIngredientId: Record<string, number>,
  snapshot: MarketPriceSnapshot | null,
): CostAwareMenuSuggestionResult {
  const { targetServingCount } = input;
  if (
    !Number.isInteger(targetServingCount) ||
    targetServingCount < 1 ||
    targetServingCount > 10000
  ) {
    throw new Error('targetServingCount must be an integer between 1 and 10000');
  }

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const manualReviewNotes: string[] = [];
  if (!snapshot) manualReviewNotes.push('無市價快取，全部使用基準價');

  const items: CostAwareRecipeAssessmentItem[] = [];

  for (const recipe of recipes) {
    if (recipe.recipeIngredients.length === 0) {
      manualReviewNotes.push(`配方「${recipe.name}」無食材項目，已略過評估`);
      continue;
    }

    let costTotal = 0;
    let anyUnpriced = false;
    let marketCount = 0;
    let defaultCount = 0;
    let unpricedCount = 0;
    const unpricedNames: string[] = [];
    let stockLineCount = 0;
    let minServings: number | null = null;
    let limitingName: string | undefined;
    const mlAssumptionNames = new Set<string>();
    const pcsNames = new Set<string>();

    for (const line of recipe.recipeIngredients) {
      const ing = ingredientMap.get(line.ingredientId);
      const resolution: IngredientPriceResolution = ing
        ? resolveIngredientPrice(ing, snapshot)
        : { pricePerBaseUnit: null, pricePerKg: null, source: 'none' };

      if (resolution.source === 'market') marketCount++;
      else if (resolution.source === 'default') defaultCount++;
      else unpricedCount++;

      if (resolution.pricePerBaseUnit != null) {
        costTotal += line.baseQuantity * resolution.pricePerBaseUnit;
      } else {
        anyUnpriced = true;
        if (unpricedNames.length < 5) unpricedNames.push(line.ingredientNameSnapshot);
      }

      // Stock mapping — availableBaseQty for 'g'/'ml' from inventory (kg -> base unit, x1000).
      // 'pcs' has no reliable stock mapping and is excluded.
      let availableBaseQty: number | null = null;
      if (line.baseUnit === 'g' || line.baseUnit === 'ml') {
        const stockKg = inventoryByIngredientId[line.ingredientId];
        if (typeof stockKg === 'number') {
          availableBaseQty = stockKg * 1000;
          if (line.baseUnit === 'ml') mlAssumptionNames.add(line.ingredientNameSnapshot);
        }
      } else if (line.baseUnit === 'pcs') {
        pcsNames.add(line.ingredientNameSnapshot);
      }

      if (availableBaseQty != null && line.baseQuantity > 0) {
        stockLineCount++;
        const servings = Math.floor(availableBaseQty / line.baseQuantity);
        if (minServings === null || servings < minServings) {
          minServings = servings;
          limitingName = line.ingredientNameSnapshot;
        }
      }
    }

    const totalLines = recipe.recipeIngredients.length;
    const costCoverageRatio = round4((marketCount + defaultCount) / totalLines);
    const stockCoverageRatio = round4(stockLineCount / totalLines);
    const estimatedCostPerServing = anyUnpriced ? null : round2(costTotal);

    const feasibleServings = minServings == null ? 0 : Math.min(minServings, targetServingCount);
    const stockFactor = targetServingCount > 0 ? feasibleServings / targetServingCount : 0;
    const valueScore =
      estimatedCostPerServing != null && estimatedCostPerServing > 0
        ? round2(((1 + stockFactor) / estimatedCostPerServing) * 100)
        : null;

    const reasoningNotes: string[] = [];
    reasoningNotes.push(`價格來源：市價 ${marketCount} 項、基準價 ${defaultCount} 項、無價 ${unpricedCount} 項`);
    if (unpricedNames.length > 0) {
      reasoningNotes.push(`無法取得價格的食材：${unpricedNames.join('、')}`);
    }
    if (limitingName != null) {
      reasoningNotes.push(`庫存限制食材：${limitingName}（庫存可做 ${minServings} 份）`);
    } else {
      reasoningNotes.push('無任何食材有庫存資料，無法估算可製作份數');
    }
    if (mlAssumptionNames.size > 0) {
      reasoningNotes.push(`以下食材以 1g/mL 密度假設換算庫存：${Array.from(mlAssumptionNames).join('、')}`);
    }
    if (pcsNames.size > 0) {
      reasoningNotes.push(`個數（pcs）單位食材無可靠庫存換算，已排除於庫存估算：${Array.from(pcsNames).join('、')}`);
    }

    items.push({
      recipeId: recipe.id,
      recipeNameSnapshot: recipe.name,
      estimatedCostPerServing,
      costCoverageRatio,
      marketPricedIngredientCount: marketCount,
      defaultPricedIngredientCount: defaultCount,
      unpricedIngredientCount: unpricedCount,
      maxServingsFromStock: minServings,
      stockCoverageRatio,
      limitingIngredientNameSnapshot: limitingName,
      valueScore,
      reasoningNotes,
    });
  }

  items.sort((a, b) => {
    if (a.valueScore == null && b.valueScore == null) {
      return a.recipeNameSnapshot.localeCompare(b.recipeNameSnapshot);
    }
    if (a.valueScore == null) return 1;
    if (b.valueScore == null) return -1;
    return b.valueScore - a.valueScore;
  });

  manualReviewNotes.push('本建議僅供人工參考，不會自動建立菜單或採購');

  return {
    targetServingCount,
    priceSnapshotDate: snapshot ? snapshot.date : null,
    assessedRecipeCount: recipes.length,
    items,
    manualReviewNotes,
  };
}

export async function createCostAwareMenuSuggestion(
  db: Firestore,
  input: CostAwareSuggestionInput,
  recipes: Recipe[],
  ingredients: IngredientMaster[],
  inventoryByIngredientId: Record<string, number>,
  snapshot: MarketPriceSnapshot | null,
  uid: string,
): Promise<CostAwareMenuSuggestion> {
  const result = calculateCostAwareMenuSuggestion(input, recipes, ingredients, inventoryByIngredientId, snapshot);

  const docData = {
    ...result,
    createdAt: serverTimestamp(),
    createdBy: uid,
  };

  const ref = await addDoc(collection(db, COLLECTION), docData);

  return {
    id: ref.id,
    ...result,
    createdBy: uid,
  };
}

export async function listCostAwareMenuSuggestions(db: Firestore): Promise<CostAwareMenuSuggestion[]> {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CostAwareMenuSuggestion, 'id'>) }));
}
