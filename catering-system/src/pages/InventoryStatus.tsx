import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { PackageSearch, RefreshCw } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Ingredient, InventoryDoc } from '@/services/types';
import { UnitConverter } from '@/services/unitConverter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { InventoryAudit } from '@/components/InventoryAudit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRow {
  ingredientId: string;
  ingredientName: string;
  currentStockKg: number;
  safetyLevelKg: number;
  displayUnit: string;
  category: string;
  unitCost: number;
  lastUpdated?: string;
}

type StockStatus = 'ok' | 'low' | 'critical' | 'unknown';
type PageTab     = 'overview' | 'audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(current: number, safety: number): StockStatus {
  if (safety <= 0) return 'unknown';
  const ratio = current / safety;
  if (ratio >= 1) return 'ok';
  if (ratio >= 0.3) return 'low';
  return 'critical';
}

const statusConfig: Record<StockStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  extra: string;
}> = {
  ok:       { label: '充足',    variant: 'secondary',   extra: 'bg-green-100 text-green-700 border-green-200' },
  low:      { label: '偏低',    variant: 'outline',     extra: 'border-amber-400 text-amber-700' },
  critical: { label: '嚴重不足', variant: 'destructive', extra: '' },
  unknown:  { label: '未設定',  variant: 'outline',     extra: 'text-muted-foreground' },
};

const statusOrder: Record<StockStatus, number> = { critical: 0, low: 1, unknown: 2, ok: 3 };

type FilterKey = StockStatus | 'all';

const PAGE_TABS: { key: PageTab; label: string }[] = [
  { key: 'overview', label: '庫存總覽' },
  { key: 'audit',    label: '庫存盤點' },
];

// ─── InventoryStatus ──────────────────────────────────────────────────────────

export default function InventoryStatus() {
  const [pageTab, setPageTab] = useState<PageTab>('overview');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inventorySnap, ingredientSnap] = await Promise.all([
        getDocs(collection(db, 'inventory')),
        getDocs(collection(db, 'ingredients')),
      ]);

      const ingredientMap = new Map<string, Ingredient>();
      ingredientSnap.docs.forEach(doc => {
        ingredientMap.set(doc.id, { id: doc.id, ...doc.data() } as Ingredient);
      });

      const data: InventoryRow[] = inventorySnap.docs.map(doc => {
        const inv = doc.data() as InventoryDoc;
        const ing = ingredientMap.get(inv.ingredientId);
        const currentStockKg = inv.currentStock ?? 0;
        let safetyLevelKg = 0;
        if (ing) {
          try {
            safetyLevelKg = UnitConverter.toKg(ing.minStockLevel, ing.unit);
          } catch {
            safetyLevelKg = ing.minStockLevel;
          }
        }
        return {
          ingredientId: inv.ingredientId,
          ingredientName: inv.ingredientName,
          currentStockKg,
          safetyLevelKg,
          displayUnit: ing?.unit ?? 'kg',
          category: ing?.category ?? '—',
          unitCost: ing?.unitCost ?? 0,
          lastUpdated: inv.lastUpdated
            ? inv.lastUpdated.toDate().toLocaleDateString('zh-TW')
            : undefined,
        };
      });

      data.sort((a, b) => {
        const sa = getStatus(a.currentStockKg, a.safetyLevelKg);
        const sb = getStatus(b.currentStockKg, b.safetyLevelKg);
        if (statusOrder[sa] !== statusOrder[sb]) return statusOrder[sa] - statusOrder[sb];
        return a.ingredientName.localeCompare(b.ingredientName, 'zh-TW');
      });

      setRows(data);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStatus = (s: StockStatus) => rows.filter(r => getStatus(r.currentStockKg, r.safetyLevelKg) === s);
  const counts = {
    all:      rows.length,
    ok:       byStatus('ok').length,
    low:      byStatus('low').length,
    critical: byStatus('critical').length,
  };

  const displayed = filter === 'all'
    ? rows
    : rows.filter(r => getStatus(r.currentStockKg, r.safetyLevelKg) === filter);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: `全部（${counts.all}）` },
    { key: 'critical', label: `嚴重不足（${counts.critical}）` },
    { key: 'low',      label: `偏低（${counts.low}）` },
    { key: 'ok',       label: `充足（${counts.ok}）` },
  ];

  return (
    <div className="flex flex-col">
      {/* Page-level tab bar */}
      <div className="flex gap-1 border-b bg-muted/20 px-6 pt-4">
        {PAGE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPageTab(key)}
            className={[
              'rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
              pageTab === key
                ? 'border border-b-background -mb-px bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Audit tab */}
      {pageTab === 'audit' && <InventoryAudit />}

      {/* Overview tab */}
      {pageTab === 'overview' && (
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">庫存總覽</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                即時庫存水位，標示低於安全水位的食材。
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="重新整理">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span className="ml-1.5 hidden sm:inline">重新整理</span>
            </Button>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {filterChips.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-muted text-muted-foreground hover:border-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <PackageSearch size={48} strokeWidth={1.2} />
              <p className="text-sm">無符合條件的庫存項目</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材名稱</TableHead>
                    <TableHead>類別</TableHead>
                    <TableHead className="text-right">目前庫存</TableHead>
                    <TableHead className="text-right">安全水位</TableHead>
                    <TableHead className="text-right">單價 / kg</TableHead>
                    <TableHead>更新日期</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((row, idx) => {
                    const status = getStatus(row.currentStockKg, row.safetyLevelKg);
                    const { label, variant, extra } = statusConfig[status];
                    const isAlert = status === 'critical' || status === 'low';
                    return (
                      <TableRow
                        key={row.ingredientId}
                        className={idx % 2 !== 0 ? 'bg-muted/30' : ''}
                      >
                        <TableCell className="font-medium">{row.ingredientName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${isAlert ? 'font-medium text-destructive' : ''}`}
                        >
                          {row.currentStockKg.toFixed(2)} kg
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {row.safetyLevelKg > 0 ? `${row.safetyLevelKg.toFixed(2)} kg` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          NT$ {row.unitCost.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.lastUpdated ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={variant} className={extra}>
                            {label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
