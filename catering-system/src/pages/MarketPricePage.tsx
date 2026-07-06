/**
 * MarketPricePage — 市場行情 (Feature 032: 果菜市場市價整合)
 *
 * Shows today's AMIS wholesale market prices for ingredients that have a
 * `marketCropName` set, compared against each ingredient's 基準價
 * (derived from defaultPrice/defaultPriceUnit via pricePerKgFromDefault).
 * A manual "更新市價" button re-fetches from the MOA AMIS API (via the
 * market-price Netlify function) and re-caches the snapshot for today.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, MarketPriceSnapshot } from '@/services/types';
import { listIngredients } from '@/services/ingredientMasterService';
import {
  fetchAndCacheMarketPrices,
  getMarketPriceSnapshot,
  pricePerKgFromDefault,
} from '@/services/marketPriceService';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function diffPercent(marketPrice: number, basePrice: number): number | null {
  if (!(basePrice > 0)) return null;
  return ((marketPrice - basePrice) / basePrice) * 100;
}

function diffColorClass(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 15) return 'text-red-600 font-medium';
  if (pct <= -15) return 'text-green-600 font-medium';
  return 'text-foreground';
}

export default function MarketPricePage() {
  const [ingredients, setIngredients] = useState<IngredientMaster[]>([]);
  const [snapshot, setSnapshot] = useState<MarketPriceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = today();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ingredientList, cached] = await Promise.all([
        listIngredients(db),
        getMarketPriceSnapshot(db, date),
      ]);
      setIngredients(ingredientList);
      setSnapshot(cached);
    } catch {
      toast({ variant: 'destructive', title: '無法載入市場行情資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackedIngredients = ingredients.filter((i) => i.marketCropName && i.marketCropName.trim());
  const cropNames = Array.from(new Set(trackedIngredients.map((i) => i.marketCropName as string)));

  async function handleRefresh() {
    if (cropNames.length === 0) return;
    setRefreshing(true);
    setError(null);
    const uid = auth.currentUser?.uid ?? '';
    try {
      const next = await fetchAndCacheMarketPrices(db, date, cropNames, uid);
      setSnapshot(next);
      toast({ title: '市價已更新', description: `已更新 ${next.entries.length} 項作物的行情。` });
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新市價失敗';
      setError(message);
      toast({ variant: 'destructive', title: '更新市價失敗', description: message });
    } finally {
      setRefreshing(false);
    }
  }

  const entryByCropName = new Map((snapshot?.entries ?? []).map((e) => [e.cropName, e]));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">市場行情</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {date}　果菜批發市場即時行情（資料來源：農業部 AMIS 農產品交易行情站）
            </p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing || loading || cropNames.length === 0}
          className="gap-1.5"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? '更新中…' : '更新市價'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {snapshot && snapshot.warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={13} /> 部分作物查詢失敗
          </div>
          {snapshot.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : trackedIngredients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <TrendingUp size={48} strokeWidth={1.2} />
          <p className="text-sm">請先在食材主檔為食材設定「市場作物名稱」。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>食材</TableHead>
                <TableHead>市場作物</TableHead>
                <TableHead className="text-right">今日均價 (NT$/kg)</TableHead>
                <TableHead className="text-right">價格區間</TableHead>
                <TableHead className="text-right">交易量</TableHead>
                <TableHead className="text-right">基準價 (NT$/kg)</TableHead>
                <TableHead className="text-right">差異%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackedIngredients.map((ing, idx) => {
                const cropName = ing.marketCropName as string;
                const entry = entryByCropName.get(cropName);
                const basePrice = pricePerKgFromDefault(ing);
                const hasMarketPrice = entry?.avgPrice != null;
                const pct = hasMarketPrice && basePrice != null
                  ? diffPercent(entry!.avgPrice as number, basePrice)
                  : null;

                return (
                  <TableRow key={ing.id} className={idx % 2 !== 0 ? 'bg-muted/30' : ''}>
                    <TableCell className="font-medium">{ing.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{cropName}</TableCell>
                    <TableCell className="text-right">
                      {hasMarketPrice ? `$${(entry!.avgPrice as number).toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {entry?.minPrice != null && entry?.maxPrice != null
                        ? `$${entry.minPrice.toFixed(2)} ~ $${entry.maxPrice.toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {entry && entry.marketCount > 0 ? `${entry.totalQuantity} (${entry.marketCount} 市場)` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {basePrice != null ? `$${basePrice.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className={`text-right ${diffColorClass(pct)}`}>
                      {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!snapshot && trackedIngredients.length > 0 && !loading && (
        <p className="text-xs text-muted-foreground">尚無今日行情快取，請點選「更新市價」查詢。</p>
      )}

      <Toaster />
    </div>
  );
}
