import { useEffect, useState } from 'react';
import { AlertTriangle, Brain, Lightbulb, Loader2, ShoppingCart, TrendingDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  runDailyAnalysis,
  type Insight,
  type InsightType,
} from '@/services/intelligenceAgent';
import { generatePurchaseSuggestion } from '@/services/purchaseService';
import { purchaseOrderService, type PurchaseOrderItem } from '@/services/purchaseOrderService';
import type { PurchaseDraft } from '@/services/types';
import { toTaijin } from '@/utils/unitConverter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

// ─── Insight type helpers ─────────────────────────────────────────────────────

function InsightIcon({ type }: { type: InsightType }) {
  switch (type) {
    case 'ALERT':        return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'OPTIMIZATION': return <Lightbulb className="h-4 w-4 text-blue-500" />;
    case 'DATA_WARNING': return <TrendingDown className="h-4 w-4 text-yellow-500" />;
    default: {
      const _: never = type;
      return null;
    }
  }
}

const TYPE_LABEL: Record<InsightType, string> = {
  ALERT:        '警示',
  OPTIMIZATION: '優化建議',
  DATA_WARNING: '資料警告',
};

const TYPE_BADGE: Record<InsightType, 'destructive' | 'secondary' | 'outline'> = {
  ALERT:        'destructive',
  OPTIMIZATION: 'secondary',
  DATA_WARNING: 'outline',
};

const PRIORITY_LABEL: Record<Insight['priority'], string> = {
  HIGH:   '高優先',
  MEDIUM: '中優先',
  LOW:    '低優先',
};

const PRIORITY_BADGE: Record<Insight['priority'], 'destructive' | 'secondary' | 'outline'> = {
  HIGH:   'destructive',
  MEDIUM: 'secondary',
  LOW:    'outline',
};

const PRIORITY_BORDER: Record<Insight['priority'], string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#eab308',
  LOW:    '#9ca3af',
};

// ─── Format helpers ───────────────────────────────────────────────────────────

const fmtKg = (n: number) => `${n.toFixed(2)} kg`;
const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

// ─── IntelligenceInsights ─────────────────────────────────────────────────────

export default function IntelligenceInsights() {
  const [loading, setLoading]       = useState(true);
  const [insights, setInsights]     = useState<Insight[]>([]);
  const [suggestion, setSuggestion] = useState<PurchaseDraft | null>(null);
  const [applying, setApplying]     = useState(false);
  const [appliedId, setAppliedId]   = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [insightData, suggestionData] = await Promise.all([
          runDailyAnalysis(db),
          generatePurchaseSuggestion(db),
        ]);
        setInsights(insightData);
        setSuggestion(suggestionData);
      } catch (err) {
        toast({ title: '載入失敗', description: String(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleApply() {
    if (applying) return; // double-submit guard
    if (!suggestion || suggestion.items.length === 0) return;
    setApplying(true);
    try {
      // shortageKg here maps to suggestedQtyKg (AI-calculated purchase qty).
      // Domain naming TBD by Gemini: shortageKg vs purchaseQtyKg.
      const items: PurchaseOrderItem[] = suggestion.items
        .filter((item) => Number.isFinite(item.suggestedQtyKg) && item.suggestedQtyKg > 0)
        .map((item) => ({
          ingredientId:   item.ingredientId,
          name:           item.ingredientName,
          shortageKg:     item.suggestedQtyKg,
          shortageTaijin: toTaijin(item.suggestedQtyKg),
        }));
      const orderId = await purchaseOrderService.createDraftOrder(items);
      setAppliedId(orderId);
      toast({
        title: 'DRAFT 採購單已建立',
        description: '可至採購管理頁面確認並轉為正式採購單。',
      });
    } catch (err) {
      toast({ title: '建立失敗', description: String(err), variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Section 1: AI 洞察卡片 ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">AI 洞察</h2>
          <span className="text-xs text-muted-foreground">（昨日分析結果）</span>
        </div>

        {insights.length === 0 ? (
          <Alert>
            <AlertDescription>昨日無異常洞察，系統運作正常。</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {insights.map((ins, idx) => (
              <Card
                key={idx}
                className="border-l-4"
                style={{ borderLeftColor: PRIORITY_BORDER[ins.priority] }}
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <InsightIcon type={ins.type} />
                    <Badge variant={TYPE_BADGE[ins.type]}>{TYPE_LABEL[ins.type]}</Badge>
                    <Badge variant={PRIORITY_BADGE[ins.priority]}>{PRIORITY_LABEL[ins.priority]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm leading-relaxed">{ins.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ins.generatedAt.toLocaleTimeString('zh-TW', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: 採購建議明細 + Apply 按鈕 ──────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">採購建議明細</h2>
          {suggestion && suggestion.items.length > 0 && (
            <span className="ml-auto text-sm font-medium text-muted-foreground">
              預估總額：{fmtCurrency(suggestion.totalEstimatedCost)}
            </span>
          )}
        </div>

        {!suggestion || suggestion.items.length === 0 ? (
          <Alert>
            <AlertDescription>目前庫存充足，無需採購建議。</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材</TableHead>
                    <TableHead className="text-right">現有庫存</TableHead>
                    <TableHead className="text-right">安全庫存</TableHead>
                    <TableHead className="text-right">訂單需求</TableHead>
                    <TableHead className="text-right">建議採購量</TableHead>
                    <TableHead className="text-right">預估成本</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestion.items.map((item) => (
                    <TableRow key={item.ingredientId}>
                      <TableCell className="font-medium">{item.ingredientName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.currentStockKg)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.safetyLevelKg)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtKg(item.orderDemandKg)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{fmtKg(item.suggestedQtyKg)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({toTaijin(item.suggestedQtyKg)} 台斤)
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtCurrency(item.estimatedCost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t px-4 py-3">
                {appliedId ? (
                  <p className="text-sm text-green-600">
                    ✅ DRAFT 採購單已建立（#{appliedId.slice(0, 8)}…）
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    共 {suggestion.items.length} 項食材缺口，點擊採用後自動建立 DRAFT 採購單
                  </p>
                )}
                <Button onClick={handleApply} disabled={applying || !!appliedId}>
                  {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {appliedId ? '已採用' : '採用建議'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

    </div>
  );
}
