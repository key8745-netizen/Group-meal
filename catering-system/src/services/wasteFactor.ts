/**
 * wasteFactor — 食材耗損率（純函式）。
 *
 * 配方的 `baseQuantity` 是**淨重**（可食、處理後的用量）。食材主檔的 `wasteFactor`
 * 是「買進重量裡削皮、去頭尾、挑掉的比例」（0.25 = 買 1 kg 只剩 0.75 kg 可用）。
 * 所以要買／要備的毛重 = 淨重 ÷ (1 − 耗損率)。備料展開（prepPlanService）與
 * 成本估算（costAwareMenuSuggestionService）都經過這裡，避免各算各的。
 */

/** 耗損率上限：再高就幾乎沒有可食部分，視為輸入錯誤並夾到上限。 */
export const MAX_WASTE_FACTOR = 0.9;

/** 非數字、負數、NaN → 0；超過上限 → 上限。 */
export function normalizeWasteFactor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_WASTE_FACTOR);
}

/** 淨重 → 毛重（2 位小數）。耗損率為 0 時原值返回。 */
export function grossBaseQuantity(netBaseQuantity: number, wasteFactor: unknown): number {
  const w = normalizeWasteFactor(wasteFactor);
  if (w === 0) return netBaseQuantity;
  return Math.round((netBaseQuantity / (1 - w)) * 100) / 100;
}
