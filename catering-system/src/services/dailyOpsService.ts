/**
 * dailyOpsService — Feature 038: 每日工作總覽 (Daily Ops Cockpit).
 *
 * Read-only aggregation across the whole supply chain for one date:
 *   菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市價快取
 *
 * This service never writes anything — it only reads existing collections
 * via their existing list functions and links records in memory. It does
 * not introduce any new Firestore collection, index, or security rule.
 *
 * Chain linkage used for matching records to "the day":
 *   RecipeMenu.date === date
 *   PrepPlan.date === date            (also expected to reference a same-day menu
 *                                       via sourceRecipeMenuId, but date is the
 *                                       authoritative day key used for matching)
 *   PurchaseDemandDraft.sourcePrepPlanId ∈ day's PrepPlan ids
 *   ProductionWorkflowPlan.sourcePrepPlanId ∈ day's PrepPlan ids
 *                                       OR ProductionWorkflowPlan.serviceDate === date
 *   ProductionScheduleSuggestion.sourceProductionWorkflowPlanId ∈ day's linked
 *                                       ProductionWorkflowPlan ids (latest per plan)
 *   MarketPriceSnapshot doc id === date (no linkage needed — it's a daily cache)
 */

import { type Firestore } from 'firebase/firestore';
import type {
  RecipeMenu,
  PrepPlan,
  PurchaseDemandDraft,
  PurchaseDemandDraftWorkflowStatus,
  ProductionWorkflowPlan,
  ProductionScheduleSuggestion,
  ProductionScheduleStatus,
  MarketPriceSnapshot,
} from './types';
import { summarizeLabor } from './laborSummaryService';
import { listMenus } from './recipeMenuService';
import { listPrepPlans } from './prepPlanService';
import { listPurchaseDemandDrafts } from './purchaseDemandDraftService';
import { listProductionWorkflowPlans } from './productionWorkflowService';
import { listProductionScheduleSuggestions } from './productionScheduleService';
import { getMarketPriceSnapshot } from './marketPriceService';

// ── Local types ────────────────────────────────────────────────────────────

export type OpsStepKey =
  | 'menu'
  | 'prepPlan'
  | 'purchaseDraft'
  | 'workflowPlan'
  | 'scheduleSuggestion'
  | 'marketPrice';

export type OpsStepStatus = 'done' | 'partial' | 'missing' | 'na';

export interface OpsStepSummary {
  key: OpsStepKey;
  status: OpsStepStatus;
  /** Count of matched records for this step (e.g. number of menus, drafts, entries). */
  count: number;
  /** Up to ~4 short zh-TW lines (names/counts), with an "…等 N 筆" overflow line when capped. */
  detailLines: string[];
  /** zh-TW next-action hint, present only when status is 'missing' or 'partial'. */
  nextActionHint: string | null;
  /** Route path this step's card should link to. */
  linkTo: string;
}

/** Feature 069: 當日概況數字（供每日總覽頂部一眼掌握規模）。 */
export interface DailyOpsSummary {
  /** 菜色數（當日各菜單的菜色加總）。 */
  dishCount: number;
  /** 出餐份數（各菜色 servings 的最大值；同一餐通常一致）。 */
  headCount: number;
  /** 製程總人力（人·分；進行中任務 estimatedMinutes×staffCount 加總）。 */
  laborMinutes: number;
  /** 進行中製程任務數。 */
  activeTaskCount: number;
}

export interface DailyOpsOverview {
  date: string;
  steps: OpsStepSummary[];
  summary: DailyOpsSummary;
}

const LINK_TO: Record<OpsStepKey, string> = {
  menu: '/recipe-menus',
  prepPlan: '/prep-plans',
  purchaseDraft: '/purchase-demand-drafts',
  workflowPlan: '/production-workflows',
  scheduleSuggestion: '/production-schedules',
  marketPrice: '/market-prices',
};

const WORKFLOW_STATUS_LABEL: Record<PurchaseDemandDraftWorkflowStatus, string> = {
  draft: '草稿',
  exported: '已匯出',
  sent: '已送出',
  completed: '已完成',
  cancelled: '已取消',
};

const SCHEDULE_STATUS_LABEL: Record<ProductionScheduleStatus, string> = {
  fits: '可行',
  overrun: '超時',
  infeasible: '不可行',
};

/** Caps a list of display lines at 4, replacing the tail with an "…等 N 筆" overflow line. */
function capDetailLines(lines: string[]): string[] {
  if (lines.length <= 4) return lines;
  return [...lines.slice(0, 3), `…等 ${lines.length} 筆`];
}

function activeTaskCount(plan: ProductionWorkflowPlan): number {
  return plan.tasks.filter((t) => t.taskStatus === 'active').length;
}

// ── Pure assembler ───────────────────────────────────────────────────────────

/**
 * Assembles the 6-step daily ops overview from already-loaded/filtered data.
 * Pure — no Firestore access, fully unit-testable.
 *
 * Inputs (per the contract expected from the caller):
 *  - menus: active RecipeMenus already filtered to `date`.
 *  - prepPlans: active PrepPlans already filtered to `date`.
 *  - drafts: ALL active PurchaseDemandDrafts (not date-filtered) — linked below
 *    by sourcePrepPlanId.
 *  - workflowPlans: active ProductionWorkflowPlans already filtered to
 *    serviceDate === date (undefined-date plans excluded by the caller).
 *  - scheduleSuggestions: latest suggestion per matched workflow plan
 *    (caller resolves "latest" via listProductionScheduleSuggestions()[0],
 *    which is already ordered newest-first).
 *  - marketSnapshot: the cached /marketPrices/{date} doc, or null.
 *
 * Status logic per step:
 *  - menu: done if >=1 menu for the date, else missing.
 *  - prepPlan: na if no menu; done if >=1 prep plan for the date, else missing.
 *  - purchaseDraft: na if no prep plan; missing if no linked draft; partial if
 *    linked drafts exist but ALL have workflowStatus === 'cancelled'; else done.
 *  - workflowPlan: na if no prep plan; missing if no linked plan at all;
 *    partial if a linked plan exists but none has >=1 active task; done if
 *    >=1 linked plan has >=1 active task.
 *  - scheduleSuggestion: na if no workflow plan with active tasks; missing if
 *    no suggestion found for those plans; else done.
 *  - marketPrice: done if snapshot != null and entries.length > 0, else
 *    missing. Never na — this step is purely informational.
 */
export function buildDailyOpsOverview(
  date: string,
  data: {
    menus: RecipeMenu[];
    prepPlans: PrepPlan[];
    drafts: PurchaseDemandDraft[];
    workflowPlans: ProductionWorkflowPlan[];
    scheduleSuggestions: ProductionScheduleSuggestion[];
    marketSnapshot: MarketPriceSnapshot | null;
  },
): DailyOpsOverview {
  const steps: OpsStepSummary[] = [];

  // ── 1. menu ────────────────────────────────────────────────────────────
  const dayMenus = data.menus;
  const menuDone = dayMenus.length >= 1;
  steps.push({
    key: 'menu',
    status: menuDone ? 'done' : 'missing',
    count: dayMenus.length,
    detailLines: capDetailLines(dayMenus.map((m) => `${m.name}（${m.mealType}）`)),
    nextActionHint: menuDone ? null : '尚未建立當日菜單，可至菜單配方或月菜單匯入建立',
    linkTo: LINK_TO.menu,
  });

  // ── 2. prepPlan ────────────────────────────────────────────────────────
  const dayPrepPlans = data.prepPlans;
  let prepPlanStatus: OpsStepStatus;
  let prepPlanHint: string | null;
  if (!menuDone) {
    prepPlanStatus = 'na';
    prepPlanHint = null;
  } else if (dayPrepPlans.length >= 1) {
    prepPlanStatus = 'done';
    prepPlanHint = null;
  } else {
    prepPlanStatus = 'missing';
    prepPlanHint = '從菜單建立備料快照';
  }
  steps.push({
    key: 'prepPlan',
    status: prepPlanStatus,
    count: dayPrepPlans.length,
    detailLines: capDetailLines(dayPrepPlans.map((p) => p.name)),
    nextActionHint: prepPlanHint,
    linkTo: LINK_TO.prepPlan,
  });

  // ── 3. purchaseDraft ─────────────────────────────────────────────────
  const prepPlanIds = new Set(dayPrepPlans.map((p) => p.id));
  const linkedDrafts = data.drafts.filter((d) => prepPlanIds.has(d.sourcePrepPlanId));
  let draftStatus: OpsStepStatus;
  let draftHint: string | null;
  if (dayPrepPlans.length === 0) {
    draftStatus = 'na';
    draftHint = null;
  } else if (linkedDrafts.length === 0) {
    draftStatus = 'missing';
    draftHint = '從備料快照建立採購需求草稿';
  } else if (linkedDrafts.every((d) => (d.workflowStatus ?? 'draft') === 'cancelled')) {
    draftStatus = 'partial';
    draftHint = '採購需求草稿皆已取消，請重新建立或確認採購狀態';
  } else {
    draftStatus = 'done';
    draftHint = null;
  }
  steps.push({
    key: 'purchaseDraft',
    status: draftStatus,
    count: linkedDrafts.length,
    detailLines: capDetailLines(
      linkedDrafts.map((d) => `${d.draftName}（${WORKFLOW_STATUS_LABEL[d.workflowStatus ?? 'draft']}）`),
    ),
    nextActionHint: draftHint,
    linkTo: LINK_TO.purchaseDraft,
  });

  // ── 4. workflowPlan ──────────────────────────────────────────────────
  const linkedPlans = data.workflowPlans.filter(
    (p) => prepPlanIds.has(p.sourcePrepPlanId) || p.serviceDate === date,
  );
  const plansWithActiveTasks = linkedPlans.filter((p) => activeTaskCount(p) >= 1);
  let workflowStatus: OpsStepStatus;
  let workflowHint: string | null;
  if (dayPrepPlans.length === 0) {
    workflowStatus = 'na';
    workflowHint = null;
  } else if (linkedPlans.length === 0) {
    workflowStatus = 'missing';
    workflowHint = '從備料快照建立製程規劃';
  } else if (plansWithActiveTasks.length === 0) {
    workflowStatus = 'partial';
    workflowHint = '使用「自動產生任務草稿」快速建立任務';
  } else {
    workflowStatus = 'done';
    workflowHint = null;
  }
  steps.push({
    key: 'workflowPlan',
    status: workflowStatus,
    count: linkedPlans.length,
    detailLines: capDetailLines(
      linkedPlans.map((p) => `${p.planName}（${activeTaskCount(p)} 項任務）`),
    ),
    nextActionHint: workflowHint,
    linkTo: LINK_TO.workflowPlan,
  });

  // ── 5. scheduleSuggestion ────────────────────────────────────────────
  const plansWithTasksIds = new Set(plansWithActiveTasks.map((p) => p.id));
  const linkedSuggestions = data.scheduleSuggestions.filter((s) =>
    plansWithTasksIds.has(s.sourceProductionWorkflowPlanId),
  );
  let scheduleStatus: OpsStepStatus;
  let scheduleHint: string | null;
  if (plansWithActiveTasks.length === 0) {
    scheduleStatus = 'na';
    scheduleHint = null;
  } else if (linkedSuggestions.length === 0) {
    scheduleStatus = 'missing';
    scheduleHint = '為製程規劃產生排程建議';
  } else {
    scheduleStatus = 'done';
    scheduleHint = null;
  }
  steps.push({
    key: 'scheduleSuggestion',
    status: scheduleStatus,
    count: linkedSuggestions.length,
    detailLines: capDetailLines(
      linkedSuggestions.map(
        (s) =>
          `${s.sourcePlanNameSnapshot}：${SCHEDULE_STATUS_LABEL[s.scheduleStatus]}，總工時 ${s.makespanMinutes} 分鐘`,
      ),
    ),
    nextActionHint: scheduleHint,
    linkTo: LINK_TO.scheduleSuggestion,
  });

  // ── 6. marketPrice ───────────────────────────────────────────────────
  const snapshot = data.marketSnapshot;
  const marketDone = snapshot != null && snapshot.entries.length > 0;
  steps.push({
    key: 'marketPrice',
    status: marketDone ? 'done' : 'missing',
    count: snapshot?.entries.length ?? 0,
    detailLines: marketDone
      ? capDetailLines([
          `共 ${snapshot!.entries.length} 項行情（${snapshot!.rocDate}）`,
          ...snapshot!.entries.slice(0, 3).map((e) => `${e.cropName}：${e.avgPrice ?? '無資料'} 元/公斤`),
        ])
      : [],
    nextActionHint: marketDone ? null : '開啟市場行情頁會自動抓取今日行情',
    linkTo: LINK_TO.marketPrice,
  });

  // ── Feature 069: 當日概況數字 ──────────────────────────────────────────
  let dishCount = 0;
  let headCount = 0;
  for (const m of dayMenus) {
    for (const r of m.menuRecipes ?? []) {
      dishCount++;
      if (r.servings > headCount) headCount = r.servings;
    }
  }
  const labor = summarizeLabor(data.workflowPlans.flatMap((p) => p.tasks ?? []));
  const summary: DailyOpsSummary = {
    dishCount,
    headCount,
    laborMinutes: labor.totalMinutes,
    activeTaskCount: labor.taskCount,
  };

  return { date, steps, summary };
}

// ── Firestore loader ─────────────────────────────────────────────────────────

/** Bound the number of per-plan schedule-suggestion reads to keep this page cheap. */
const MAX_SCHEDULE_PLAN_READS = 5;

/**
 * Loads and assembles the daily ops overview for `date` straight from
 * Firestore. Uses only existing list/get functions — no new queries or
 * indexes. Each source load is individually wrapped in try/catch: on
 * failure that source degrades to an empty/null value and a
 * "載入失敗：…" note is prepended to the corresponding step's detailLines
 * (the step is never allowed to throw the whole page down).
 */
export async function loadDailyOpsOverview(db: Firestore, date: string): Promise<DailyOpsOverview> {
  const failureNotes: Partial<Record<OpsStepKey, string>> = {};

  function describeError(err: unknown): string {
    return `載入失敗：${err instanceof Error ? err.message : String(err)}`;
  }

  async function safeLoad<T>(key: OpsStepKey, loader: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await loader();
    } catch (err) {
      failureNotes[key] = describeError(err);
      return fallback;
    }
  }

  const allMenus = await safeLoad('menu', () => listMenus(db), [] as RecipeMenu[]);
  const menus = allMenus.filter((m) => m.date === date);

  const allPrepPlans = await safeLoad('prepPlan', () => listPrepPlans(db), [] as PrepPlan[]);
  const prepPlans = allPrepPlans.filter((p) => p.date === date);

  const drafts = await safeLoad(
    'purchaseDraft',
    () => listPurchaseDemandDrafts(db),
    [] as PurchaseDemandDraft[],
  );

  const allWorkflowPlans = await safeLoad(
    'workflowPlan',
    () => listProductionWorkflowPlans(db),
    [] as ProductionWorkflowPlan[],
  );
  const workflowPlans = allWorkflowPlans.filter((p) => p.serviceDate === date);

  const marketSnapshot = await safeLoad(
    'marketPrice',
    () => getMarketPriceSnapshot(db, date),
    null as MarketPriceSnapshot | null,
  );

  // Schedule suggestions: only for plans linked to the day's prep plans (or
  // matching serviceDate) that actually have active tasks — bounded to
  // MAX_SCHEDULE_PLAN_READS plans to keep reads cheap.
  const prepPlanIds = new Set(prepPlans.map((p) => p.id));
  const linkedPlans = workflowPlans.filter(
    (p) => prepPlanIds.has(p.sourcePrepPlanId) || p.serviceDate === date,
  );
  const plansWithActiveTasks = linkedPlans
    .filter((p) => p.tasks.some((t) => t.taskStatus === 'active'))
    .slice(0, MAX_SCHEDULE_PLAN_READS);

  const scheduleSuggestions: ProductionScheduleSuggestion[] = [];
  for (const plan of plansWithActiveTasks) {
    try {
      const suggestions = await listProductionScheduleSuggestions(db, plan.id);
      if (suggestions.length > 0) scheduleSuggestions.push(suggestions[0]);
    } catch (err) {
      failureNotes.scheduleSuggestion = describeError(err);
    }
  }

  const overview = buildDailyOpsOverview(date, {
    menus,
    prepPlans,
    drafts,
    workflowPlans,
    scheduleSuggestions,
    marketSnapshot,
  });

  // Surface load failures on their step without throwing the whole page down.
  for (const step of overview.steps) {
    const note = failureNotes[step.key];
    if (!note) continue;
    if (step.status !== 'na') step.status = 'missing';
    step.detailLines = capDetailLines([note, ...step.detailLines]);
  }

  return overview;
}
