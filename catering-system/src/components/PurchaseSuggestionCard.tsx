import { useState } from 'react';
import { AlertTriangle, Loader2, ShoppingCart, TrendingDown, ShieldAlert, Info } from 'lucide-react';
import type { SuggestionItem } from '@/hooks/useIntelligenceInsights';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { toTaijin } from '@/utils/unitConverter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ConfidenceLevel } from '@/services/aiSuggestionConfidence';

interface Props {
  item:       SuggestionItem;
  onApplied?: (orderId: string) => void;
}

const fmtKg  = (n: number) => `${n.toFixed(2)} kg`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  HIGH:    '高信心',
  MEDIUM:  '中信心',
  LOW:     '低信心',
  BLOCKED: '⚠ 封鎖',
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  HIGH:    'bg-green-100 text-green-800 border-green-300',
  MEDIUM:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  LOW:     'bg-orange-100 text-orange-800 border-orange-300',
  BLOCKED: 'bg-red-100 text-red-800 border-red-300',
};

export default function PurchaseSuggestionCard({ item, onApplied }: Props) {
  const [applying,  setApplying]  = useState(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const { toast } = useToast();

  const isShortage = item.type === 'SHORTAGE';
  const confidence = item.confidence;
  const [showReasons, setShowReasons] = useState(false);

  async function handleApply() {
    if (item.type !== 'SHORTAGE') return;
    if (applying || appliedId) return;
    if (!confidence.canCreateDraft) return;
    if (!Number.isFinite(item.suggestedQtyKg) || item.suggestedQtyKg <= 0) return;
    setApplying(true);
    try {
      const orderId = await purchaseOrderService.createDraftOrder(
        [{
          ingredientId:   item.ingredientId,
          name:           item.ingredientName,
          purchaseQtyKg:  item.suggestedQtyKg,
          purchaseTaijin: toTaijin(item.suggestedQtyKg),
        }],
        'AI 智能建議自動產生',
        {
          aiGenerated:       true,
          confidenceLevel:   confidence.level,
          confidenceReasons: confidence.reasons,
        },
      );
      setAppliedId(orderId);
      toast({
        title: 'DRAFT 採購單已建立',
        description: `${item.ingredientName} 採購單已建立，可至採購管理頁確認。`,
      });
      onApplied?.(orderId);
    } catch (err) {
      toast({ title: '建立失敗', description: String(err), variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card className={`border-l-4 ${isShortage ? 'border-l-destructive' : 'border-l-yellow-500'}`}>

      {/* ── Header ── */}
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isShortage
              ? <AlertTriangle className="h-4 w-4 text-destructive" />
              : <TrendingDown   className="h-4 w-4 text-yellow-500" />
            }
            <span className="font-semibold">{item.ingredientName}</span>
            <Badge variant={isShortage ? 'destructive' : 'outline'}>
              {isShortage ? '缺貨風險' : '高損耗風險'}
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Confidence badge */}
            <button
              type="button"
              onClick={() => setShowReasons((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${CONFIDENCE_COLORS[confidence.level]}`}
            >
              <Info className="h-3 w-3" />
              {CONFIDENCE_LABELS[confidence.level]}
            </button>

            {/* Apply button — only for SHORTAGE items that are not BLOCKED */}
            {isShortage && confidence.level !== 'BLOCKED' && (
              <Button size="sm" onClick={handleApply} disabled={applying || !!appliedId}>
                {applying
                  ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  : <ShoppingCart className="mr-1 h-3 w-3" />
                }
                {appliedId ? '已建立' : '採購此項目'}
              </Button>
            )}

            {/* Blocked state — show shield icon instead of apply button */}
            {isShortage && confidence.level === 'BLOCKED' && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600">
                <ShieldAlert className="h-3.5 w-3.5" />
                無法自動採購
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      {/* ── Confidence reasoning panel (toggle) ── */}
      {showReasons && (
        <div className="mx-4 mb-2 rounded-md border border-dashed p-3 text-xs">
          {confidence.blockReason ? (
            <p className="text-red-700">
              <span className="font-semibold">封鎖原因：</span>{confidence.blockReason}
            </p>
          ) : (
            <ul className="space-y-1 text-muted-foreground">
              {confidence.reasons.map((r, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50 translate-y-1" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <CardContent className="pb-4 text-sm">
        {isShortage ? (
          <>
            <p className="mb-3 leading-relaxed">
              建議採購{' '}
              <span className="font-semibold text-destructive">
                {fmtKg(item.suggestedQtyKg)}（{toTaijin(item.suggestedQtyKg)} 台斤）
              </span>
              {' '}以應對未來 7 天訂單。
            </p>

            {/* 預測數據 grid */}
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
            {confidence.level === 'BLOCKED' && confidence.blockReason && (
              <p className="mt-2 flex items-start gap-1 text-xs text-red-600">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {confidence.blockReason}
              </p>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
