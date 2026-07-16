/**
 * DailyOpsPage — 每日工作總覽 (Feature 038: Daily Ops Cockpit)
 *
 * Single read-only page showing, for a chosen date, the status of the whole
 * operating chain: 菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市價快取,
 * with next-action hints and links into the relevant feature pages.
 *
 * Entirely read-only — no writes are performed from this page.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Soup,
  PackageCheck,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { loadDailyOpsOverview, type OpsStepKey, type OpsStepStatus } from '@/services/dailyOpsService';
import type { DailyOpsOverview } from '@/services/dailyOpsService';
import { getMarketPriceSnapshot, todayLocalIsoDate } from '@/services/marketPriceService';
import { listMenus } from '@/services/recipeMenuService';
import { listRecipes } from '@/services/recipeService';
import { listIngredients } from '@/services/ingredientMasterService';
import { estimateMenusCost, type MenusCostEstimate } from '@/services/costAwareMenuSuggestionService';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const STEP_TITLE: Record<OpsStepKey, string> = {
  menu: '當日菜單',
  prepPlan: '備料快照',
  purchaseDraft: '採購需求草稿',
  workflowPlan: '製程規劃',
  scheduleSuggestion: '排程建議',
  marketPrice: '市場行情',
};

function StatusIcon({ status }: { status: OpsStepStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={20} className="shrink-0 text-green-600" />;
    case 'partial':
      return <AlertTriangle size={20} className="shrink-0 text-amber-500" />;
    case 'missing':
      return <XCircle size={20} className="shrink-0 text-red-500" />;
    case 'na':
      return <MinusCircle size={20} className="shrink-0 text-muted-foreground/40" />;
  }
}

const STATUS_BADGE_CLASS: Record<OpsStepStatus, string> = {
  done: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  missing: 'bg-red-100 text-red-700',
  na: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<OpsStepStatus, string> = {
  done: '完成',
  partial: '部分完成',
  missing: '尚未建立',
  na: '不適用',
};

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function DailyOpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDateState] = useState(searchParams.get('date') || todayLocalIsoDate());

  /** 換日期同步回網址，重新整理/分享連結不會跳回今天。 */
  function setDate(next: string) {
    setDateState(next);
    setSearchParams(next === todayLocalIsoDate() ? {} : { date: next }, { replace: true });
  }
  const [overview, setOverview] = useState<DailyOpsOverview | null>(null);
  const [menusCost, setMenusCost] = useState<MenusCostEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(targetDate: string) {
    setLoading(true);
    setError(null);
    setMenusCost(null);
    try {
      const result = await loadDailyOpsOverview(db, targetDate);
      setOverview(result);
    } catch {
      setError('載入每日工作總覽失敗，請稍後再試');
      setOverview(null);
    } finally {
      setLoading(false);
    }

    // Feature 070: 當日食材成本（best-effort；失敗不影響主總覽）
    try {
      const [allMenus, recipes, ingredients, snap] = await Promise.all([
        listMenus(db),
        listRecipes(db),
        listIngredients(db),
        getMarketPriceSnapshot(db, targetDate).catch(() => null),
      ]);
      const dayMenus = allMenus.filter((m) => m.date === targetDate);
      const recipeById = new Map(recipes.map((r) => [r.id, r]));
      const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
      setMenusCost(estimateMenusCost(dayMenus, recipeById, ingredientById, snap));
    } catch {
      setMenusCost(null);
    }
  }

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const applicableSteps = overview?.steps.filter((s) => s.status !== 'na') ?? [];
  const doneCount = applicableSteps.filter((s) => s.status === 'done').length;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <ListChecks size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">每日工作總覽</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            檢視所選日期的供膳作業鏈狀態：菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市場行情。
          </p>
        </div>
      </div>

      {/* Feature 069: 當日概況——一眼掌握規模（菜色/份數/人力） */}
      {overview && !loading && (overview.summary.dishCount > 0 || overview.summary.activeTaskCount > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md border bg-muted/20 px-3 py-1.5">
            菜色 <span className="font-semibold tabular-nums">{overview.summary.dishCount}</span> 道
          </span>
          {overview.summary.headCount > 0 && (
            <span className="rounded-md border bg-muted/20 px-3 py-1.5">
              出餐 <span className="font-semibold tabular-nums">{overview.summary.headCount}</span> 份
            </span>
          )}
          {overview.summary.activeTaskCount > 0 && (
            <span className="rounded-md border bg-muted/20 px-3 py-1.5">
              製程人力 <span className="font-semibold tabular-nums">{overview.summary.laborMinutes}</span> 人·分
              <span className="ml-1 text-xs text-muted-foreground">（{overview.summary.activeTaskCount} 項任務）</span>
            </span>
          )}
          {menusCost && menusCost.pricedDishCount > 0 && (
            <span className="rounded-md border bg-muted/20 px-3 py-1.5">
              當日食材成本 約 <span className="font-semibold tabular-nums">${menusCost.totalCost.toLocaleString()}</span>
              {!menusCost.complete && (
                <span className="ml-1 text-xs text-amber-600" title="部分菜色或食材無價，實際成本可能更高">*</span>
              )}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDate(addDaysIso(date, -1))} aria-label="前一天">
          <ChevronLeft size={15} />
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[170px]"
        />
        <Button variant="outline" size="sm" onClick={() => setDate(addDaysIso(date, 1))} aria-label="後一天">
          <ChevronRight size={15} />
        </Button>
        {date !== todayLocalIsoDate() && (
          <Button variant="outline" size="sm" onClick={() => setDate(todayLocalIsoDate())}>
            今天
          </Button>
        )}
        {overview && !loading && (
          <span className="text-sm text-muted-foreground">
            {doneCount}/{applicableSteps.length} 步驟完成
          </span>
        )}
      </div>

      {/* Feature 056: 當日常用動作——看完狀態不再是死路 */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/prep-plans"
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Soup size={13} /> 出餐扣料（備料快照）
        </Link>
        <Link
          to="/purchase"
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <PackageCheck size={13} /> 收貨入庫（採購管理）
        </Link>
        <Link
          to="/market-prices"
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <TrendingUp size={13} /> 更新今日市價
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        overview && (
          <div className="flex flex-col gap-3">
            {overview.steps.map((step) => (
              <div
                key={step.key}
                className="rounded-lg border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={step.status} />
                    <span className="font-medium">{STEP_TITLE[step.key]}</span>
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_BADGE_CLASS[step.status],
                      ].join(' ')}
                    >
                      {STATUS_LABEL[step.status]}
                    </span>
                    {step.status !== 'na' && (
                      <span className="text-xs text-muted-foreground">{step.count} 筆</span>
                    )}
                  </div>
                  <Link
                    to={step.linkTo}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    前往
                    <ArrowRight size={12} />
                  </Link>
                </div>

                {step.detailLines.length > 0 && (
                  <ul className="ml-[30px] space-y-0.5 text-sm text-muted-foreground">
                    {step.detailLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}

                {step.nextActionHint && (
                  <div className="ml-[30px] rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    <Link to={step.linkTo} className="hover:underline">
                      {step.nextActionHint} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
