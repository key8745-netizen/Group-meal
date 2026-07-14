import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart2, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Ingredient, IngredientMaster, InventoryTransaction } from '@/services/types';
import { resolveIngredientPrice } from '@/services/costAwareMenuSuggestionService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TxRecord extends InventoryTransaction {
  ingredientId: string;
  ingredientName: string;
  unitCost: number;
  costAmount: number; // abs(quantity) * unitCost
}

interface DailyPoint { date: string; cost: number }
interface TopItem { ingredientId: string; ingredientName: string; totalKg: number; totalCost: number }
interface AvgRow { ingredientId: string; ingredientName: string; avgDailyKg: number; avgDailyCost: number }

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

const fmtKg = (n: number) => `${n.toFixed(3)} kg`;

function htmlDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Parse an html date string as local midnight */
function parseHtmlDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function dateKey(d: Date) {
  return htmlDate(d);
}

function dateLabel(key: string) {
  const [, m, day] = key.split('-');
  return `${parseInt(m)}/${parseInt(day)}`;
}

function tickFormatter(v: number) {
  if (v === 0) return '0';
  if (v >= 10000) return `${(v / 10000).toFixed(0)}萬`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export default function Analytics() {
  const [rangeStart, setRangeStart] = useState(() => htmlDate(addDays(new Date(), -29)));
  const [rangeEnd,   setRangeEnd]   = useState(() => htmlDate(new Date()));

  const [loading, setLoading] = useState(true);
  const [allRecords, setAllRecords] = useState<TxRecord[]>([]);
  const [unpricedNames, setUnpricedNames] = useState<string[]>([]);

  // ── Fetch all transactions once; filter in memory ──────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inventorySnap, ingredientSnap] = await Promise.all([
        getDocs(collection(db, 'inventory')),
        getDocs(collection(db, 'ingredients')),
      ]);

      const ingMap = new Map<string, Ingredient>();
      ingredientSnap.docs.forEach(d => ingMap.set(d.id, { id: d.id, ...d.data() } as Ingredient));

      const unpriced = new Set<string>();
      const txArrays = await Promise.all(
        inventorySnap.docs.map(async invDoc => {
          const txSnap = await getDocs(
            collection(db, 'inventory', invDoc.id, 'transactions'),
          );
          const ing = ingMap.get(invDoc.id);
          const ingredientName = (invDoc.data().ingredientName as string) ?? invDoc.id;
          // 單價來源優先序：舊欄位 unitCost（NT$/kg）→ 食材主檔 defaultPrice
          // 換算成每公斤（resolveIngredientPrice，Feature 041 之後的主要來源）→ 0。
          const legacyUnitCost = typeof ing?.unitCost === 'number' && ing.unitCost > 0 ? ing.unitCost : null;
          const resolvedPerKg = ing
            ? resolveIngredientPrice(ing as unknown as IngredientMaster, null).pricePerKg
            : null;
          const unitCost = legacyUnitCost ?? resolvedPerKg ?? 0;

          const records = txSnap.docs.flatMap(txDoc => {
            const tx = txDoc.data() as InventoryTransaction;
            if (!tx.timestamp) return [];
            return [{
              ...tx,
              ingredientId: invDoc.id,
              ingredientName,
              unitCost,
              costAmount: Math.abs(tx.quantity) * unitCost,
            } satisfies TxRecord];
          });
          if (unitCost === 0 && records.length > 0) unpriced.add(ingredientName);
          return records;
        }),
      );

      setAllRecords(txArrays.flat());
      setUnpricedNames([...unpriced].sort((a, b) => a.localeCompare(b, 'zh-TW')));
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived: filter to selected date range ─────────────────────────────────

  const startDate = useMemo(() => parseHtmlDate(rangeStart), [rangeStart]);
  const endDate   = useMemo(() => endOfDay(parseHtmlDate(rangeEnd)), [rangeEnd]);

  const rangeDays = useMemo(
    () => Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 864e5)),
    [startDate, endDate],
  );

  const rangeRecords = useMemo(
    () => allRecords.filter(tx => {
      const d = tx.timestamp.toDate();
      return d >= startDate && d <= endDate;
    }),
    [allRecords, startDate, endDate],
  );

  const deductRecords = useMemo(
    () => rangeRecords.filter(tx => tx.type === 'deduct'),
    [rangeRecords],
  );

  const wasteRecords = useMemo(
    () => rangeRecords
      .filter(tx => tx.type === 'adjustment' && tx.quantity < 0)
      .sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime()),
    [rangeRecords],
  );

  // ── Week-over-week KPIs (always use last 14 days from today) ───────────────

  const { thisWeekCost, lastWeekCost } = useMemo(() => {
    const now = new Date();
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    const lastWeekEnd   = endOfDay(addDays(thisWeekStart, -1));

    let tw = 0, lw = 0;
    allRecords
      .filter(tx => tx.type === 'deduct')
      .forEach(tx => {
        const d = tx.timestamp.toDate();
        if (d >= thisWeekStart) tw += tx.costAmount;
        else if (d >= lastWeekStart && d <= lastWeekEnd) lw += tx.costAmount;
      });
    return { thisWeekCost: tw, lastWeekCost: lw };
  }, [allRecords]);

  const weekChangePct = lastWeekCost === 0
    ? null
    : ((thisWeekCost - lastWeekCost) / lastWeekCost) * 100;

  // ── Chart data: daily cost within selected range ───────────────────────────

  const chartData = useMemo<DailyPoint[]>(() => {
    const map = new Map<string, number>();
    // Initialise every day in range with 0
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      map.set(dateKey(new Date(d)), 0);
    }
    deductRecords.forEach(tx => {
      const k = dateKey(tx.timestamp.toDate());
      map.set(k, (map.get(k) ?? 0) + tx.costAmount);
    });
    return Array.from(map.entries()).map(([k, cost]) => ({
      date: dateLabel(k),
      cost: Math.round(cost),
    }));
  }, [deductRecords, startDate, endDate]);

  // ── Top 5 by cost ──────────────────────────────────────────────────────────

  const top5 = useMemo<TopItem[]>(() => {
    const map = new Map<string, TopItem>();
    deductRecords.forEach(tx => {
      const r = map.get(tx.ingredientId);
      if (r) { r.totalKg += Math.abs(tx.quantity); r.totalCost += tx.costAmount; }
      else map.set(tx.ingredientId, {
        ingredientId: tx.ingredientId,
        ingredientName: tx.ingredientName,
        totalKg: Math.abs(tx.quantity),
        totalCost: tx.costAmount,
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost).slice(0, 5);
  }, [deductRecords]);

  // ── Average daily consumption ──────────────────────────────────────────────

  const avgRows = useMemo<AvgRow[]>(() => {
    const map = new Map<string, { name: string; kg: number; cost: number }>();
    deductRecords.forEach(tx => {
      const r = map.get(tx.ingredientId);
      if (r) { r.kg += Math.abs(tx.quantity); r.cost += tx.costAmount; }
      else map.set(tx.ingredientId, {
        name: tx.ingredientName,
        kg: Math.abs(tx.quantity),
        cost: tx.costAmount,
      });
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({
        ingredientId: id,
        ingredientName: v.name,
        avgDailyKg:   v.kg / rangeDays,
        avgDailyCost: v.cost / rangeDays,
      }))
      .sort((a, b) => b.avgDailyCost - a.avgDailyCost);
  }, [deductRecords, rangeDays]);

  const totalRangeCost = useMemo(
    () => deductRecords.reduce((s, tx) => s + tx.costAmount, 0),
    [deductRecords],
  );
  const totalWasteCost = useMemo(
    () => wasteRecords.reduce((s, tx) => s + tx.costAmount, 0),
    [wasteRecords],
  );
  // 進貨支出：收貨入庫（restock）× 單價——Feature 047 之後由「收貨」自動寫入。
  const restockRecords = useMemo(
    () => rangeRecords.filter(tx => tx.type === 'restock'),
    [rangeRecords],
  );
  const totalRestockCost = useMemo(
    () => restockRecords.reduce((s, tx) => s + tx.costAmount, 0),
    [restockRecords],
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">

      {/* ── Header + Date range picker ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">報表分析</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">食材消耗成本與庫存損耗分析</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={rangeStart}
            onChange={e => setRangeStart(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={rangeEnd}
            onChange={e => setRangeEnd(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {([7, 30, 90] as const).map(days => (
            <button
              key={days}
              onClick={() => {
                const now = new Date();
                setRangeStart(htmlDate(addDays(now, -(days - 1))));
                setRangeEnd(htmlDate(now));
              }}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              近 {days} 天
            </button>
          ))}
        </div>
      </div>

      {unpricedNames.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          以下 {unpricedNames.length} 項食材沒有單價（成本以 0 計，數字會偏低）：
          {unpricedNames.slice(0, 10).join('、')}
          {unpricedNames.length > 10 && ` …等 ${unpricedNames.length} 項`}
          。請至「食材主檔」補上預設價格。
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-8 w-32" /><Skeleton className="mt-1 h-3 w-20" /></CardContent>
              </Card>
            ))
          : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">本週消耗</CardTitle>
                  <BarChart2 size={16} className="text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{fmtCurrency(thisWeekCost)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">近 7 天食材消耗成本</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">上週消耗</CardTitle>
                  {weekChangePct !== null && weekChangePct > 0
                    ? <TrendingUp size={16} className="text-destructive" />
                    : <TrendingDown size={16} className="text-green-600" />
                  }
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{fmtCurrency(lastWeekCost)}</div>
                  {weekChangePct !== null && (
                    <p className={`mt-1 text-xs font-medium ${weekChangePct > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      {weekChangePct > 0 ? '↑' : '↓'} {Math.abs(weekChangePct).toFixed(1)}% 相較上週
                    </p>
                  )}
                  {weekChangePct === null && (
                    <p className="mt-1 text-xs text-muted-foreground">上週無消耗記錄</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">區間總支出</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{fmtCurrency(totalRangeCost)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{rangeStart} ~ {rangeEnd}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">進貨支出</CardTitle>
                  <TrendingUp size={16} className="text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{fmtCurrency(totalRestockCost)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {restockRecords.length > 0 ? `${restockRecords.length} 筆收貨入庫` : '區間內無收貨'}
                  </p>
                </CardContent>
              </Card>

              <Card className={totalWasteCost > 0 ? 'border-amber-300' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">損耗金額</CardTitle>
                  <Trash2 size={16} className={totalWasteCost > 0 ? 'text-amber-600' : 'text-muted-foreground'} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold tabular-nums ${totalWasteCost > 0 ? 'text-amber-600' : ''}`}>
                    {fmtCurrency(totalWasteCost)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {wasteRecords.length > 0 ? `${wasteRecords.length} 筆調整/報廢` : '無損耗紀錄'}
                  </p>
                </CardContent>
              </Card>
            </>
          )
        }
      </div>

      {/* ── Trend Chart ── */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-1 text-sm font-semibold">每日消耗成本趨勢</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {rangeStart} ~ {rangeEnd}（共 {rangeDays} 天）
        </p>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.every(p => p.cost === 0) ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            選定期間無消耗記錄
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={tickFormatter}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                formatter={(value) => [fmtCurrency(typeof value === 'number' ? value : 0), '消耗成本']}
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Top 5 + Waste side-by-side ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Top 5 */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Top 5 高成本食材</h2>
            <p className="text-xs text-muted-foreground">依消耗成本排序</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : top5.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border text-sm text-muted-foreground">
              選定期間無消耗記錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>食材名稱</TableHead>
                    <TableHead className="text-right">消耗量</TableHead>
                    <TableHead className="text-right">消耗成本</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top5.map((item, idx) => (
                    <TableRow key={item.ingredientId} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{item.ingredientName}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                        {fmtKg(item.totalKg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtCurrency(item.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Waste records */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">損耗 / 報廢紀錄</h2>
            <p className="text-xs text-muted-foreground">type=adjustment 且數量為負</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : wasteRecords.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border text-sm text-muted-foreground">
              ✓ 選定期間無損耗紀錄
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-amber-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-amber-50 hover:bg-amber-50">
                    <TableHead>食材</TableHead>
                    <TableHead>原因</TableHead>
                    <TableHead className="text-right">數量</TableHead>
                    <TableHead>日期</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wasteRecords.map((tx, idx) => (
                    <TableRow key={idx} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                      <TableCell className="font-medium">{tx.ingredientName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.reason || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700 font-medium">
                        {tx.quantity.toFixed(3)} kg
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.timestamp.toDate().toLocaleDateString('zh-TW')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* ── Average daily consumption ── */}
      {!loading && avgRows.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">平均每日消耗量</h2>
            <p className="text-xs text-muted-foreground">依選定期間計算，可用於訂購量預測</p>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>食材名稱</TableHead>
                  <TableHead className="text-right">平均每日消耗</TableHead>
                  <TableHead className="text-right">平均每日成本</TableHead>
                  <TableHead className="text-right">30 天預估需求</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avgRows.map((row, idx) => (
                  <TableRow key={row.ingredientId} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                    <TableCell className="font-medium">{row.ingredientName}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmtKg(row.avgDailyKg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(row.avgDailyCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(row.avgDailyKg * 30).toFixed(2)} kg
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

    </div>
  );
}
