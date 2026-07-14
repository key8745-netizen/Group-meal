/**
 * dayStartService — Feature 044: 一日開工精靈
 *
 * One-click orchestration of the whole daily supply chain from a single
 * input (date + head count + picked dishes):
 *
 *   菜單 → 備料快照 → 採購需求草稿 → 製程規劃（含任務草稿）→ 排程建議
 *
 * Every step calls the EXISTING create function for that collection — this
 * module adds no new collections, no new security rules, and no write paths
 * of its own. It is purely a sequencer: each record it creates is exactly
 * what the corresponding advanced page would have created by hand, so
 * everything remains individually editable there afterwards.
 *
 * Failure semantics: steps run strictly in order; the first failure marks
 * that step `failed`, all later steps become `skipped`, and the partial
 * result is returned (never thrown) so the UI can show exactly how far the
 * run got. Already-created records are kept — they are normal drafts the
 * user can finish manually from the advanced pages.
 */

import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { normalizeIngredientName } from '@/utils/normalizeIngredientName';
import { createMenu } from './recipeMenuService';
import { createPrepPlanFromRecipeMenu, getPrepPlan } from './prepPlanService';
import {
  createDraftFromPrepPlan,
  getPurchaseDemandDraft,
  updateDraft,
} from './purchaseDemandDraftService';
import { listBatches, listItems } from './menuImportService';
import {
  getKitchenSettings,
  buildScheduleInput,
  DEFAULT_KITCHEN_SETTINGS,
} from './kitchenSettingsService';
import type { InventoryDoc, Recipe } from './types';
import {
  createProductionWorkflowPlanFromPrepPlan,
  updateProductionWorkflowPlan,
} from './productionWorkflowService';
import { generateTaskDraftsFromPrepPlan } from './workflowTaskDraftService';
import {
  createProductionScheduleSuggestion,
  type ProductionScheduleInput,
} from './productionScheduleService';
import { listIngredients } from './ingredientMasterService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DayStartStepKey = 'menu' | 'prepPlan' | 'purchaseDraft' | 'workflowPlan' | 'schedule';

export type DayStartStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface DayStartStep {
  key: DayStartStepKey;
  label: string;
  status: DayStartStepStatus;
  /** Short zh-TW result/err line, e.g. 「8 項食材」 or the error message. */
  detail: string;
  /** Advanced page where this step's record can be inspected/edited. */
  linkTo: string;
}

export interface DayStartInput {
  /** YYYY-MM-DD service date. */
  date: string;
  /** Servings applied to every picked dish. */
  headCount: number;
  /** Picked dishes (active recipe ids). */
  recipeIds: string[];
}

export interface DayStartResult {
  steps: DayStartStep[];
  menuId: string | null;
  prepPlanId: string | null;
  purchaseDraftId: string | null;
  workflowPlanId: string | null;
  scheduleId: string | null;
  /** Human-review notes surfaced by downstream generators (task drafts etc.). */
  warnings: string[];
  /** True when every step finished `done`. */
  completed: boolean;
}

// ─── Schedule parameters ────────────────────────────────────────────────────
// Feature 049: all schedule parameters come from 我的廚房設定
// (`kitchenSettingsService`) — falling back to its defaults when the owner
// hasn't saved any. Nothing is hard-coded here anymore.

/** Kept for API compatibility: schedule input for `date` using stock defaults. */
export function defaultScheduleInput(date: string): ProductionScheduleInput {
  return buildScheduleInput(date, DEFAULT_KITCHEN_SETTINGS);
}

// ─── 照月菜單帶入（Feature 045）──────────────────────────────────────────────

export interface MonthlyMenuDayPick {
  recipeId: string;
  recipeName: string;
  /** Original rawDishName from the import batch. */
  dishName: string;
}

export interface MonthlyMenuDayResult {
  /** Dishes on the imported monthly menu for `date` that resolve to a recipe. */
  matched: MonthlyMenuDayPick[];
  /** Dish names with no matching recipe (create drafts via 配方管理 first). */
  unmatchedDishNames: string[];
  /** servingBaseline of the first contributing batch, when > 0. */
  headCountHint: number | null;
  /** True when at least one batch covers the date's month. */
  monthCovered: boolean;
}

/**
 * Looks up what the imported monthly menu says should be served on `date`,
 * and resolves each dish against existing recipes — `matchedRecipeId` first
 * (set during menu-import review), then exact normalized-name match.
 * Read-only; duplicate dish names across batches are collapsed.
 */
export async function loadMonthlyMenuDay(
  db: Firestore,
  date: string,
  recipes: Recipe[],
): Promise<MonthlyMenuDayResult> {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const recipeByNorm = new Map<string, Recipe>();
  for (const r of recipes) {
    const norm = normalizeIngredientName(r.name);
    if (!recipeByNorm.has(norm)) recipeByNorm.set(norm, r);
  }

  const yearMonth = date.slice(0, 7);
  const batches = (await listBatches(db)).filter((b) => b.yearMonth === yearMonth);

  const matched: MonthlyMenuDayPick[] = [];
  const matchedRecipeIds = new Set<string>();
  const unmatchedDishNames: string[] = [];
  const seenDish = new Set<string>();
  let headCountHint: number | null = null;

  for (const batch of batches) {
    if (headCountHint === null && batch.servingBaseline > 0) {
      headCountHint = batch.servingBaseline;
    }
    const items = await listItems(db, batch.id);
    for (const item of items) {
      if (item.date !== date) continue;
      const dishName = item.rawDishName?.trim();
      if (!dishName) continue;
      const norm = normalizeIngredientName(dishName);
      if (seenDish.has(norm)) continue;
      seenDish.add(norm);

      const recipe =
        (item.matchedRecipeId ? recipeById.get(item.matchedRecipeId) : undefined) ??
        recipeByNorm.get(norm);
      if (recipe && recipe.isActive !== false) {
        if (!matchedRecipeIds.has(recipe.id)) {
          matchedRecipeIds.add(recipe.id);
          matched.push({ recipeId: recipe.id, recipeName: recipe.name, dishName });
        }
      } else {
        unmatchedDishNames.push(dishName);
      }
    }
  }

  return { matched, unmatchedDishNames, headCountHint, monthCovered: batches.length > 0 };
}

// ─── 採購需求扣庫存（Feature 046）────────────────────────────────────────────

export interface NetAgainstStockItemInput {
  ingredientId: string;
  baseUnit: 'g' | 'ml' | 'pcs';
  demandQuantity: number;
  notes?: string;
}

export interface NetAgainstStockResult {
  items: NetAgainstStockItemInput[];
  /** Items whose demand was compared against a positive stock figure. */
  nettedCount: number;
  /** Netted items whose demand dropped to 0 (stock fully covers需求). */
  coveredCount: number;
}

/**
 * Pure netting: demandQuantity becomes max(0, 需求 − 庫存), with a per-item
 * note showing the arithmetic. Inventory stock is in kg; g/ml demands are
 * compared via ×1000 (1 ml ≈ 1 g repo-wide); pcs items and items with no
 * positive stock are passed through untouched.
 */
export function netItemsAgainstStock(
  items: NetAgainstStockItemInput[],
  stockKgByIngredientId: Map<string, number>,
): NetAgainstStockResult {
  let nettedCount = 0;
  let coveredCount = 0;
  const out = items.map((item) => {
    if (item.baseUnit === 'pcs') return { ...item };
    const stockKg = stockKgByIngredientId.get(item.ingredientId) ?? 0;
    const stockBase = Math.max(0, stockKg * 1000);
    if (!(stockBase > 0)) return { ...item };
    const net = Math.max(0, Math.round(item.demandQuantity - stockBase));
    nettedCount++;
    if (net === 0) coveredCount++;
    return {
      ingredientId: item.ingredientId,
      baseUnit: item.baseUnit,
      demandQuantity: net,
      notes: `需求 ${Math.round(item.demandQuantity)}${item.baseUnit} − 庫存 ${Math.round(stockBase)}${item.baseUnit} → 淨採購 ${net}${item.baseUnit}`,
    };
  });
  return { items: out, nettedCount, coveredCount };
}

/**
 * Nets a freshly created purchase-demand draft against current inventory
 * via `netItemsAgainstStock`, persisting through the existing `updateDraft`
 * path (same validation as a manual edit). Returns a short zh-TW summary
 * line for the step detail.
 */
async function netDraftAgainstInventory(
  db: Firestore,
  draftId: string,
  uid: string,
): Promise<string> {
  const [draft, inventorySnap] = await Promise.all([
    getPurchaseDemandDraft(db, draftId),
    getDocs(collection(db, 'inventory')),
  ]);
  const stockKgById = new Map<string, number>();
  inventorySnap.docs.forEach((d) => {
    const inv = d.data() as InventoryDoc;
    if (typeof inv.currentStock === 'number') stockKgById.set(d.id, inv.currentStock);
  });

  const { items, nettedCount, coveredCount } = netItemsAgainstStock(
    draft.items.map((i) => ({
      ingredientId: i.ingredientId,
      baseUnit: i.baseUnit,
      demandQuantity: i.demandQuantity,
      notes: i.notes,
    })),
    stockKgById,
  );

  if (nettedCount > 0) {
    await updateDraft(
      db,
      draftId,
      { draftName: draft.draftName, notes: draft.notes ?? '', items },
      uid,
    );
  }

  const parts = [`${draft.items.length} 項食材`];
  if (nettedCount > 0) parts.push(`${nettedCount} 項已扣庫存`);
  if (coveredCount > 0) parts.push(`${coveredCount} 項庫存足夠免採購`);
  return `${parts.join('，')}（可於採購需求草稿頁調整後送出）`;
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

function initialSteps(): DayStartStep[] {
  return [
    { key: 'menu', label: '建立當日菜單', status: 'pending', detail: '', linkTo: '/recipe-menus' },
    { key: 'prepPlan', label: '展開備料需求', status: 'pending', detail: '', linkTo: '/prep-plans' },
    { key: 'purchaseDraft', label: '產生採購需求', status: 'pending', detail: '', linkTo: '/purchase-demand-drafts' },
    { key: 'workflowPlan', label: '排定製程任務', status: 'pending', detail: '', linkTo: '/production-workflows' },
    { key: 'schedule', label: '計算人力排程', status: 'pending', detail: '', linkTo: '/production-schedules' },
  ];
}

/**
 * Runs the whole chain sequentially. `onProgress` receives a fresh copy of
 * the step array after every state change (safe to put straight into React
 * state). Never throws — inspect `result.completed` / step statuses.
 */
export async function runDayStart(
  db: Firestore,
  input: DayStartInput,
  uid: string,
  onProgress?: (steps: DayStartStep[]) => void,
): Promise<DayStartResult> {
  const steps = initialSteps();
  const warnings: string[] = [];
  const result: DayStartResult = {
    steps,
    menuId: null,
    prepPlanId: null,
    purchaseDraftId: null,
    workflowPlanId: null,
    scheduleId: null,
    warnings,
    completed: false,
  };

  const emit = () => onProgress?.(steps.map((s) => ({ ...s })));
  const step = (key: DayStartStepKey) => steps.find((s) => s.key === key)!;

  async function runStep(key: DayStartStepKey, fn: () => Promise<string>): Promise<boolean> {
    const s = step(key);
    s.status = 'running';
    emit();
    try {
      s.detail = await fn();
      s.status = 'done';
      emit();
      return true;
    } catch (err) {
      s.status = 'failed';
      s.detail = err instanceof Error ? err.message : String(err);
      for (const later of steps) {
        if (later.status === 'pending') later.status = 'skipped';
      }
      emit();
      return false;
    }
  }

  // 1. 菜單
  const okMenu = await runStep('menu', async () => {
    result.menuId = await createMenu(
      db,
      {
        name: `${input.date} 出餐菜單`,
        date: input.date,
        mealType: '午餐',
        isActive: true,
        notes: '由一日開工精靈建立',
        menuRecipes: input.recipeIds.map((recipeId) => ({ recipeId, servings: input.headCount })),
      },
      uid,
    );
    return `${input.recipeIds.length} 道菜 × ${input.headCount} 人份`;
  });
  if (!okMenu) return result;

  // 2. 備料快照
  const okPrep = await runStep('prepPlan', async () => {
    result.prepPlanId = await createPrepPlanFromRecipeMenu(
      db,
      {
        name: `${input.date} 備料快照`,
        date: input.date,
        sourceRecipeMenuId: result.menuId!,
        notes: '由一日開工精靈建立',
      },
      uid,
    );
    const prepPlan = await getPrepPlan(db, result.prepPlanId);
    return `${prepPlan?.prepItems?.length ?? 0} 項食材需求`;
  });
  if (!okPrep) return result;

  // 3. 採購需求草稿（建立後立即扣庫存 → 淨採購量）
  const okDraft = await runStep('purchaseDraft', async () => {
    result.purchaseDraftId = await createDraftFromPrepPlan(
      db,
      {
        draftName: `${input.date} 採購需求`,
        sourcePrepPlanId: result.prepPlanId!,
        notes: '由一日開工精靈建立（數量已扣除現有庫存）',
      },
      uid,
    );
    return await netDraftAgainstInventory(db, result.purchaseDraftId, uid);
  });
  if (!okDraft) return result;

  // 4. 製程規劃 + 任務草稿
  const okWorkflow = await runStep('workflowPlan', async () => {
    result.workflowPlanId = await createProductionWorkflowPlanFromPrepPlan(
      db,
      result.prepPlanId!,
      {
        planName: `${input.date} 製程規劃`,
        serviceDate: input.date,
        notes: '由一日開工精靈建立',
      },
      uid,
    );
    const [prepPlan, ingredients] = await Promise.all([
      getPrepPlan(db, result.prepPlanId!),
      listIngredients(db),
    ]);
    if (!prepPlan) throw new Error('備料快照讀取失敗，無法產生任務草稿');
    const generated = generateTaskDraftsFromPrepPlan(prepPlan, ingredients, []);
    warnings.push(...generated.generationNotes);
    await updateProductionWorkflowPlan(
      db,
      result.workflowPlanId,
      {
        planName: `${input.date} 製程規劃`,
        serviceDate: input.date,
        notes: '由一日開工精靈建立',
        tasks: generated.tasks,
      },
      uid,
    );
    return `${generated.tasks.length} 項任務`;
  });
  if (!okWorkflow) return result;

  // 5. 排程建議（參數來自「我的廚房設定」，未設定時用系統預設）
  const okSchedule = await runStep('schedule', async () => {
    const settings = await getKitchenSettings(db);
    const suggestion = await createProductionScheduleSuggestion(
      db,
      result.workflowPlanId!,
      buildScheduleInput(input.date, settings),
      uid,
    );
    result.scheduleId = suggestion.id;
    const statusLabel =
      suggestion.scheduleStatus === 'fits' ? '可行' : suggestion.scheduleStatus === 'overrun' ? '超時' : '不可行';
    const staffLabel = settings.availableStaff.map((s) => `${s.role}×${s.count}`).join('、');
    return `${statusLabel}，總工時 ${suggestion.makespanMinutes} 分鐘（人力：${staffLabel}，出餐 ${settings.serviceTime}——可至廚房設定調整）`;
  });
  if (!okSchedule) return result;

  result.completed = true;
  return result;
}
