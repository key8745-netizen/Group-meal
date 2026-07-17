/**
 * menuQuotaPreference — Feature 099: 一鍵均衡菜單的配額偏好（純解析/序列化）。
 *
 * 配額（各菜色類別要幾道）原本寫死；此模組把它變成可自訂、可持久化的偏好。
 * localStorage 讀寫由呼叫端 hook 負責；本模組只做「字串 ↔ 配額」的純轉換與驗證，
 * 缺漏/非法一律回落預設。純函式、僅 type-import，可單測。
 */

import type { DishCategory } from '@/services/types';
import { DEFAULT_MENU_QUOTAS, type BalancedMenuQuota } from '@/services/balancedMenuPlanner';

/** 可設定配額的類別（其他不列入自動均衡）。 */
export const QUOTA_CATEGORIES: DishCategory[] = ['主菜', '主食', '蔬菜', '湯'];

function defaultCountFor(cat: DishCategory): number {
  return DEFAULT_MENU_QUOTAS.find((q) => q.category === cat)?.count ?? 0;
}

/** 把 localStorage 原始字串解析成配額；非法/缺漏回落預設。 */
export function parseStoredQuotas(raw: string | null | undefined): BalancedMenuQuota[] {
  let obj: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
    } catch { /* 非法 JSON → 全預設 */ }
  }
  return QUOTA_CATEGORIES.map((cat) => {
    const n = obj[cat];
    const valid = typeof n === 'number' && Number.isFinite(n) && n >= 0;
    return { category: cat, count: valid ? Math.min(20, Math.floor(n as number)) : defaultCountFor(cat) };
  });
}

/** 序列化配額為 localStorage 字串。 */
export function serializeQuotas(quotas: BalancedMenuQuota[]): string {
  const obj: Record<string, number> = {};
  for (const q of quotas) obj[q.category] = q.count;
  return JSON.stringify(obj);
}

/** 配額總道數（供顯示）。 */
export function totalQuotaCount(quotas: BalancedMenuQuota[]): number {
  return quotas.reduce((s, q) => s + q.count, 0);
}
