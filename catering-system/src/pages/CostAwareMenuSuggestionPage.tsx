/**
 * CostAwareMenuSuggestionPage — 性價比菜單建議 (Feature 033: Cost/Inventory-Aware
 * Menu Suggestions, Part A).
 *
 * Ranks active recipes by an estimated cost-per-serving (market price when
 * linked + cached today, else default price) and how many servings can be
 * made from current inventory. Suggestion-only — never creates menus or
 * purchases; every result is a human-review artifact.
 */

import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';
import type { CostAwareMenuSuggestion, InventoryDoc } from '@/services/types';
import { listRecipes } from '@/services/recipeService';
import { listIngredients } from '@/services/ingredientMasterService';
import { getMarketPriceSnapshot } from '@/services/marketPriceService';
import {
  createCostAwareMenuSuggestion,
  listCostAwareMenuSuggestions,
} from '@/services/costAwareMenuSuggestionService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function CostAwareResultTable({ result }: { result: CostAwareMenuSuggestion }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">排名</th>
              <th className="px-3 py-2 text-left font-medium">菜色</th>
              <th className="px-3 py-2 text-right font-medium">每份成本</th>
              <th className="px-3 py-2 text-left font-medium">價格來源</th>
              <th className="px-3 py-2 text-right font-medium">庫存可做份數</th>
              <th className="px-3 py-2 text-left font-medium">限制食材</th>
              <th className="px-3 py-2 text-right font-medium">性價比分數</th>
              <th className="px-3 py-2 text-left font-medium">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.items.map((item, i) => (
              <tr key={item.recipeId} className="hover:bg-muted/20 align-top">
                <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">{item.recipeNameSnapshot}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {item.estimatedCostPerServing != null ? `$${item.estimatedCostPerServing.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {item.marketPricedIngredientCount} 市價 / {item.defaultPricedIngredientCount} 基準 / {item.unpricedIngredientCount} 無價
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {item.maxServingsFromStock != null ? item.maxServingsFromStock : '—'}
                </td>
                <td className="px-3 py-2">{item.limitingIngredientNameSnapshot ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {item.valueScore != null ? item.valueScore.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-2 max-w-xs">
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {item.reasoningNotes.map((n, ni) => <li key={ni}>• {n}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.manualReviewNotes.length > 0 && (
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">人工審查備注</p>
          {result.manualReviewNotes.map((n, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CostAwareMenuSuggestionPage() {
  const navigate = useNavigate();
  const [targetServingCount, setTargetServingCount] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [latestResult, setLatestResult] = useState<CostAwareMenuSuggestion | null>(null);
  const [history, setHistory] = useState<CostAwareMenuSuggestion[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snapshotMissing, setSnapshotMissing] = useState(false);

  async function loadHistory() {
    try {
      const list = await listCostAwareMenuSuggestions(db);
      setHistory(list);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
      setHistoryLoaded(true);
    }
  }

  async function handleSubmit() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast({ title: '錯誤', description: '請先登入', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const [recipes, ingredients, inventorySnap, snapshot] = await Promise.all([
        listRecipes(db),
        listIngredients(db),
        getDocs(collection(db, 'inventory')),
        getMarketPriceSnapshot(db, today()),
      ]);

      setSnapshotMissing(!snapshot);

      const inventoryByIngredientId: Record<string, number> = {};
      inventorySnap.docs.forEach((d) => {
        const inv = d.data() as InventoryDoc;
        inventoryByIngredientId[d.id] = inv.currentStock;
      });

      const suggestion = await createCostAwareMenuSuggestion(
        db,
        { targetServingCount },
        recipes,
        ingredients,
        inventoryByIngredientId,
        snapshot,
        uid,
      );
      setLatestResult(suggestion);
      await loadHistory();
      toast({ title: '建議完成', description: '已產生性價比菜單建議' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      toast({ title: '建議失敗', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <Toaster />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold">性價比菜單建議</h1>
            <p className="text-sm text-muted-foreground">依成本與庫存人工參考用啟發式菜色排序建議</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/market-prices')}>
          前往市場行情
        </Button>
      </div>

      {/* Form */}
      <section className="rounded-lg border bg-card p-5 shadow-sm space-y-3">
        <h2 className="text-base font-semibold">新增建議</h2>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="targetServingCount" className="text-sm font-medium">目標份數 *</label>
            <Input
              id="targetServingCount"
              type="number"
              min={1}
              max={10000}
              value={targetServingCount}
              onChange={(e) => setTargetServingCount(Number(e.target.value))}
              className="w-40"
            />
          </div>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '建議中…' : '產生建議'}
          </Button>
        </div>
        {snapshotMissing && (
          <p className="text-xs text-yellow-700">
            尚無今日市價快取，將以基準價計算，可先至「市場行情」更新市價。
          </p>
        )}
      </section>

      {/* Latest result */}
      {latestResult && (
        <section>
          <h2 className="mb-3 text-base font-semibold">
            最新建議結果（{latestResult.priceSnapshotDate ? `市價快取日期 ${latestResult.priceSnapshotDate}` : '無市價快取，全部使用基準價'}）
          </h2>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <CostAwareResultTable result={latestResult} />
          </div>
        </section>
      )}

      {/* History */}
      {historyLoaded && (
        <section>
          <h2 className="mb-3 text-base font-semibold">歷史建議記錄</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無記錄</p>
          ) : (
            <div className="space-y-2">
              {history.map((rec) => {
                const expanded = expandedId === rec.id;
                const createdAt = rec.createdAt
                  ? (rec.createdAt as { toDate?: () => Date }).toDate?.()?.toLocaleString('zh-TW') ?? ''
                  : '';
                return (
                  <div key={rec.id} className="rounded-lg border">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(expanded ? null : rec.id)}
                    >
                      <div className="flex items-center gap-3 text-sm">
                        <span>{rec.targetServingCount} 份</span>
                        <span className="text-muted-foreground">{rec.assessedRecipeCount} 道菜評估</span>
                        <span className="text-muted-foreground">
                          {rec.priceSnapshotDate ? `市價 ${rec.priceSnapshotDate}` : '無市價快取'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {createdAt && <span>{createdAt}</span>}
                        <span>{expanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 border-t pt-4">
                        <CostAwareResultTable result={rec} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
