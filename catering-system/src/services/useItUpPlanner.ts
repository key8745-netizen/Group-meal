/**
 * useItUpPlanner — Feature 077: 快到期食材 → 推薦「用得到它」的配方（純函式）。
 *
 * 保鮮系統目前會警示「熬不過下一個開膳日」的批次，但只告訴你「快壞了」，
 * 沒告訴你「那煮什麼能用掉它」。本模組把快到期食材反查配方：找出用得到這些
 * 食材的配方，依「一次能清掉幾種快到期食材」與「涉及的風險量」排序，讓廚房
 * 直接看到「今天煮這幾道，就能把快過期的清掉」。
 *
 * 純函式、僅 type-import，可單測。輸出皆為參考，不改任何資料。
 */

/** 快到期食材（通常由 weekendDecayAlerts 依 ingredientId 彙整而來）。 */
export interface ExpiringIngredient {
  ingredientId: string;
  ingredientName: string;
  atRiskKg: number;
}

/** 供反查的配方最小欄位。 */
export interface UseItUpRecipe {
  id: string;
  name: string;
  ingredientIds: string[];
}

export interface UseItUpSuggestion {
  recipeId: string;
  recipeName: string;
  /** 此配方用得到、且正在快到期的食材。 */
  matched: { ingredientId: string; ingredientName: string; atRiskKg: number }[];
  /** 能清掉幾種快到期食材。 */
  matchCount: number;
  /** 涉及的快到期總量（kg），做為次要排序。 */
  totalAtRiskKg: number;
}

/** 把多筆快到期批次依 ingredientId 彙整：加總風險量、保留名稱。 */
function aggregateExpiring(items: ExpiringIngredient[]): Map<string, ExpiringIngredient> {
  const map = new Map<string, ExpiringIngredient>();
  for (const it of items ?? []) {
    const id = (it.ingredientId ?? '').trim();
    if (!id) continue;
    const prev = map.get(id);
    if (prev) {
      prev.atRiskKg = Math.round((prev.atRiskKg + (it.atRiskKg || 0)) * 1000) / 1000;
    } else {
      map.set(id, {
        ingredientId: id,
        ingredientName: it.ingredientName ?? id,
        atRiskKg: Math.round((it.atRiskKg || 0) * 1000) / 1000,
      });
    }
  }
  return map;
}

/**
 * 反查用得到快到期食材的配方。
 * @param expiring        快到期食材清單（可含同食材多批，會自動彙整）。
 * @param recipes         候選配方（一般傳「啟用中」配方）。
 * @param maxSuggestions  回傳上限（預設 6）。
 */
export function suggestUseItUpRecipes(
  expiring: ExpiringIngredient[],
  recipes: UseItUpRecipe[],
  maxSuggestions = 6,
): UseItUpSuggestion[] {
  const byId = aggregateExpiring(expiring);
  if (byId.size === 0) return [];

  const out: UseItUpSuggestion[] = [];
  for (const recipe of recipes ?? []) {
    const seen = new Set<string>();
    const matched: UseItUpSuggestion['matched'] = [];
    for (const ingId of recipe.ingredientIds ?? []) {
      const hit = byId.get(ingId);
      if (hit && !seen.has(ingId)) {
        seen.add(ingId);
        matched.push({
          ingredientId: hit.ingredientId,
          ingredientName: hit.ingredientName,
          atRiskKg: hit.atRiskKg,
        });
      }
    }
    if (matched.length === 0) continue;
    const totalAtRiskKg = Math.round(matched.reduce((s, m) => s + m.atRiskKg, 0) * 1000) / 1000;
    out.push({
      recipeId: recipe.id,
      recipeName: recipe.name,
      matched,
      matchCount: matched.length,
      totalAtRiskKg,
    });
  }

  return out
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount ||
        b.totalAtRiskKg - a.totalAtRiskKg ||
        a.recipeName.localeCompare(b.recipeName, 'zh-Hant'),
    )
    .slice(0, Math.max(0, maxSuggestions));
}
