/**
 * MarketPriceCard — Feature 035 dashboard card: 今日市場行情.
 *
 * Reads the `ingredients` list that the caller (Dashboard) already loaded
 * (avoids a duplicate Firestore round-trip), then calls
 * `ensureTodayMarketPrices` so the dashboard also benefits from the
 * auto-refresh-on-first-visit behavior. Read-only; own try/catch so a
 * failure here never blanks the rest of the dashboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster } from '@/services/types';
import { ensureTodayMarketPrices, pricePerKgFromDefault } from '@/services/marketPriceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Mover {
  ingredientId: string;
  name: string;
  pct: number;
}

interface MarketPriceCardProps {
  /** Ingredients already loaded by the caller (may be empty until `ready`). */
  ingredients: IngredientMaster[];
  /** True once `ingredients` reflects a completed load (not necessarily non-empty). */
  ready: boolean;
}

export default function MarketPriceCard({ ingredients, ready }: MarketPriceCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackedCount, setTrackedCount] = useState(0);
  const [pricedCount, setPricedCount] = useState(0);
  const [movers, setMovers] = useState<Mover[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const tracked = ingredients.filter((i) => i.marketCropName && i.marketCropName.trim());
        const uid = auth.currentUser?.uid ?? '';
        const snapshot = await ensureTodayMarketPrices(db, ingredients, uid);
        if (cancelled) return;

        const entryByCrop = new Map((snapshot?.entries ?? []).map((e) => [e.cropName, e]));
        let priced = 0;
        const moverList: Mover[] = [];
        for (const ing of tracked) {
          const entry = entryByCrop.get(ing.marketCropName as string);
          if (entry?.avgPrice == null) continue;
          priced += 1;
          const basePrice = pricePerKgFromDefault(ing);
          if (basePrice == null || basePrice <= 0) continue;
          const pct = ((entry.avgPrice - basePrice) / basePrice) * 100;
          moverList.push({ ingredientId: ing.id, name: ing.name, pct });
        }
        moverList.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

        setTrackedCount(tracked.length);
        setPricedCount(priced);
        setMovers(moverList.slice(0, 3));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '未知錯誤');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">今日市場行情</CardTitle>
        <TrendingUp size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-xs text-destructive">載入失敗：{error}</p>
        ) : trackedCount === 0 ? (
          <p className="text-xs text-muted-foreground">尚未設定市場作物對應</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              追蹤 {trackedCount} 項作物，今日已有 {pricedCount} 項行情
            </p>
            {movers.length > 0 && (
              <ul className="space-y-1">
                {movers.map((m) => (
                  <li key={m.ingredientId} className="flex items-center justify-between text-xs">
                    <span className="truncate">{m.name}</span>
                    <span className={m.pct >= 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
                      {m.pct > 0 ? '+' : ''}{m.pct.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <Link to="/market-prices" className="block text-xs font-medium text-primary hover:underline">
          查看市場行情 →
        </Link>
      </CardContent>
    </Card>
  );
}
