/**
 * craftingBenchPlanner — 今日開工「灶台合成」的格子分配（純函式）。
 *
 * 把已選的菜依類別放進配額格（如 1 主菜 + 1 主食 + 2 蔬菜 + 1 湯）：
 * 依選取順序，放進同類別的第一個空格；該類別格子已滿、或類別不在配額內
 * （含未分類 →「其他」）的菜，放到「加菜」區。只決定畫面怎麼排，
 * 不影響實際開工的菜色（開工仍用全部已選的菜）。純函式、僅 type-import，可單測。
 */

import type { DishCategory } from '@/services/types';
import type { BalancedMenuQuota } from '@/services/balancedMenuPlanner';

export interface BenchSlot {
  category: DishCategory;
  recipeId: string | null;
}

export interface BenchLayout {
  /** 配額格，依配額順序；每類別 `count` 格。 */
  slots: BenchSlot[];
  /** 超出配額或類別不在配額內的已選菜（依選取順序）。 */
  extras: string[];
  /** 已填的配額格數。 */
  filled: number;
}

export function assignBenchSlots(
  pickedIds: Iterable<string>,
  categoryById: Map<string, DishCategory | undefined>,
  quotas: BalancedMenuQuota[],
): BenchLayout {
  const slots: BenchSlot[] = [];
  for (const q of quotas) {
    for (let i = 0; i < q.count; i++) slots.push({ category: q.category, recipeId: null });
  }
  const extras: string[] = [];
  let filled = 0;
  for (const id of pickedIds) {
    const category = categoryById.get(id) ?? '其他';
    const slot = slots.find((s) => s.category === category && s.recipeId === null);
    if (slot) {
      slot.recipeId = id;
      filled++;
    } else {
      extras.push(id);
    }
  }
  return { slots, extras, filled };
}
