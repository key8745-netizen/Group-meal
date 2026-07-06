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
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { db } from '@/lib/firebase';
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
import { downloadCsv } from '@/utils/purchaseDemandDraftExport';
import { Button } from '@/components/ui/button';
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
  const [monday, setMonday] = useState(() => mondayOf(todayLocalIsoDate()));
  const [data, setData] = useState<WeekPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeStart, setRangeStart] = useState(monday);
  const [rangeEnd, setRangeEnd] = useState(() => weekDates(monday)[6]);
  const [demandSummary, setDemandSummary] = useState<RangeDemandSummary | null>(null);
  const [demandGenerated, setDemandGenerated] = useState(false);

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

  return (
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">週間規劃</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            檢視一週的菜單、備料快照與製程規劃狀態，並可跨日彙總備料需求供採購參考。
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setMonday(addDaysIso(monday, -7))}>
          <ChevronLeft size={16} className="mr-1" />
          上週
        </Button>
        <span className="text-sm font-medium">本週（{weekLabel}）</span>
        <Button variant="outline" size="sm" onClick={() => setMonday(addDaysIso(monday, 7))}>
          下週
          <ChevronRight size={16} className="ml-1" />
        </Button>
      </div>

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
              <Button variant="outline" onClick={handleExportCsv}>
                <Download size={14} className="mr-1.5" />
                匯出 CSV
              </Button>
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
            彙總僅供採購參考，不會建立採購需求草稿。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
