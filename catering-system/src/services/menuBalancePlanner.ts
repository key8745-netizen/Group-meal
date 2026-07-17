/**
 * menuBalancePlanner — Feature 089: 菜單平衡檢查（純函式）。
 *
 * 給定一份菜單各菜色的類別，統計各類數量並給出「均衡」提示（缺蔬菜、缺主菜、
 * 主菜偏多、有未分類…）。全部為建議性、不強制；閾值簡單可預期。
 * 純函式、僅 type-import，可單測。
 */

import type { DishCategory } from '@/services/types';

export const DISH_CATEGORIES: DishCategory[] = ['主菜', '主食', '蔬菜', '湯', '其他'];

export interface MenuBalance {
  /** 各類別菜色數。 */
  counts: Record<DishCategory, number>;
  /** 未分類菜色數。 */
  uncategorized: number;
  /** 菜色總數。 */
  total: number;
  /** 均衡提示（建議性）。 */
  warnings: string[];
}

/**
 * 統計菜單平衡。
 * @param categories 各菜色的類別（未分類傳 null/undefined）。
 */
export function summarizeMenuBalance(
  categories: (DishCategory | null | undefined)[],
): MenuBalance {
  const counts: Record<DishCategory, number> = { 主菜: 0, 主食: 0, 蔬菜: 0, 湯: 0, 其他: 0 };
  let uncategorized = 0;

  for (const c of categories ?? []) {
    if (c && c in counts) counts[c] += 1;
    else uncategorized += 1;
  }
  const total = (categories ?? []).length;

  const warnings: string[] = [];
  // 只在菜單有一定規模時提示，避免小菜單噪音。
  if (total >= 2) {
    if (counts.主菜 === 0) warnings.push('沒有主菜');
    if (counts.蔬菜 === 0) warnings.push('沒有蔬菜，建議加一道');
    if (counts.主菜 >= 3) warnings.push(`主菜偏多（${counts.主菜} 道）`);
  }
  if (uncategorized > 0) {
    warnings.push(`${uncategorized} 道未分類（到配方設定類別可納入平衡）`);
  }

  return { counts, uncategorized, total, warnings };
}
