/**
 * CostAwareMenuCard — Feature 035 dashboard card: 性價比菜單 Top 3.
 *
 * Shows the top 3 items (already sorted best-first by valueScore) from the
 * latest `costAwareMenuSuggestions` record. Read-only; own try/catch so a
 * failure here never blanks the rest of the dashboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { CostAwareMenuSuggestion } from '@/services/types';
import { listCostAwareMenuSuggestions } from '@/services/costAwareMenuSuggestionService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(ts?: Timestamp): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleDateString('zh-TW');
  } catch {
    return '—';
  }
}

export default function CostAwareMenuCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<CostAwareMenuSuggestion | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await listCostAwareMenuSuggestions(db);
        if (!cancelled) setLatest(list[0] ?? null);
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
  }, []);

  const topItems = (latest?.items ?? []).slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">性價比菜單 Top 3</CardTitle>
        <Sparkles size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-xs text-destructive">載入失敗：{error}</p>
        ) : !latest ? (
          <p className="text-xs text-muted-foreground">尚無建議紀錄</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{formatDate(latest.createdAt)}　目標 {latest.targetServingCount} 份</p>
            <ul className="space-y-1">
              {topItems.map((item) => (
                <li key={item.recipeId} className="flex items-center justify-between text-xs">
                  <span className="truncate">{item.recipeNameSnapshot}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.estimatedCostPerServing != null ? `$${item.estimatedCostPerServing.toFixed(2)}` : '—'}
                    {item.valueScore != null ? ` · ${item.valueScore.toFixed(0)} 分` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to="/menu-suggestions?tab=cost" className="block text-xs font-medium text-primary hover:underline">
          查看性價比菜單建議 →
        </Link>
      </CardContent>
    </Card>
  );
}
