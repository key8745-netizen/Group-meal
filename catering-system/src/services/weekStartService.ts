/**
 * weekStartService — Feature 052: 整週一鍵開工＋彙總直接建採購單
 *
 * A. `runWeekStart` — 對一週內每一天依序執行一日開工（Feature 044 的
 *    `runDayStart`），菜色與人數自動取自月菜單（`loadMonthlyMenuDay`）。
 *    已有菜單的日子與月菜單沒排菜的日子自動略過，逐日回報結果。
 *
 * B. `createOrderFromRangeDemand` — 把週間規劃的多日彙總（Feature 040
 *    `RangeDemandSummary`）扣掉現有庫存後，直接建立一張正式採購單
 *    （與手動建單同路徑 `purchaseOrderService.createOrder`，PENDING；
 *    收貨自動入庫）。純規劃在 `planRangeOrder`（可測試、可預覽）。
 *
 * 兩者都是排序器：只呼叫既有的 create 函式，不新增 collection 或規則。
 */

import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { runDayStart, loadMonthlyMenuDay } from './dayStartService';
import { listRecipes } from './recipeService';
import { listMenus } from './recipeMenuService';
import { purchaseOrderService } from './purchaseOrderService';
import { planRangeOrder, type RangeOrderPlan } from './draftToPurchaseOrderPlanner';
import type { RangeDemandSummary } from './weekPlanService';
import type { InventoryDoc } from './types';

// ─── A. 整週一鍵開工 ────────────────────────────────────────────────────────

export type WeekStartDayStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'partial'
  | 'skippedExisting'
  | 'skippedNoDishes'
  | 'failed';

export interface WeekStartDayResult {
  date: string;
  status: WeekStartDayStatus;
  detail: string;
}

export const WEEK_START_STATUS_LABELS: Record<WeekStartDayStatus, string> = {
  pending: '等待中',
  running: '處理中…',
  done: '完成',
  partial: '部分完成',
  skippedExisting: '已有菜單，略過',
  skippedNoDishes: '月菜單無排菜，略過',
  failed: '失敗',
};

/**
 * 依序為 `dates` 中的每一天執行一日開工。`fallbackHeadCount` 用於月菜單
 * 批次沒有人數基準時。`onProgress` 每次狀態變化都會收到整份結果複本。
 * 永不 throw——逐日結果自行檢視。
 */
export async function runWeekStart(
  db: Firestore,
  dates: string[],
  fallbackHeadCount: number,
  uid: string,
  onProgress?: (results: WeekStartDayResult[]) => void,
): Promise<WeekStartDayResult[]> {
  const results: WeekStartDayResult[] = dates.map((date) => ({
    date,
    status: 'pending',
    detail: '',
  }));
  const emit = () => onProgress?.(results.map((r) => ({ ...r })));

  const [recipes, menus] = await Promise.all([listRecipes(db), listMenus(db)]);
  const datesWithMenu = new Set(menus.filter((m) => m.isActive !== false).map((m) => m.date));

  for (const result of results) {
    result.status = 'running';
    emit();
    try {
      if (datesWithMenu.has(result.date)) {
        result.status = 'skippedExisting';
        result.detail = '這天已建立過菜單（要重排請至當日流程處理）';
        emit();
        continue;
      }

      const day = await loadMonthlyMenuDay(db, result.date, recipes);
      if (day.matched.length === 0) {
        result.status = 'skippedNoDishes';
        result.detail = day.unmatchedDishNames.length > 0
          ? `有 ${day.unmatchedDishNames.length} 道菜找不到配方：${day.unmatchedDishNames.join('、')}`
          : day.monthCovered ? '月菜單這天沒有排菜' : '尚未匯入這個月份的月菜單';
        emit();
        continue;
      }

      const headCount = day.headCountHint ?? fallbackHeadCount;
      const run = await runDayStart(
        db,
        { date: result.date, headCount, recipeIds: day.matched.map((m) => m.recipeId) },
        uid,
      );
      const failedStep = run.steps.find((s) => s.status === 'failed');
      if (run.completed) {
        result.status = 'done';
        result.detail = `${day.matched.length} 道菜 × ${headCount} 人份`
          + (day.unmatchedDishNames.length > 0 ? `（${day.unmatchedDishNames.length} 道無配方未帶入）` : '');
      } else {
        result.status = 'partial';
        result.detail = failedStep
          ? `停在「${failedStep.label}」：${failedStep.detail}`
          : '部分步驟未完成';
      }
    } catch (err) {
      result.status = 'failed';
      result.detail = err instanceof Error ? err.message : String(err);
    }
    emit();
  }

  return results;
}

// ─── B. 彙總扣庫存 → 正式採購單 ─────────────────────────────────────────────

export interface RangeOrderResult {
  orderId: string;
  lineCount: number;
  plan: RangeOrderPlan;
}

/** 讀取現有庫存（kg），供 planRangeOrder 淨化需求。 */
export async function loadStockKgByIngredientId(db: Firestore): Promise<Map<string, number>> {
  const snap = await getDocs(collection(db, 'inventory'));
  const stock = new Map<string, number>();
  snap.docs.forEach((d) => {
    const inv = d.data() as InventoryDoc;
    if (typeof inv.currentStock === 'number') stock.set(d.id, inv.currentStock);
  });
  return stock;
}

/**
 * 把彙總結果扣庫存後建立一張 PENDING 採購單。呼叫端應先用
 * `planRangeOrder` 預覽並經人確認。可轉換行數為 0 時 throw。
 */
export async function createOrderFromRangeDemand(
  db: Firestore,
  summary: RangeDemandSummary,
  uid: string,
): Promise<RangeOrderResult> {
  void uid; // 建單者由 purchaseOrderService 內部從 auth 取得；保留參數供未來稽核欄位。
  const stock = await loadStockKgByIngredientId(db);
  const plan = planRangeOrder(
    summary.lines.map((l) => ({
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      baseUnit: l.baseUnit,
      totalBaseQuantity: l.totalBaseQuantity,
    })),
    stock,
  );
  if (plan.lines.length === 0) {
    throw new Error('沒有可轉換的品項（庫存足夠，或皆為個數單位）');
  }
  const orderId = await purchaseOrderService.createOrder(plan.lines);
  return { orderId, lineCount: plan.lines.length, plan };
}
