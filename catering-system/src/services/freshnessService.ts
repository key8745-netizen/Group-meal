/**
 * freshnessService — Feature 071: 食材保鮮引擎（純函式，無 Firestore）。
 *
 * 依設計文件實作保鮮運算核心：
 *  - effectiveExpiry：取「效期」與「開封後上限」的較早者
 *  - estimatedUsableDays：距離有效效期還有幾天（可為負 = 已過期）
 *  - nextServiceDay：跳過非開膳日（週末/假日）的下一個開膳日
 *  - batchState：衰退狀態機，含「撐不過下一個開膳日 → CRITICAL」的跨空檔判斷
 *  - weekendDecayAlerts：週五收工前掃描，找出「熬不過空檔」的批次
 *
 * 全部純函式、僅 type-import，可用 tsx 直接單測（同 stockAlertService 模式）。
 * 引擎只「判斷與建議」，不做任何寫入——扣庫存/建批次仍走既有 executor。
 */

import type {
  FreshnessState,
  IngredientFreshnessParams,
  InventoryBatch,
} from './types';

/** 未設定時的保守預設門檻（天）。 */
export const DEFAULT_WARN_THRESHOLD_DAYS = 2;
export const DEFAULT_CRITICAL_THRESHOLD_DAYS = 1;

// ── ISO 日期工具（"YYYY-MM-DD"，以 UTC 計避免時區漂移）──────────────────────

/** 解析 ISO 日期（取日期部分）為 UTC epoch 毫秒。 */
function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** ISO 日期 + n 天 → ISO "YYYY-MM-DD"。 */
export function isoAddDays(iso: string, n: number): string {
  const d = new Date(isoToUtcMs(iso) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** toIso − fromIso 的整數天數。 */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);
}

/** ISO 字典序即日期序（同長度 YYYY-MM-DD），取較早者。 */
function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

/** 週末預設判斷：週六(6)、週日(0) 不開膳。假日覆寫由呼叫端的 isServiceDay 提供。 */
export function defaultIsServiceDay(iso: string): boolean {
  const day = new Date(isoToUtcMs(iso)).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * 下一個開膳日（嚴格晚於 from）。跳過非開膳日；maxLookahead 天內找不到則回退。
 */
export function nextServiceDay(
  fromIso: string,
  isServiceDay: (iso: string) => boolean = defaultIsServiceDay,
  maxLookahead = 14,
): string {
  let d = isoAddDays(fromIso, 1);
  for (let i = 0; i < maxLookahead; i++) {
    if (isServiceDay(d)) return d;
    d = isoAddDays(d, 1);
  }
  return d; // 安全回退：連續 maxLookahead 天皆非開膳日
}

// ── 保鮮運算 ────────────────────────────────────────────────────────────────

/** 有效效期 = min(效期或人工覆寫, 開封後上限)。 */
export function effectiveExpiryIso(
  batch: InventoryBatch,
  params: IngredientFreshnessParams,
): string {
  let base = batch.manualExpiryOverride || batch.expirationDate;
  if (batch.openedAt && params.openedShelfLifeHours && params.openedShelfLifeHours > 0) {
    const openedDate = batch.openedAt.slice(0, 10);
    const openedLimit = isoAddDays(openedDate, Math.floor(params.openedShelfLifeHours / 24));
    base = minIso(base, openedLimit);
  }
  return base;
}

/** 預估可用天數（距有效效期；可為負）。 */
export function estimatedUsableDays(
  batch: InventoryBatch,
  params: IngredientFreshnessParams,
  todayIso: string,
): number {
  return daysBetween(todayIso, effectiveExpiryIso(batch, params));
}

/**
 * 衰退狀態機。跨空檔關鍵：有效效期早於「下一個開膳日」→ 直接 CRITICAL
 * （今天不用就報廢）。
 */
export function batchState(
  batch: InventoryBatch,
  params: IngredientFreshnessParams,
  todayIso: string,
  isServiceDay: (iso: string) => boolean = defaultIsServiceDay,
): FreshnessState {
  if (!(batch.qtyRemainingKg > 0)) return 'DEPLETED';
  if (params.isPerishable === false) return 'FRESH';

  const expiry = effectiveExpiryIso(batch, params);
  const usable = daysBetween(todayIso, expiry);
  if (usable < 0) return 'EXPIRED';

  // ★ 跨週末/假日空檔：撐不過下一個開膳日
  if (expiry < nextServiceDay(todayIso, isServiceDay)) return 'CRITICAL';

  const crit = params.criticalThresholdDays ?? DEFAULT_CRITICAL_THRESHOLD_DAYS;
  const warn = params.warnThresholdDays ?? DEFAULT_WARN_THRESHOLD_DAYS;
  if (usable <= crit) return 'CRITICAL';
  if (usable <= warn) return 'USE_FIRST';
  return 'FRESH';
}

export interface WeekendDecayAlert {
  batchId: string;
  ingredientId: string;
  ingredientName: string;
  atRiskKg: number;
  expiryIso: string;
  /** 到下一個開膳日的天數（風險視窗）。 */
  gapDays: number;
  message: string;
}

/**
 * 週五收工前掃描：找出「有效效期落在 現在 → 下一個開膳日 之間」的批次，
 * 依效期由早到晚排序（最急的在前）。
 */
export function weekendDecayAlerts(
  batches: InventoryBatch[],
  paramsById: Map<string, IngredientFreshnessParams>,
  namesById: Map<string, string>,
  todayIso: string,
  isServiceDay: (iso: string) => boolean = defaultIsServiceDay,
): WeekendDecayAlert[] {
  const next = nextServiceDay(todayIso, isServiceDay);
  const alerts: WeekendDecayAlert[] = [];
  for (const b of batches) {
    if (!(b.qtyRemainingKg > 0)) continue;
    const params = paramsById.get(b.ingredientId) ?? {};
    if (params.isPerishable === false) continue;
    const expiry = effectiveExpiryIso(b, params);
    if (expiry < next) {
      const name = namesById.get(b.ingredientId) ?? b.ingredientId;
      alerts.push({
        batchId: b.id,
        ingredientId: b.ingredientId,
        ingredientName: name,
        atRiskKg: b.qtyRemainingKg,
        expiryIso: expiry,
        gapDays: daysBetween(todayIso, next),
        message: `批次 #${b.id} ${name} 預計 ${expiry} 到期，下一個開膳日 ${next} 前無法使用，建議今日出清 ${b.qtyRemainingKg}kg`,
      });
    }
  }
  return alerts.sort((a, b) => (a.expiryIso < b.expiryIso ? -1 : a.expiryIso > b.expiryIso ? 1 : 0));
}
