/**
 * flavorInventoryCrossRef — Feature 076: 把「風味搭配建議」交叉比對庫存/保鮮/成本（純函式）。
 *
 * recipeFlavorAdvisor 產出的搭配建議只看「風味合不合」；本模組再疊上三個現實維度：
 *   1) 庫存：這個建議食材現在手上有沒有、有多少（省得再採購）。
 *   2) 保鮮：手上這批的最差新鮮度狀態 —— 若 CRITICAL/USE_FIRST，代表「趕快用掉」。
 *   3) 成本：每公斤估價，做為划算與否的參考。
 *
 * 再依「先清快過期的、其次用現有庫存、最後才買」重新排序，並保留風味共識度做次要排序。
 * 全部純函式、僅 type-import，可單測。輸出皆為參考，不改任何資料。
 */

import type { FreshnessState } from '@/services/types';
import type { PairingSuggestion } from '@/services/recipeFlavorAdvisor';

/** 供比對的最小食材主檔欄位。 */
export interface CrossRefIngredient {
  id: string;
  name: string;
  nameEn?: string;
}

export interface CrossRefContext {
  ingredients: CrossRefIngredient[];
  /** ingredientId → 現有庫存（kg）。 */
  stockByIngredientId: Map<string, number>;
  /** ingredientId → 該食材所有批次中最差的新鮮度狀態。 */
  freshnessByIngredientId: Map<string, FreshnessState>;
  /** ingredientId → 每公斤估價（選填）。 */
  costPerKgByIngredientId?: Map<string, number>;
}

/** 交叉比對後的分級標籤，供 UI 決定強調樣式與文案。 */
export type CrossRefTag = 'CLEAR_STOCK' | 'IN_STOCK' | 'BUY';

export interface EnrichedSuggestion extends PairingSuggestion {
  /** 對應到的食材主檔 id（無對應為 undefined）。 */
  ingredientId?: string;
  /** 現有庫存 kg（有對應且 > 0 才有值）。 */
  inStockKg?: number;
  /** 手上批次最差新鮮度（有對應且有批次資料才有值）。 */
  freshness?: FreshnessState;
  /** 每公斤估價（有對應且有價才有值）。 */
  costPerKg?: number;
  tag: CrossRefTag;
}

/**
 * 把建議食材名對應到食材主檔。優先「完全同名」，其次「主檔名含建議名」，
 * 再其次「建議名含主檔名」；同級取名稱較短者（較精準）。無對應回 null。
 */
function matchIngredient(
  suggestionName: string,
  ingredients: CrossRefIngredient[],
): CrossRefIngredient | null {
  const q = suggestionName.trim();
  if (q.length < 1) return null;
  let best: CrossRefIngredient | null = null;
  let bestScore = 0;
  for (const ing of ingredients) {
    const name = ing.name.trim();
    const en = ing.nameEn?.trim().toLowerCase();
    let score = 0;
    if (name === q) score = 1000;
    else if (name.length >= 2 && name.includes(q)) score = 300 - name.length;
    else if (q.length >= 2 && q.includes(name)) score = 200 - (q.length - name.length);
    else if (en && en.length >= 2 && (en === q.toLowerCase() || en.includes(q.toLowerCase()))) score = 100;
    if (score > bestScore) {
      bestScore = score;
      best = ing;
    }
  }
  return best;
}

/** 是否「趕快用掉」等級。 */
function isUseFirst(state: FreshnessState | undefined): boolean {
  return state === 'CRITICAL' || state === 'USE_FIRST';
}

/**
 * 排序權重：清庫存（在庫且快過期）> 有庫存 > 只能買；同級再看風味共識度。
 * 分數僅用於排序，不對外暴露。
 */
function priorityScore(e: EnrichedSuggestion): number {
  let s = 0;
  if (e.tag === 'CLEAR_STOCK') s += 400;
  else if (e.tag === 'IN_STOCK') s += 200;
  // 風味共識度做為次要（每多一個共同推薦 +10，最多不壓過分級）
  s += Math.min(e.count, 9) * 10;
  // CRITICAL 比 USE_FIRST 更急
  if (e.freshness === 'CRITICAL') s += 5;
  return s;
}

/**
 * 交叉比對搭配建議與庫存/保鮮/成本，回傳加值後、且重新排序的建議清單。
 * 原本的風味共識排序保留為次要鍵，確保無庫存資料時行為與原本一致。
 */
export function crossReferenceSuggestions(
  suggestions: PairingSuggestion[],
  ctx: CrossRefContext,
): EnrichedSuggestion[] {
  const enriched: EnrichedSuggestion[] = (suggestions ?? []).map((sug) => {
    const ing = matchIngredient(sug.name, ctx.ingredients);
    if (!ing) return { ...sug, tag: 'BUY' as CrossRefTag };

    const stock = ctx.stockByIngredientId.get(ing.id) ?? 0;
    const freshness = ctx.freshnessByIngredientId.get(ing.id);
    const costPerKg = ctx.costPerKgByIngredientId?.get(ing.id);
    const inStock = stock > 0;

    const tag: CrossRefTag = inStock
      ? (isUseFirst(freshness) ? 'CLEAR_STOCK' : 'IN_STOCK')
      : 'BUY';

    return {
      ...sug,
      ingredientId: ing.id,
      inStockKg: inStock ? stock : undefined,
      freshness: inStock ? freshness : undefined,
      costPerKg: costPerKg != null && costPerKg > 0 ? costPerKg : undefined,
      tag,
    };
  });

  return enriched.sort(
    (a, b) =>
      priorityScore(b) - priorityScore(a) ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'zh-Hant'),
  );
}
