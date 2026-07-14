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

import type { Firestore } from 'firebase/firestore';
import { createMenu } from './recipeMenuService';
import { createPrepPlanFromRecipeMenu, getPrepPlan } from './prepPlanService';
import { createDraftFromPrepPlan } from './purchaseDemandDraftService';
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

// ─── Defaults for the first-pass schedule ───────────────────────────────────
// Editable afterwards in 生產排程 — these just make the one-click run yield a
// usable draft instead of stopping to ask 10 questions.

/** Service time on the target date (24h) used for the schedule suggestion. */
const DEFAULT_SERVICE_HOUR = 11;
const DEFAULT_CAPACITY_WINDOW_MINUTES = 240;
const DEFAULT_BUFFER_MINUTES = 30;
/** Matches the staffRole vocabulary emitted by workflowTaskDraftService templates. */
const DEFAULT_STAFF = [
  { role: '廚師', count: 2 },
  { role: '助手', count: 2 },
];
const DEFAULT_EQUIPMENT: ProductionScheduleInput['availableEquipment'] = [
  { type: 'sink', count: 1 },
  { type: 'cuttingStation', count: 2 },
  { type: 'prepTable', count: 2 },
  { type: 'wok', count: 2 },
  { type: 'stoveBurner', count: 2 },
  { type: 'stockPot', count: 1 },
  { type: 'deepFryer', count: 1 },
  { type: 'steamer', count: 1 },
];

export function defaultScheduleInput(date: string): ProductionScheduleInput {
  return {
    targetServiceDateTime: new Date(`${date}T${String(DEFAULT_SERVICE_HOUR).padStart(2, '0')}:00:00`),
    capacityWindowMinutes: DEFAULT_CAPACITY_WINDOW_MINUTES,
    bufferMinutes: DEFAULT_BUFFER_MINUTES,
    availableStaff: DEFAULT_STAFF,
    availableEquipment: DEFAULT_EQUIPMENT,
  };
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

  // 3. 採購需求草稿
  const okDraft = await runStep('purchaseDraft', async () => {
    result.purchaseDraftId = await createDraftFromPrepPlan(
      db,
      {
        draftName: `${input.date} 採購需求`,
        sourcePrepPlanId: result.prepPlanId!,
        notes: '由一日開工精靈建立',
      },
      uid,
    );
    return '草稿已建立，可於採購需求草稿頁調整數量後送出';
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

  // 5. 排程建議
  const okSchedule = await runStep('schedule', async () => {
    const suggestion = await createProductionScheduleSuggestion(
      db,
      result.workflowPlanId!,
      defaultScheduleInput(input.date),
      uid,
    );
    result.scheduleId = suggestion.id;
    const statusLabel =
      suggestion.scheduleStatus === 'fits' ? '可行' : suggestion.scheduleStatus === 'overrun' ? '超時' : '不可行';
    return `${statusLabel}，總工時 ${suggestion.makespanMinutes} 分鐘（預設人力：廚師×2、助手×2，可至生產排程調整）`;
  });
  if (!okSchedule) return result;

  result.completed = true;
  return result;
}
