/**
 * balancedMenuPlanner — Feature 090: 一鍵產生均衡菜單（純函式）。
 *
 * 依「菜色類別配額」（如 1 主菜 + 1 主食 + 2 蔬菜 + 1 湯）從候選配方中各挑幾道，
 * 每類內以「惜食（清庫存）> 庫存可出 > 划算（成本低）」排序挑選。整合既有的
 * 分類（089）、清庫存（077）、成本（053）、庫存（033）訊號成一個決策。
 * 純函式、僅 type-import，可單測。所有訊號皆選填，缺哪個就退化不影響其餘。
 */

import type { DishCategory } from '@/services/types';

export interface BalancedMenuCandidate {
  recipeId: string;
  name: string;
  category?: DishCategory;
  /** 用到快到期食材 → 清庫存優先（惜食）。 */
  clearsExpiring?: boolean;
  /** 現有庫存足以出這道 → 省採購優先。 */
  stockFeasible?: boolean;
  /** 每份成本（越低越划算；null = 未知，排最後）。 */
  costPerServing?: number | null;
}

export interface BalancedMenuQuota {
  category: DishCategory;
  count: number;
}

/** 預設配額：一份便當常見組成。 */
export const DEFAULT_MENU_QUOTAS: BalancedMenuQuota[] = [
  { category: '主菜', count: 1 },
  { category: '主食', count: 1 },
  { category: '蔬菜', count: 2 },
  { category: '湯', count: 1 },
];

export interface BalancedMenuCategoryFill {
  category: DishCategory;
  want: number;
  got: number;
  recipeIds: string[];
}

export interface BalancedMenuResult {
  /** 挑選出的配方 id（依配額順序）。 */
  selectedRecipeIds: string[];
  byCategory: BalancedMenuCategoryFill[];
  /** 配額未填滿的類別（候選不足）。 */
  shortfalls: { category: DishCategory; want: number; got: number }[];
}

/** 類別內排序：惜食 > 庫存可出 > 成本低 > 名稱（穩定）。 */
function compareCandidates(a: BalancedMenuCandidate, b: BalancedMenuCandidate): number {
  const clr = Number(!!b.clearsExpiring) - Number(!!a.clearsExpiring);
  if (clr !== 0) return clr;
  const stk = Number(!!b.stockFeasible) - Number(!!a.stockFeasible);
  if (stk !== 0) return stk;
  const ca = a.costPerServing;
  const cb = b.costPerServing;
  if (ca != null && cb != null && ca !== cb) return ca - cb;
  if (ca == null && cb != null) return 1; // 未知成本排後
  if (ca != null && cb == null) return -1;
  return a.name.localeCompare(b.name, 'zh-Hant');
}

/**
 * 產生均衡菜單。
 * @param candidates 候選配方（一般傳「啟用中」配方，帶各訊號）。
 * @param quotas     各類別配額（預設 DEFAULT_MENU_QUOTAS）。
 */
export function planBalancedMenu(
  candidates: BalancedMenuCandidate[],
  quotas: BalancedMenuQuota[] = DEFAULT_MENU_QUOTAS,
): BalancedMenuResult {
  const byCat = new Map<DishCategory, BalancedMenuCandidate[]>();
  for (const c of candidates ?? []) {
    if (!c.category) continue;
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }

  const selectedRecipeIds: string[] = [];
  const byCategory: BalancedMenuCategoryFill[] = [];
  const shortfalls: { category: DishCategory; want: number; got: number }[] = [];

  for (const quota of quotas) {
    if (quota.count <= 0) continue;
    const pool = [...(byCat.get(quota.category) ?? [])].sort(compareCandidates);
    const chosen = pool.slice(0, quota.count);
    const recipeIds = chosen.map((c) => c.recipeId);
    selectedRecipeIds.push(...recipeIds);
    byCategory.push({ category: quota.category, want: quota.count, got: recipeIds.length, recipeIds });
    if (recipeIds.length < quota.count) {
      shortfalls.push({ category: quota.category, want: quota.count, got: recipeIds.length });
    }
  }

  return { selectedRecipeIds, byCategory, shortfalls };
}
