/**
 * ProductionScheduleCard — Feature 035 dashboard card: 最新生產排程.
 *
 * `listProductionScheduleSuggestions(db, planId)` (productionScheduleService)
 * filters by plan, so it can't answer "most recent overall" — this card
 * queries `productionScheduleSuggestions` directly (same direct-getDocs
 * pattern used elsewhere in the app) ordered by `createdAt desc`, limit 1.
 * Read-only; own try/catch so a failure here never blanks the rest of the
 * dashboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, getDocs, limit, orderBy, query, type Timestamp,
} from 'firebase/firestore';
import { CalendarClock } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { ProductionScheduleStatus, ProductionScheduleSuggestion } from '@/services/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_LABEL: Record<ProductionScheduleStatus, string> = {
  fits: '可完成',
  overrun: '超時',
  infeasible: '無法排入',
};

const STATUS_VARIANT: Record<ProductionScheduleStatus, 'default' | 'destructive' | 'outline'> = {
  fits: 'default',
  overrun: 'destructive',
  infeasible: 'destructive',
};

function formatDateTime(ts?: Timestamp): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function ProductionScheduleCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<ProductionScheduleSuggestion | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'productionScheduleSuggestions'),
          orderBy('createdAt', 'desc'),
          limit(1),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const first = snap.docs[0];
        setLatest(first ? ({ id: first.id, ...first.data() } as ProductionScheduleSuggestion) : null);
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">最新生產排程</CardTitle>
        <CalendarClock size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-xs text-destructive">載入失敗：{error}</p>
        ) : !latest ? (
          <p className="text-xs text-muted-foreground">尚無排程建議</p>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{latest.sourcePlanNameSnapshot}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={STATUS_VARIANT[latest.scheduleStatus]}>
                {STATUS_LABEL[latest.scheduleStatus]}
              </Badge>
              <span>{latest.makespanMinutes} 分鐘</span>
            </div>
            <p className="text-xs text-muted-foreground">{formatDateTime(latest.createdAt)}</p>
          </>
        )}
        <Link to="/production-schedules" className="block text-xs font-medium text-primary hover:underline">
          查看生產排程 →
        </Link>
      </CardContent>
    </Card>
  );
}
