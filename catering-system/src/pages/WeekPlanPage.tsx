/**
 * WeekPlanPage — 週間規劃 (Feature 040: Week Planning View + Multi-Day
 * Purchase Aggregation).
 *
 * Entirely read-only — no writes are performed from this page. Shows a
 * Mon..Sun week grid (menus / prep plan / workflow task status per day,
 * linking into the daily ops page) plus a multi-day purchase demand
 * aggregation panel that reuses the Feature 033 pricing logic. The
 * aggregation is a reference-only view — it never creates a purchase
 * demand draft.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Rocket, ShoppingCart, CheckCircle2, XCircle, Loader2, MinusCircle, Circle } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import {
  mondayOf,
  weekDates,
  buildWeekOverview,
  aggregateRangeDemand,
  rangeDemandToCsv,
  loadWeekPlanData,
  type WeekDaySummary,
  type WeekPlanData,
  type RangeDemandSummary,
} from '@/services/weekPlanService';
import { todayLocalIsoDate } from '@/services/marketPriceService';
import {
  runWeekStart,
  createOrderFromRangeDemand,
  loadStockKgByIngredientId,
  WEEK_START_STATUS_LABELS,
  type WeekStartDayResult,
} from '@/services/weekStartService';
import { planRangeOrder } from '@/services/draftToPurchaseOrderPlanner';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { downloadCsv } from '@/utils/purchaseDemandDraftExport';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';

const PRICE_SOURCE_BADGE_LABEL: Record<'market' | 'default' | 'none', string> = {
  market: '市價',
  default: '基準價',
  none: '無資料',
};

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function WeekPlanPage() {
  const { confirm, confirmDialog } = useConfirm();
  const [monday, setMonday] = useState(() => mondayOf(todayLocalIsoDate()));
  const [data, setData] = useState<WeekPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeStart, setRangeStart] = useState(monday);
  const [rangeEnd, setRangeEnd] = useState(() => weekDates(monday)[6]);
  const [demandSummary, setDemandSummary] = useState<RangeDemandSummary | null>(null);
  const [demandGenerated, setDemandGenerated] = useState(false);

  const [weekStarting, setWeekStarting] = useState(false);
  const [weekStartResults, setWeekStartResults] = useState<WeekStartDayResult[] | null>(null);
  const [fallbackHeadCount, setFallbackHeadCount] = useState(100);
  const [creatingOrder, setCreatingOrder] = useState(false);

  function reloadData() {
    setLoading(true);
    setError(null);
    loadWeekPlanData(db)
      .then(setData)
      .catch(() => setError('載入週間規劃資料失敗，請稍後再試'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadWeekPlanData(db)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError('載入週間規劃資料失敗，請稍後再試');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the demand-range inputs defaulted to the currently displayed week
  // whenever the user navigates weeks (but don't clobber a user edit within
  // the same week).
  useEffect(() => {
    setRangeStart(monday);
    setRangeEnd(weekDates(monday)[6]);
    setDemandSummary(null);
    setDemandGenerated(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  const dates = useMemo(() => weekDates(monday), [monday]);
  const weekLabel = `${dates[0]} ~ ${dates[6]}`;

  const days: WeekDaySummary[] = useMemo(() => {
    if (!data) return [];
    return buildWeekOverview(monday, data.menus, data.prepPlans, data.workflowPlans);
  }, [monday, data]);

  function handleGenerateDemand() {
    if (!data) return;
    const summary = aggregateRangeDemand(rangeStart, rangeEnd, data.prepPlans, data.ingredients, data.marketSnapshot);
    setDemandSummary(summary);
    setDemandGenerated(true);
  }

  function handleExportCsv() {
    if (!demandSummary) return;
    downloadCsv(`多日採購彙總_${demandSummary.startDate}_${demandSummary.endDate}.csv`, rangeDemandToCsv(demandSummary));
  }

  async function handleWeekStart() {
    const uid = auth.currentUser?.uid ?? '';
    const proceed = await confirm({
      title: `整週一鍵開工（${weekLabel}）`,
      description: '將依月菜單為本週每一天自動建立：菜單 → 備料 → 採購需求（扣庫存）→ 製程 → 排程。\n已有菜單或月菜單沒排菜的日子會略過。',
      confirmLabel: '開始開工',
    });
    if (!proceed) return;
    setWeekStarting(true);
    setWeekStartResults(dates.map((date) => ({ date, status: 'pending', detail: '' })));
    try {
      await runWeekStart(db, dates, fallbackHeadCount, uid, setWeekStartResults);
    } finally {
      setWeekStarting(false);
      reloadData();
    }
  }

  async function handleCreateOrderFromDemand() {
    if (!demandSummary) return;
    const uid = auth.currentUser?.uid ?? '';
    setCreatingOrder(true);
    try {
      const stock = await loadStockKgByIngredientId(db);
      const preview = planRangeOrder(
        demandSummary.lines.map((l) => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          baseUnit: l.baseUnit,
          totalBaseQuantity: l.totalBaseQuantity,
        })),
        stock,
      );
      if (preview.lines.length === 0) {
        toast({ title: '沒有可轉換的品項', description: '扣庫存後淨需求皆為 0，或皆為個數單位。' });
        return;
      }
      const skippedNote = preview.skipped.length > 0
        ? `\n略過 ${preview.skipped.length} 項：${preview.skipped.map((s) => s.ingredientName).join('、')}`
        : '';
      const proceed = await confirm({
        title: '彙總建立採購單',
        description: `將建立正式採購單（待採購）：${preview.lines.length} 項食材`
          + (preview.nettedCount > 0 ? `（${preview.nettedCount} 項已扣庫存，${preview.coveredCount} 項庫存足夠免採購）` : '')
          + `。${skippedNote}`,
        confirmLabel: '建立採購單',
      });
      if (!proceed) return;
      const result = await createOrderFromRangeDemand(db, demandSummary, uid);
      toast({
        title: '已建立採購單',
        description: `${result.lineCount} 項食材已轉入採購管理（待採購）；收貨時會自動入庫。`,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: '建立採購單失敗', description: err instanceof Error ? err.message : '' });
    } finally {
      setCreatingOrder(false);
    }
  }

  function weekStartIcon(status: WeekStartDayResult['status']) {
    switch (status) {
      case 'done': return <CheckCircle2 size={14} className="text-green-600" />;
      case 'partial': case 'failed': return <XCircle size={14} className="text-red-600" />;
      case 'running': return <Loader2 size={14} className="animate-spin text-primary" />;
      case 'skippedExisting': case 'skippedNoDishes': return <MinusCircle size={14} className="text-muted-foreground/50" />;
      default: return <Circle size={14} className="text-muted-foreground/40" />;
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">週間規劃</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            檢視一週的菜單、備料快照與製程規劃狀態，並可跨日彙總備料需求供採購參考。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setMonday(addDaysIso(monday, -7))}>
          <ChevronLeft size={16} className="mr-1" />
          上週
        </Button>
        <span className="text-sm font-medium">本週（{weekLabel}）</span>
        <Button variant="outline" size="sm" onClick={() => setMonday(addDaysIso(monday, 7))}>
          下週
          <ChevronRight size={16} className="ml-1" />
        </Button>
        <span className="mx-1 h-5 border-l" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          預設人數
          <Input
            type="number"
            min={1}
            value={fallbackHeadCount}
            onChange={(e) => setFallbackHeadCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-8 w-20 text-sm"
          />
        </label>
        <Button size="sm" className="gap-1.5" onClick={handleWeekStart} disabled={weekStarting || loading}>
          <Rocket size={13} />
          {weekStarting ? '整週開工中…' : '整週一鍵開工'}
        </Button>
      </div>

      {weekStartResults && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">整週開工進度（依月菜單）</h2>
          <ul className="space-y-1.5">
            {weekStartResults.map((r) => (
              <li key={r.date} className="flex items-start gap-2 text-sm">
                {weekStartIcon(r.status)}
                <span className="w-24 shrink-0 font-medium">{r.date}</span>
                <span className="text-muted-foreground">
                  {WEEK_START_STATUS_LABELS[r.status]}{r.detail ? `——${r.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {!weekStarting && (
            <p className="mt-3 text-xs text-muted-foreground">
              人數優先取月菜單的用餐基準，未設定時用上方「預設人數」。完成的日子可到每日工作總覽檢視；
              下方可彙總整週需求、扣庫存後一鍵建採購單。
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((day) => (
            <Link
              key={day.date}
              to={`/daily-ops?date=${day.date}`}
              className="rounded-lg border bg-card p-3 flex flex-col gap-2 hover:border-primary/50 hover:shadow-sm transition-colors"
            >
              <div>
                <div className="text-xs text-muted-foreground">{day.weekdayLabel}</div>
                <div className="text-sm font-medium">{day.date}</div>
              </div>
              {day.menuNames.length > 0 ? (
                <ul className="text-xs space-y-0.5">
                  {day.menuNames.map((name, i) => (
                    <li key={i} className="truncate" title={name}>{name}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground/60">無菜單</div>
              )}
              <div className="mt-auto flex gap-1.5">
                <Badge variant={day.hasPrepPlan ? 'secondary' : 'outline'} className="text-[10px]">
                  備料{day.hasPrepPlan ? '✓' : '─'}
                </Badge>
                <Badge variant={day.hasWorkflowTasks ? 'secondary' : 'outline'} className="text-[10px]">
                  製程{day.hasWorkflowTasks ? '✓' : '─'}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">多日採購彙總</CardTitle>
          <p className="text-xs text-muted-foreground">
            彙總所選日期範圍內的備料快照需求，估算合計採購金額。
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">起始日期</label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="max-w-[160px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">結束日期</label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="max-w-[160px]" />
            </div>
            <Button onClick={handleGenerateDemand} disabled={!data || rangeStart > rangeEnd}>
              產生彙總
            </Button>
            {demandSummary && demandSummary.lines.length > 0 && (
              <>
                <Button variant="outline" onClick={handleExportCsv}>
                  <Download size={14} className="mr-1.5" />
                  匯出 CSV
                </Button>
                <Button onClick={handleCreateOrderFromDemand} disabled={creatingOrder} className="gap-1.5">
                  <ShoppingCart size={14} />
                  {creatingOrder ? '建立中…' : '扣庫存建採購單'}
                </Button>
              </>
            )}
          </div>

          {demandGenerated && demandSummary && (
            demandSummary.lines.length === 0 ? (
              <div className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
                範圍內尚無備料快照
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>食材</TableHead>
                      <TableHead>總需求量</TableHead>
                      <TableHead>預估單價</TableHead>
                      <TableHead>預估金額</TableHead>
                      <TableHead>來源快照</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demandSummary.lines.map((line) => (
                      <TableRow key={`${line.ingredientId}__${line.baseUnit}`}>
                        <TableCell className="font-medium">{line.ingredientName}</TableCell>
                        <TableCell>
                          {line.totalBaseQuantity} {line.baseUnit}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {line.pricePerBaseUnit != null ? (
                              <span>{line.pricePerBaseUnit}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {PRICE_SOURCE_BADGE_LABEL[line.priceSource]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {line.estimatedCost != null ? `NT$ ${line.estimatedCost}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {line.sourcePlanNames.join('、')}
                          {line.sourcePlanCount > line.sourcePlanNames.length ? ` 等 ${line.sourcePlanCount} 筆` : ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">
                    共 {demandSummary.planCount} 筆備料快照
                    {demandSummary.unpricedLineCount > 0 && `，${demandSummary.unpricedLineCount} 項無價格資料`}
                  </span>
                  <span className="font-medium">預估總金額：NT$ {demandSummary.totalEstimatedCost}</span>
                </div>
              </div>
            )
          )}

          <p className="text-xs text-muted-foreground/70">
            「扣庫存建採購單」會先以現有庫存淨化需求，只買缺的量；建立前有預覽確認，
            採購單在採購管理仍可調整或取消。
          </p>
        </CardContent>
      </Card>

      <Toaster />
      {confirmDialog}
    </div>
  );
}
