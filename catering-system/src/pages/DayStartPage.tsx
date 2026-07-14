/**
 * DayStartPage — Feature 044: 一日開工精靈（首頁）
 *
 * The single entry point for daily work. One screen, three moves:
 *   1. 選日期與人數
 *   2. 挑菜（手選，或按「推薦」用市價＋庫存排序）
 *   3. 一鍵開工 → 依序自動建立 菜單→備料→採購→製程→排程，全程顯示進度
 *
 * All records are created through `dayStartService` (which reuses the
 * existing per-collection create functions), so everything stays editable
 * in the advanced pages afterwards. Recommendation ranking reuses the pure
 * `calculateCostAwareMenuSuggestion` — display-only here, nothing persisted.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Rocket, Sparkles, CheckCircle2, XCircle, Circle, Loader2, MinusCircle, ListChecks } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { Recipe, InventoryDoc, CostAwareRecipeAssessmentItem } from '@/services/types';
import { listRecipes } from '@/services/recipeService';
import { listMenus } from '@/services/recipeMenuService';
import { listIngredients } from '@/services/ingredientMasterService';
import { getMarketPriceSnapshot } from '@/services/marketPriceService';
import { calculateCostAwareMenuSuggestion } from '@/services/costAwareMenuSuggestionService';
import { runDayStart, type DayStartStep, type DayStartResult } from '@/services/dayStartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const RECOMMEND_PRECHECK_COUNT = 5;

type Phase = 'pick' | 'running' | 'done';

function StepIcon({ status }: { status: DayStartStep['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={16} className="text-green-600" />;
    case 'failed':
      return <XCircle size={16} className="text-red-600" />;
    case 'running':
      return <Loader2 size={16} className="animate-spin text-primary" />;
    case 'skipped':
      return <MinusCircle size={16} className="text-muted-foreground/50" />;
    default:
      return <Circle size={16} className="text-muted-foreground/40" />;
  }
}

export default function DayStartPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pick');
  const [date, setDate] = useState(today());
  const [headCount, setHeadCount] = useState(100);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [existingMenuCount, setExistingMenuCount] = useState(0);

  const [recommending, setRecommending] = useState(false);
  const [assessmentByRecipeId, setAssessmentByRecipeId] = useState<Map<string, CostAwareRecipeAssessmentItem> | null>(null);
  const [rankedIds, setRankedIds] = useState<string[] | null>(null);

  const [steps, setSteps] = useState<DayStartStep[]>([]);
  const [runResult, setRunResult] = useState<DayStartResult | null>(null);

  useEffect(() => {
    listRecipes(db)
      .then(setRecipes)
      .catch(() => toast({ variant: 'destructive', title: '無法載入配方' }))
      .finally(() => setLoadingRecipes(false));
  }, []);

  useEffect(() => {
    listMenus(db)
      .then((menus) => setExistingMenuCount(menus.filter((m) => m.date === date).length))
      .catch(() => setExistingMenuCount(0));
  }, [date]);

  async function handleRecommend() {
    setRecommending(true);
    try {
      const [ingredients, inventorySnap, snapshot] = await Promise.all([
        listIngredients(db),
        getDocs(collection(db, 'inventory')),
        getMarketPriceSnapshot(db, today()),
      ]);
      const inventoryByIngredientId: Record<string, number> = {};
      inventorySnap.docs.forEach((d) => {
        inventoryByIngredientId[d.id] = (d.data() as InventoryDoc).currentStock;
      });
      const suggestion = calculateCostAwareMenuSuggestion(
        { targetServingCount: headCount },
        recipes,
        ingredients,
        inventoryByIngredientId,
        snapshot,
      );
      setAssessmentByRecipeId(new Map(suggestion.items.map((i) => [i.recipeId, i])));
      setRankedIds(suggestion.items.map((i) => i.recipeId));
      setPicked(new Set(suggestion.items.slice(0, RECOMMEND_PRECHECK_COUNT).map((i) => i.recipeId)));
      if (!snapshot) {
        toast({ title: '提醒', description: '今日尚無市價快取，成本以基準價估算（可先到市場行情頁更新）。' });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '推薦失敗',
        description: err instanceof Error ? err.message : '',
      });
    } finally {
      setRecommending(false);
    }
  }

  function togglePick(recipeId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }

  async function handleStart() {
    const uid = auth.currentUser?.uid ?? '';
    if (picked.size === 0 || !(headCount > 0) || !date) return;
    setPhase('running');
    const result = await runDayStart(
      db,
      { date, headCount, recipeIds: [...picked] },
      uid,
      setSteps,
    );
    setRunResult(result);
    setPhase('done');
  }

  function handleReset() {
    setPhase('pick');
    setSteps([]);
    setRunResult(null);
  }

  const displayedRecipes = useMemo(() => {
    const base = rankedIds
      ? [...recipes].sort((a, b) => {
          const ia = rankedIds.indexOf(a.id);
          const ib = rankedIds.indexOf(b.id);
          return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
        })
      : recipes;
    if (!search.trim()) return base;
    return base.filter((r) => r.name.includes(search.trim()));
  }, [recipes, rankedIds, search]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Rocket size={22} className="text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">今日開工</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            選好菜和人數，剩下的（備料、採購、製程、排程）一鍵搞定。
          </p>
        </div>
      </div>

      {phase === 'pick' && (
        <>
          {/* ── 1. 日期與人數 ── */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">1️⃣ 哪一天、幾個人吃</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="dayStartDate" className="mb-1 block text-xs text-muted-foreground">出餐日期</label>
                <Input
                  id="dayStartDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <label htmlFor="dayStartHeadCount" className="mb-1 block text-xs text-muted-foreground">用餐人數</label>
                <Input
                  id="dayStartHeadCount"
                  type="number"
                  min={1}
                  value={headCount}
                  onChange={(e) => setHeadCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-28"
                />
              </div>
              {existingMenuCount > 0 && (
                <p className="text-xs text-amber-700">
                  這天已有 {existingMenuCount} 份菜單（繼續會另建一份新的）—
                  <Link to="/daily-ops" className="underline">查看當日狀態</Link>
                </p>
              )}
            </div>
          </section>

          {/* ── 2. 挑菜 ── */}
          <section className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                2️⃣ 今天出什麼菜（已選 {picked.size} 道）
              </h2>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="搜尋配方…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-40 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecommend}
                  disabled={recommending || recipes.length === 0}
                  className="gap-1.5"
                >
                  <Sparkles size={13} />
                  {recommending ? '計算中…' : '推薦（依市價＋庫存）'}
                </Button>
              </div>
            </div>

            {loadingRecipes ? (
              <p className="py-6 text-center text-sm text-muted-foreground">載入配方中…</p>
            ) : recipes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                還沒有配方。先到「配方管理」建立，或用「從月菜單產生配方草稿」一鍵匯入。
              </p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto rounded-md border">
                {displayedRecipes.map((recipe) => {
                  const assessment = assessmentByRecipeId?.get(recipe.id);
                  const rank = rankedIds ? rankedIds.indexOf(recipe.id) : -1;
                  return (
                    <li key={recipe.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/20">
                        <input
                          type="checkbox"
                          checked={picked.has(recipe.id)}
                          onChange={() => togglePick(recipe.id)}
                        />
                        <span className="flex-1 font-medium text-gray-900">{recipe.name}</span>
                        {rank >= 0 && rank < RECOMMEND_PRECHECK_COUNT && (
                          <Badge variant="default">推薦 #{rank + 1}</Badge>
                        )}
                        {assessment && (
                          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {assessment.estimatedCostPerServing != null
                              ? `$${assessment.estimatedCostPerServing.toFixed(1)}/份`
                              : '成本未知'}
                            {assessment.maxServingsFromStock != null &&
                              `・庫存可做 ${assessment.maxServingsFromStock} 份`}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── 3. 開工 ── */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">3️⃣ 一鍵開工</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              系統會依序建立：當日菜單 → 備料需求 → 採購需求草稿 → 製程任務 → 人力排程建議。
              全部都是草稿，之後可在各頁面調整；採購不會自動送出。
            </p>
            <Button
              size="lg"
              className="gap-2"
              disabled={picked.size === 0}
              onClick={handleStart}
            >
              <Rocket size={16} />
              開工（{picked.size} 道菜 × {headCount} 人份）
            </Button>
          </section>
        </>
      )}

      {(phase === 'running' || phase === 'done') && (
        <section className="rounded-lg border p-4">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
            {phase === 'running' ? '處理中…' : runResult?.completed ? '✅ 今天的準備工作都排好了' : '⚠️ 部分步驟未完成'}
          </h2>
          <ul className="space-y-3">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-3 text-sm">
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    {phase === 'done' && step.status === 'done' && (
                      <Link to={step.linkTo} className="text-xs text-primary underline">查看</Link>
                    )}
                  </div>
                  {step.detail && (
                    <p className={`text-xs ${step.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {step.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {phase === 'done' && (
            <>
              {runResult && runResult.warnings.length > 0 && (
                <div className="mt-4 rounded-md bg-amber-50 p-3">
                  <p className="mb-1 text-xs font-medium text-amber-800">請人工確認：</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                    {runResult.warnings.slice(0, 6).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {runResult.warnings.length > 6 && (
                      <li>…等 {runResult.warnings.length} 項</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="gap-1.5" onClick={() => navigate('/daily-ops')}>
                  <ListChecks size={14} /> 查看每日工作總覽
                </Button>
                <Button variant="outline" onClick={handleReset}>再排一天</Button>
              </div>
            </>
          )}
        </section>
      )}

      <Toaster />
    </div>
  );
}
