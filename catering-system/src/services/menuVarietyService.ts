/**
 * menuVarietyService — Feature 092: 跨天菜色多樣性（純函式）。
 *
 * 從最近幾天的菜單，算出「近期已出過」的配方集合，供：
 *   1) 一鍵均衡菜單避開近日重複（同類優先挑沒出過的）。
 *   2) 挑菜時提醒「這道最近才出過」。
 * 純函式、僅 type-import，可單測。
 */

import { daysBetween } from '@/services/freshnessService';

export interface RecentMenuDay {
  /** ISO 日期 "YYYY-MM-DD"。 */
  date: string;
  recipeIds: string[];
}

/**
 * 近 N 天（不含今天）出現過的配方 id 集合。
 * @param days       每日菜單（date + recipeIds）。
 * @param todayIso   今天 ISO。
 * @param withinDays 回看天數（預設 3）。
 */
export function recentlyUsedRecipeIds(
  days: RecentMenuDay[],
  todayIso: string,
  withinDays = 3,
): Set<string> {
  const out = new Set<string>();
  for (const d of days ?? []) {
    if (!d.date) continue;
    const age = daysBetween(d.date, todayIso); // 今天 - d.date
    if (age >= 1 && age <= withinDays) {
      for (const id of d.recipeIds ?? []) if (id) out.add(id);
    }
  }
  return out;
}
