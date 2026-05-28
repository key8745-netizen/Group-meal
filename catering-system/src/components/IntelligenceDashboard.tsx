import { AlertTriangle, Brain, Lightbulb, Loader2, RefreshCw, ShoppingCart, TrendingDown } from 'lucide-react';
import { useIntelligenceInsights, type SuggestionItem } from '@/hooks/useIntelligenceInsights';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { type Insight, type InsightType } from '@/services/intelligenceAgent';
import { toTaijin } from '@/utils/unitConverter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

// ─── Format helpers ───────────────────────────────────────────────────────────

const fmtKg       = (n: number) => `${n.toFixed(2)} kg`;
const fmtPct      = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

// ─── Insight card helpers ─────────────────────────────────────────────────────

function InsightIcon({ type }: { type: InsightType }) {
  switch (type) {
    case 'ALERT':        return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'OPTIMIZATION': return <Lightbulb     className="h-4 w-4 text-blue-500" />;
    case 'DATA_WARNING': return <TrendingDown  className="h-4 w-4 text-yellow-500" />;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return null;
    }
  }
}

const INSIGHT_TYPE_LABEL: Record<InsightType, string> = {
  ALERT: '警示', OPTIMIZATION: '優化建議', DATA_WARNING: '資料警告',
};
const INSIGHT_TYPE_BADGE: Record<InsightType, 'destructive' | 'secondary' | 'outline'> = {
  ALERT: 'destructive', OPTIMIZATION: 'secondary', DATA_WARNING: 'outline',
};
const INSIGHT_PRIORITY_LABEL: Record<Insight['priority'], string> = {
  HIGH: '高', MEDIUM: '中', LOW: '低',
};
const INSIGHT_PRIORITY_BADGE: Record<Insight['priority'], 'destructive' | 'secondary' | 'outline'> = {
  HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline',
};

// ─── IntelligenceDashboard ────────────────────────────────────────────────────

export default function IntelligenceDashboard() {
  const { items, insights, loading, error, refresh } = useIntelligenceInsights();
  const { toast } = useToast();

  // Per-item applying state: Set<ingredientId>
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  // Per-item result state: ingredientId → orderId
  const [appliedMap,  setAppliedMap]  = useState<Map<string, string>>(new Map());

  // ── handleApply (centralised — owns all defensive logic) ─────────────────
  async function handleApply(item: SuggestionItem) {
    // Guard 1: only SHORTAGE items may trigger a purchase order
    if (item.type !== 'SHORTAGE') return;
    // Guard 2: prevent duplicate submission
    if (applyingIds.has(item.ingredientId) || appliedMap.has(item.ingredientId)) return;
    // Guard 3: reject NaN / Infinity / non-positive quantities
    if (!Number.isFinite(item.suggestedQtyKg) || item.suggestedQtyKg <= 0) return;

    setApplyingIds((prev) => new Set(prev).add(item.ingredientId));
    try {
      const orderId = await purchaseOrderService.createDraftOrder([{
        ingredientId:   item.ingredientId,
        name:           item.ingredientName,
        purchaseQtyKg:  item.suggestedQtyKg,
        purchaseTaijin: toTaijin(item.suggestedQtyKg),
      }]);
      setAppliedMap((prev) => new Map(prev).set(item.ingredientId, orderId));
      toast({
        title: 'DRAFT 採購單已建立',
        description: `${item.ingredientName} 採購單已建立，可至採購管理頁確認。`,
      });
    } catch (err) {
      toast({ title: '建立失敗', description: String(err), variant: 'destructive' });
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.ingredientId);
        return next;
      });
    }
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const shortageItems   = items.filter((i) => i.type === 'SHORTAGE');
  const wasteRiskItems  = items.filter((i) => i.type === 'WASTE_RISK');
  const totalCost       = shortageItems.reduce((s, i) => s + i.estimatedCost, 0);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44" /><Skeleton className="h-44" />
          <Skeleton className="h-44" /><Skeleton className="h-44" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>載入失敗：{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">Intelligence Dashboard</span>
        </div>

        <div className="flex flex-wrap gap-2 ml-2">
          {shortageItems.length > 0 && (
            <Badge variant="destructive">
              缺貨風險 {shortageItems.length} 項
            </Badge>
          )}
          {wasteRiskItems.length > 0 && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
              高損耗風險 {wasteRiskItems.length} 項
            </Badge>
          )}
          {totalCost > 0 && (
            <Badge variant="secondary">
              預估採購 {fmtCurrency(totalCost)}
            </Badge>
          )}
          {items.length === 0 && (
            <Badge variant="outline">庫存狀況良好</Badge>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={refresh}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          重新分析
        </Button>
      </div>

      {/* ── AI Insights ──────────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">AI 洞察（昨日分析）</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.map((ins, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <InsightIcon type={ins.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    <Badge variant={INSIGHT_TYPE_BADGE[ins.type]}>
                      {INSIGHT_TYPE_LABEL[ins.type]}
                    </Badge>
                    <Badge variant={INSIGHT_PRIORITY_BADGE[ins.priority]}>
                      {INSIGHT_PRIORITY_LABEL[ins.priority]}優先
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{ins.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── No items fallback ─────────────────────────────────────────────── */}
      {items.length === 0 && (
        <Alert>
          <AlertDescription>目前無缺貨風險或高損耗風險，庫存狀況良好。</AlertDescription>
        </Alert>
      )}

      {/* ── SHORTAGE cards ───────────────────────────────────────────────── */}
      {shortageItems.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">缺貨風險項目</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {shortageItems.map((item) => {
              const isApplying = applyingIds.has(item.ingredientId);
              const appliedId  = appliedMap.get(item.ingredientId) ?? null;
              return (
                <Card key={item.ingredientId} className="border-l-4 border-l-destructive">
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="font-semibold">{item.ingredientName}</span>
                        <Badge variant="destructive">缺貨風險</Badge>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleApply(item)}
                        disabled={isApplying || !!appliedId}
                      >
                        {isApplying
                          ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          : <ShoppingCart className="mr-1 h-3 w-3" />
                        }
                        {appliedId ? '已建立' : '採購此項目'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 text-sm">
                    <p className="mb-3 leading-relaxed">
                      建議採購{' '}
                      <span className="font-semibold text-destructive">
                        {fmtKg(item.suggestedQtyKg)}（{toTaijin(item.suggestedQtyKg)} 台斤）
                      </span>
                      {' '}以應對未來 7 天訂單。
                    </p>
                    <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">現有庫存</p>
                        <p className="mt-0.5 font-medium">{fmtKg(item.currentStockKg)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">安全庫存</p>
                        <p className="mt-0.5 font-medium">{fmtKg(item.safetyLevelKg)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">訂單需求</p>
                        <p className="mt-0.5 font-medium">{fmtKg(item.orderDemandKg)}</p>
                      </div>
                    </div>
                    {item.estimatedCost > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        預估採購成本：{fmtCurrency(item.estimatedCost)}
                      </p>
                    )}
                    {appliedId && (
                      <p className="mt-2 text-xs text-green-600">
                        ✅ DRAFT 採購單已建立（#{appliedId.slice(0, 8)}…）
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── WASTE_RISK cards ─────────────────────────────────────────────── */}
      {wasteRiskItems.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">高損耗風險項目</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {wasteRiskItems.map((item) => (
              <Card key={item.ingredientId} className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-yellow-500" />
                    <span className="font-semibold">{item.ingredientName}</span>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                      高損耗風險
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 text-sm">
                  <p className="mb-3 leading-relaxed">
                    目前庫存過剩，建議暫停採購該品項。
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">現有庫存</p>
                      <p className="mt-0.5 font-medium">{fmtKg(item.currentStockKg)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">損耗率</p>
                      <p className="mt-0.5 font-semibold text-yellow-600">{fmtPct(item.wasteFactor)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
