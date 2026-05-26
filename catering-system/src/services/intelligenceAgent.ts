/**
 * intelligenceAgent.ts
 *
 * Automated diagnostic service that analyses operational performance and
 * generates actionable insights.  The entry point `runDailyAnalysis` is
 * intentionally a plain async function so it can be called directly from a
 * Firebase Cloud Functions scheduled trigger with zero extra wiring:
 *
 *   // functions/src/scheduledReport.ts
 *   import * as functions from 'firebase-functions';
 *   import { getFirestore } from 'firebase-admin/firestore';
 *   import { runDailyAnalysis } from '../../catering-system/src/services/intelligenceAgent';
 *
 *   export const dailyReport = functions.scheduler
 *     .onSchedule('every day 08:00', async () => {
 *       const db = getFirestore();
 *       const insights = await runDailyAnalysis(db as unknown as Firestore);
 *       // push to admin dashboard, send email, etc.
 *     });
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import type { Menu } from './types';
import { getPeriodPerformance } from './performanceService';
import { configService } from './configService';

// ─── Public types ─────────────────────────────────────────────────────────────

export type InsightType     = 'ALERT' | 'OPTIMIZATION' | 'DATA_WARNING';
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Insight {
  type:        InsightType;
  message:     string;
  priority:    InsightPriority;
  generatedAt: Date;
}

export interface AnalysisPeriod {
  startDate: Date;
  endDate:   Date;
}

// ─── Thresholds (centralised so callers can override in tests) ────────────────

export const THRESHOLDS = {
  /** Profit margin below this triggers a HIGH/MEDIUM alert */
  lowMargin:         0.20,
  /** Profit margin below this half-threshold triggers HIGH (vs MEDIUM) */
  criticalMargin:    0.10,
  /** BOM wasteFactor above this triggers an OPTIMIZATION insight */
  highWasteFactor:   0.30,
} as const;

// ─── Internal helpers ─────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<InsightPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function byPriority(a: Insight, b: Insight): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function insight(
  type: InsightType,
  message: string,
  priority: InsightPriority,
): Insight {
  return { type, message, priority, generatedAt: new Date() };
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

// ─── analyzePerformance ───────────────────────────────────────────────────────

/**
 * Analyses overall profitability for the given period.
 * Thresholds are read from Firestore settings when tenantId is provided,
 * falling back to THRESHOLDS for direct/test calls.
 *
 * Generates:
 *  - DATA_WARNING  when ingredient cost data is incomplete
 *  - ALERT         when gross margin falls below the configured threshold
 */
export async function analyzePerformance(
  db:        Firestore,
  period:    AnalysisPeriod,
  tenantId?: string,
): Promise<Insight[]> {
  const insights: Insight[] = [];

  const [result, settings] = await Promise.all([
    getPeriodPerformance(db, period.startDate, period.endDate),
    tenantId ? configService.getSettings(db, tenantId) : Promise.resolve(null),
  ]);

  const lowMargin  = settings?.profitMarginThreshold ?? THRESHOLDS.lowMargin;
  const criticalMargin = lowMargin / 2;

  // ── Data completeness warning ────────────────────────────────────────────
  if (result.hasIncompleteData) {
    const names = result.missingIngredientNames.length > 0
      ? `（${result.missingIngredientNames.join('、')}）`
      : '';
    insights.push(insight(
      'DATA_WARNING',
      `成本資料不全：以下食材缺少進貨單價，毛利數據僅供參考${names}。請至食材管理頁面補齊單價。`,
      'MEDIUM',
    ));
  }

  // ── No orders in period — nothing more to evaluate ───────────────────────
  if (result.orderCount === 0) {
    return insights;
  }

  // ── Profit margin threshold detection ────────────────────────────────────
  if (result.profitMargin < lowMargin) {
    const isCritical = result.profitMargin < criticalMargin;
    insights.push(insight(
      'ALERT',
      `整體毛利率偏低：${pct(result.profitMargin)}，` +
      `低於警示門檻 ${pct(lowMargin)}。` +
      `（期間營收 NT$${result.totalRevenue.toLocaleString('zh-TW')}，` +
      `食材成本 NT$${result.totalCost.toLocaleString('zh-TW')}）`,
      isCritical ? 'HIGH' : 'MEDIUM',
    ));
  }

  return insights;
}

// ─── suggestOptimization ──────────────────────────────────────────────────────

/**
 * Inspects a single menu's BOM for high-waste ingredients and returns
 * improvement suggestions.  Uses the tenant's wasteFactorWarning setting
 * when tenantId is provided.
 */
export async function suggestOptimization(
  db:        Firestore,
  menuId:    string,
  tenantId?: string,
): Promise<Insight[]> {
  const insights: Insight[] = [];

  const [menuSnap, settings] = await Promise.all([
    getDoc(doc(db, 'menus', menuId)),
    tenantId ? configService.getSettings(db, tenantId) : Promise.resolve(null),
  ]);

  if (!menuSnap.exists()) return insights;

  const menu            = { id: menuSnap.id, ...menuSnap.data() } as Menu;
  const wasteThreshold  = settings?.wasteFactorWarning ?? THRESHOLDS.highWasteFactor;

  for (const bom of menu.ingredients) {
    if (bom.wasteFactor > wasteThreshold) {
      insights.push(insight(
        'OPTIMIZATION',
        `【${menu.name}】${bom.ingredientName} 的損耗率為 ${pct(bom.wasteFactor)}，` +
        `超過建議上限 ${pct(wasteThreshold)}。` +
        `建議檢視備料流程或調整食材規格，可降低每份成本。`,
        bom.wasteFactor >= 0.5 ? 'HIGH' : 'MEDIUM',
      ));
    }
  }

  return insights;
}

// ─── runDailyAnalysis ─────────────────────────────────────────────────────────

/**
 * Schedulable entry point — designed to be called from a Cloud Functions
 * scheduled trigger every morning.
 *
 * Runs:
 *  1. Period analysis for the previous calendar day (thresholds from Firestore)
 *  2. Waste optimisation scan over every active menu
 *
 * Returns all insights sorted by priority (HIGH → MEDIUM → LOW).
 */
export async function runDailyAnalysis(
  db:        Firestore,
  tenantId?: string,
): Promise<Insight[]> {
  // ── Build yesterday's date range (local midnight → 23:59:59.999) ─────────
  const now       = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0,  0,  0,   0);
  const endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);

  const period: AnalysisPeriod = { startDate, endDate };

  // ── Run performance analysis + fetch menus concurrently ─────────────────
  const [performanceInsights, menuSnaps] = await Promise.all([
    analyzePerformance(db, period, tenantId),
    getDocs(collection(db, 'menus')),
  ]);

  const menuIds = menuSnaps.docs.map((d) => d.id);

  const optimizationInsights = (
    await Promise.all(menuIds.map((id) => suggestOptimization(db, id, tenantId)))
  ).flat();

  return [...performanceInsights, ...optimizationInsights].sort(byPriority);
}
