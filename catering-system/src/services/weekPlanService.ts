/**
 * weekPlanService — Feature 040: 週間規劃與多日彙總採購
 * (Week Planning View + Multi-Day Purchase Aggregation).
 *
 * Entirely read-only: it never writes any Firestore document. It only reads
 * already-existing collections via their existing list functions and links
 * records in memory (mirroring `dailyOpsService`'s linkage heuristics), plus
 * aggregates prep-plan demand across an arbitrary date range for reference
 * purchasing decisions. Pricing reuses `resolveIngredientPrice` from
 * `costAwareMenuSuggestionService` (Feature 033) — no new pricing logic.
 *
 * Chain linkage used for matching records to "a day" (same convention as
 * dailyOpsService):
 *   RecipeMenu.date === date && isActive
 *   PrepPlan.date === date && isActive, OR PrepPlan.sourceRecipeMenuId is one
 *     of that day's menu ids
 *   ProductionWorkflowPlan: active, with >=1 active task, where
 *     serviceDate === date OR sourcePrepPlanId is one of that day's prep plan ids
 */

import { type Firestore } from 'firebase/firestore';
import type {
  RecipeMenu,
  PrepPlan,
  ProductionWorkflowPlan,
  IngredientMaster,
  MarketPriceSnapshot,
} from './types';
import { listMenus } from './recipeMenuService';
import { listPrepPlans } from './prepPlanService';
import { listProductionWorkflowPlans } from './productionWorkflowService';
import { listIngredients } from './ingredientMasterService';
import { getMarketPriceSnapshot, todayLocalIsoDate } from './marketPriceService';
import { resolveIngredientPrice, type PriceSource } from './costAwareMenuSuggestionService';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ── Week math ────────────────────────────────────────────────────────────

/** Parses an ISO "YYYY-MM-DD" date string into a local Date (midnight, no TZ shift). */
function parseIsoDateLocal(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the ISO date of the Monday of the week containing `dateIso`. */
export function mondayOf(dateIso: string): string {
  const date = parseIsoDateLocal(dateIso);
  const day = date.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return toIsoDateLocal(date);
}

/** Returns the 7 ISO dates Monday..Sunday of the week starting at `mondayIso`. */
export function weekDates(mondayIso: string): string[] {
  const base = parseIsoDateLocal(mondayIso);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return toIsoDateLocal(d);
  });
}

const WEEKDAY_LABELS_MON_FIRST = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

// ── Week overview ────────────────────────────────────────────────────────

export interface WeekDaySummary {
  date: string;
  weekdayLabel: string;
  menuNames: string[];
  hasPrepPlan: boolean;
  hasWorkflowTasks: boolean;
}

/**
 * Builds a 7-day (Mon..Sun) overview of menus / prep plans / workflow tasks,
 * linking records to each day per the heuristics documented at the top of
 * this file (mirrors dailyOpsService). Pure — no Firestore access.
 */
export function buildWeekOverview(
  mondayIso: string,
  menus: RecipeMenu[],
  prepPlans: PrepPlan[],
  workflowPlans: ProductionWorkflowPlan[],
): WeekDaySummary[] {
  const dates = weekDates(mondayIso);
  const activeMenus = menus.filter((m) => m.isActive !== false);
  const activePrepPlans = prepPlans.filter((p) => p.isActive !== false);
  const activeWorkflowPlans = workflowPlans.filter((p) => p.isActive !== false);

  return dates.map((date, i) => {
    const dayMenus = activeMenus.filter((m) => m.date === date);
    const dayMenuIds = new Set(dayMenus.map((m) => m.id));

    const dayPrepPlans = activePrepPlans.filter(
      (p) => p.date === date || dayMenuIds.has(p.sourceRecipeMenuId),
    );
    const dayPrepPlanIds = new Set(dayPrepPlans.map((p) => p.id));

    const hasWorkflowTasks = activeWorkflowPlans.some(
      (p) =>
        (p.serviceDate === date || dayPrepPlanIds.has(p.sourcePrepPlanId)) &&
        p.tasks.some((t) => t.taskStatus === 'active'),
    );

    return {
      date,
      weekdayLabel: WEEKDAY_LABELS_MON_FIRST[i],
      menuNames: dayMenus.map((m) => m.name),
      hasPrepPlan: dayPrepPlans.length > 0,
      hasWorkflowTasks,
    };
  });
}

// ── Multi-day purchase demand aggregation ───────────────────────────────

export interface RangeDemandLine {
  ingredientId: string;
  ingredientName: string;
  totalBaseQuantity: number;
  baseUnit: string;
  /** Number of distinct source prep plans contributing to this line. */
  sourcePlanCount: number;
  /** Deduplicated source prep plan names, capped at 5. */
  sourcePlanNames: string[];
  pricePerBaseUnit: number | null;
  priceSource: PriceSource;
  /** totalBaseQuantity * pricePerBaseUnit, rounded to 2dp, or null when unpriced. */
  estimatedCost: number | null;
}

export interface RangeDemandSummary {
  startDate: string;
  endDate: string;
  /** Number of active prep plans within [startDate, endDate] that contributed. */
  planCount: number;
  /** Sorted by estimatedCost desc; unpriced lines (null cost) sorted last by name. */
  lines: RangeDemandLine[];
  totalEstimatedCost: number;
  unpricedLineCount: number;
}

/**
 * Aggregates `prepItems[].requiredBaseQuantity` across all ACTIVE prep plans
 * whose `date` falls within [startDate, endDate] (inclusive), grouped by
 * `${ingredientId}__${baseUnit}`. Pricing is resolved per-ingredient via
 * `resolveIngredientPrice` (Feature 033) — a missing ingredient master record
 * resolves to `priceSource: 'none'`. Pure — no Firestore access.
 */
export function aggregateRangeDemand(
  startDate: string,
  endDate: string,
  prepPlans: PrepPlan[],
  ingredients: IngredientMaster[],
  snapshot: MarketPriceSnapshot | null,
): RangeDemandSummary {
  const activePlans = prepPlans.filter(
    (p) => p.isActive !== false && p.date >= startDate && p.date <= endDate,
  );

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  interface Acc {
    ingredientId: string;
    ingredientName: string;
    totalBaseQuantity: number;
    baseUnit: string;
    planIds: Set<string>;
    planNames: string[];
  }
  const byKey = new Map<string, Acc>();

  for (const plan of activePlans) {
    for (const item of plan.prepItems) {
      const key = `${item.ingredientId}__${item.baseUnit}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientNameSnapshot,
          totalBaseQuantity: 0,
          baseUnit: item.baseUnit,
          planIds: new Set(),
          planNames: [],
        };
        byKey.set(key, acc);
      }
      acc.totalBaseQuantity += item.requiredBaseQuantity;
      if (!acc.planIds.has(plan.id)) {
        acc.planIds.add(plan.id);
        if (acc.planNames.length < 5) acc.planNames.push(plan.name);
      }
    }
  }

  const lines: RangeDemandLine[] = Array.from(byKey.values()).map((acc) => {
    const ing = ingredientMap.get(acc.ingredientId);
    const resolution = ing
      ? resolveIngredientPrice(ing, snapshot)
      : { pricePerBaseUnit: null, pricePerKg: null, source: 'none' as PriceSource };
    const estimatedCost =
      resolution.pricePerBaseUnit != null
        ? round2(acc.totalBaseQuantity * resolution.pricePerBaseUnit)
        : null;
    return {
      ingredientId: acc.ingredientId,
      ingredientName: acc.ingredientName,
      totalBaseQuantity: acc.totalBaseQuantity,
      baseUnit: acc.baseUnit,
      sourcePlanCount: acc.planIds.size,
      sourcePlanNames: acc.planNames,
      pricePerBaseUnit: resolution.pricePerBaseUnit,
      priceSource: resolution.source,
      estimatedCost,
    };
  });

  lines.sort((a, b) => {
    if (a.estimatedCost == null && b.estimatedCost == null) {
      return a.ingredientName.localeCompare(b.ingredientName, 'zh-TW');
    }
    if (a.estimatedCost == null) return 1;
    if (b.estimatedCost == null) return -1;
    return b.estimatedCost - a.estimatedCost;
  });

  const totalEstimatedCost = round2(
    lines.reduce((sum, l) => sum + (l.estimatedCost ?? 0), 0),
  );
  const unpricedLineCount = lines.filter((l) => l.estimatedCost == null).length;

  return {
    startDate,
    endDate,
    planCount: activePlans.length,
    lines,
    totalEstimatedCost,
    unpricedLineCount,
  };
}

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  market: '市價',
  default: '基準價',
  none: '無',
};

/**
 * CSV export for a RangeDemandSummary. Follows the same escaping convention
 * as `draftToCsv` (Feature 016, `src/utils/purchaseDemandDraftExport.ts`) —
 * quote fields containing commas/quotes/newlines, double up embedded quotes.
 * The BOM prefix is applied by the shared `downloadCsv` helper at download
 * time, not by this function.
 */
export function rangeDemandToCsv(summary: RangeDemandSummary): string {
  const header = ['食材', '總需求量', '單位', '預估單價', '價格來源', '預估金額', '來源快照數'];
  const rows = summary.lines.map((line) => [
    line.ingredientName,
    String(line.totalBaseQuantity),
    line.baseUnit,
    line.pricePerBaseUnit != null ? String(line.pricePerBaseUnit) : '',
    PRICE_SOURCE_LABEL[line.priceSource],
    line.estimatedCost != null ? String(line.estimatedCost) : '',
    String(line.sourcePlanCount),
  ]);
  return [header, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\n');
}

// ── Firestore loader ─────────────────────────────────────────────────────

export interface WeekPlanData {
  menus: RecipeMenu[];
  prepPlans: PrepPlan[];
  workflowPlans: ProductionWorkflowPlan[];
  ingredients: IngredientMaster[];
  marketSnapshot: MarketPriceSnapshot | null;
}

/**
 * Loads all data needed to render the week overview + range demand
 * aggregation. Uses only existing list functions — no new queries/indexes.
 * Each source load is individually wrapped in try/catch and degrades to an
 * empty/null fallback on failure, so a single failing read never breaks the
 * whole page (mirrors dailyOpsService's `safeLoad`).
 */
export async function loadWeekPlanData(db: Firestore): Promise<WeekPlanData> {
  async function safeLoad<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await loader();
    } catch {
      return fallback;
    }
  }

  const menus = await safeLoad(() => listMenus(db), [] as RecipeMenu[]);
  const prepPlans = await safeLoad(() => listPrepPlans(db), [] as PrepPlan[]);
  const workflowPlans = await safeLoad(
    () => listProductionWorkflowPlans(db),
    [] as ProductionWorkflowPlan[],
  );
  const ingredients = await safeLoad(() => listIngredients(db), [] as IngredientMaster[]);
  const marketSnapshot = await safeLoad(
    () => getMarketPriceSnapshot(db, todayLocalIsoDate()),
    null as MarketPriceSnapshot | null,
  );

  return { menus, prepPlans, workflowPlans, ingredients, marketSnapshot };
}
