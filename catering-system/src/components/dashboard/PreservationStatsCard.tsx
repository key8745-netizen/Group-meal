/**
 * PreservationStatsCard — Feature 084 dashboard card: 加工延壽（惜食）成效。
 *
 * 從批次資料（帶 processedLabel 者）彙整加工延壽成效，量化「留住了多少食材」。
 * 唯讀、自帶 try/catch，失敗不影響控制台其餘卡片。
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Recycle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { listAllBatches } from '@/services/inventoryBatchService';
import { summarizePreservation, type PreservationSummary } from '@/services/preservationStatsService';
import { todayLocalIsoDate } from '@/services/marketPriceService';
import { formatWeight } from '@/utils/unitConverter';
import { useWeightUnit } from '@/contexts/WeightUnitContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function PreservationStatsCard() {
  const navigate = useNavigate();
  const { unit } = useWeightUnit();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PreservationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const batches = await listAllBatches(db);
        if (!cancelled) setSummary(summarizePreservation(batches, todayLocalIsoDate()));
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate('/inventory')}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">加工延壽（惜食）成效</CardTitle>
        <Recycle size={16} className="text-emerald-600 dark:text-emerald-400" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : !summary || summary.processedBatchCount === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            尚無加工延壽紀錄。快到期食材可在庫存「批次明細」或控制台保鮮警示按「加工延壽」。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatWeight(summary.processedKg, unit)}
              </span>
              <span className="text-sm text-muted-foreground">累計延壽產出</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>累計 <span className="font-medium text-foreground">{summary.processedBatchCount}</span> 批</span>
              <span>近 {summary.windowDays} 天 <span className="font-medium text-foreground">{summary.recentBatchCount}</span> 批</span>
              <span>仍有庫存 <span className="font-medium text-foreground">{formatWeight(summary.activeRemainingKg, unit)}</span></span>
              <span>近 {summary.windowDays} 天 <span className="font-medium text-foreground">{formatWeight(summary.recentKg, unit)}</span></span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
