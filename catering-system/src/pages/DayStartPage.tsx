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
import { Rocket, Sparkles, CheckCircle2, XCircle, Circle, Loader2, MinusCircle, ListChecks, CalendarDays } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { Recipe, InventoryDoc, IngredientMaster, MarketPriceSnapshot, CostAwareRecipeAssessmentItem } from '@/services/types';
import { listRecipes } from '@/services/recipeService';
import { listMenus } from '@/services/recipeMenuService';
import { listIngredients } from '@/services/ingredientMasterService';
import { getMarketPriceSnapshot } from '@/services/marketPriceService';
import { calculateCostAwareMenuSuggestion, estimateRecipeCostPerServing, type RecipeCostEstimate } from '@/services/costAwareMenuSuggestionService';
import { runDayStart, loadMonthlyMenuDay, type DayStartStep, type DayStartResult } from '@/services/dayStartService';
import { getKitchenSettings } from '@/services/kitchenSettingsService';
import { computeLowStock, planSafetyRestock } from '@/services/stockAlertService';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
  const { confirm, confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pick');
  const [date, setDate] = useState(today());
  const [headCount, setHeadCount] = useState(100);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [existingMenuCount, setExistingMenuCount] = useState(0);

  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [monthlyUnmatched, setMonthlyUnmatched] = useState<string[]>([]);
  /** Feature 056: 已排好日期的狀態卡；使用者按「再排一份」後隱藏。 */
  const [showPlannerAnyway, setShowPlannerAnyway] = useState(false);
  /** 自動帶入月菜單的提示（每個日期只自動帶一次）。 */
  const [autoLoadedNote, setAutoLoadedNote] = useState('');
  const [autoLoadedDate, setAutoLoadedDate] = useState('');

  const [costIngredients, setCostIngredients] = useState<IngredientMaster[]>([]);
  const [costSnapshot, setCostSnapshot] = useState<MarketPriceSnapshot | null>(null);
  const [targetCostPerServing, setTargetCostPerServing] = useState(0);
  const [stockKgById, setStockKgById] = useState<Map<string, number>>(new Map());
  const [creatingRestock, setCreatingRestock] = useState(false);
  const [restockDone, setRestockDone] = useState(false);

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
    // Feature 053: 挑菜即時成本（市價優先、基準價備援）——失敗僅不顯示成本。
    listIngredients(db).then(setCostIngredients).catch(() => setCostIngredients([]));
    getMarketPriceSnapshot(db, today()).then(setCostSnapshot).catch(() => setCostSnapshot(null));
    // Feature 055: 每人成本目標（廚房設定；0 = 未設定）。
    getKitchenSettings(db).then((s) => setTargetCostPerServing(s.targetCostPerServing));
    // Feature 057: 低庫存警示——讀取現有庫存（失敗僅不顯示警示）。
    getDocs(collection(db, 'inventory'))
      .then((snap) => {
        const map = new Map<string, number>();
        snap.docs.forEach((d) => {
          const inv = d.data() as InventoryDoc;
          if (typeof inv.currentStock === 'number') map.set(d.id, inv.currentStock);
        });
        setStockKgById(map);
      })
      .catch(() => setStockKgById(new Map()));
  }, []);

  const lowStock = useMemo(
    () => computeLowStock(costIngredients, stockKgById),
    [costIngredients, stockKgById],
  );

  async function handleSafetyRestock() {
    const lines = planSafetyRestock(lowStock);
    if (lines.length === 0) return;
    const proceed = await confirm({
      title: '一鍵補貨到安全量',
      description: `將建立「補到安全量」採購單（待採購）：${lines.length} 項食材。\n${lines.map((l) => `${l.name} ${l.purchaseQtyKg}kg`).join('、')}`,
      confirmLabel: '建立補貨單',
    });
    if (!proceed) return;
    setCreatingRestock(true);
    try {
      await purchaseOrderService.createOrder(lines);
      setRestockDone(true);
      toast({ title: '已建立補貨採購單', description: `${lines.length} 項食材已轉入採購管理（待採購）；收貨時自動入庫。` });
    } catch (err) {
      toast({ variant: 'destructive', title: '建立採購單失敗', description: err instanceof Error ? err.message : '' });
    } finally {
      setCreatingRestock(false);
    }
  }

  const costEstimateByRecipeId = useMemo(() => {
    if (costIngredients.length === 0) return new Map<string, RecipeCostEstimate>();
    const ingredientById = new Map(costIngredients.map((i) => [i.id, i]));
    const map = new Map<string, RecipeCostEstimate>();
    for (const recipe of recipes) {
      map.set(recipe.id, estimateRecipeCostPerServing(recipe, ingredientById, costSnapshot));
    }
    return map;
  }, [recipes, costIngredients, costSnapshot]);

  const pickedCost = useMemo(() => {
    let perPerson = 0;
    let incompleteCount = 0;
    let pricedDishCount = 0;
    for (const id of picked) {
      const est = costEstimateByRecipeId.get(id);
      if (!est || est.costPerServing == null) { incompleteCount++; continue; }
      perPerson += est.costPerServing;
      pricedDishCount++;
      if (!est.complete) incompleteCount++;
    }
    return { perPerson, incompleteCount, pricedDishCount };
  }, [picked, costEstimateByRecipeId]);

  useEffect(() => {
    setShowPlannerAnyway(false);
    setAutoLoadedNote('');
    listMenus(db)
      .then((menus) => setExistingMenuCount(menus.filter((m) => m.date === date).length))
      .catch(() => setExistingMenuCount(0));
  }, [date]);

  // Feature 056: 這天還沒排 → 自動帶入月菜單（每個日期只嘗試一次，安靜失敗）。
  useEffect(() => {
    if (recipes.length === 0 || existingMenuCount > 0 || autoLoadedDate === date || phase !== 'pick') return;
    setAutoLoadedDate(date);
    loadMonthlyMenuDay(db, date, recipes)
      .then((res) => {
        if (res.matched.length === 0) return;
        setPicked(new Set(res.matched.map((m) => m.recipeId)));
        setMonthlyUnmatched(res.unmatchedDishNames);
        if (res.headCountHint) setHeadCount(res.headCountHint);
        setAutoLoadedNote(
          `已自動帶入月菜單 ${res.matched.length} 道菜`
          + (res.headCountHint ? `・${res.headCountHint} 人份` : '')
          + '，可自行增減',
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, recipes, existingMenuCount, autoLoadedDate, phase]);

  async function handleLoadMonthlyMenu() {
    setLoadingMonthly(true);
    try {
      const res = await loadMonthlyMenuDay(db, date, recipes);
      if (!res.monthCovered) {
        toast({ title: '找不到月菜單', description: `尚未匯入 ${date.slice(0, 7)} 的月菜單（可至「月菜單匯入」建立）。` });
        return;
      }
      if (res.matched.length === 0 && res.unmatchedDishNames.length === 0) {
        toast({ title: '這天沒有排菜', description: '月菜單中這個日期沒有菜色（假日或未填）。' });
        return;
      }
      setPicked(new Set(res.matched.map((m) => m.recipeId)));
      setMonthlyUnmatched(res.unmatchedDishNames);
      if (res.headCountHint) setHeadCount(res.headCountHint);
      toast({
        title: `已帶入 ${res.matched.length} 道菜`,
        description: res.unmatchedDishNames.length > 0
          ? `另有 ${res.unmatchedDishNames.length} 道找不到配方（見下方提示）`
          : res.headCountHint ? `人數帶入月菜單基準 ${res.headCountHint} 人` : undefined,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: '帶入失敗', description: err instanceof Error ? err.message : '' });
    } finally {
      setLoadingMonthly(false);
    }
  }

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Rocket size={22} className="text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">今日開工</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            選好菜和人數，剩下的（備料、採購、製程、排程）一鍵搞定。
          </p>
        </div>
      </div>

      {/* ── Feature 057: 低庫存警示（有追蹤安全量的食材才會出現）── */}
      {phase === 'pick' && lowStock.length > 0 && !restockDone && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            ⚠️ {lowStock.length} 項食材低於安全庫存
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {lowStock.slice(0, 6).map((i) => `${i.ingredientName}（${i.currentKg}/${i.safetyKg}kg）`).join('、')}
            {lowStock.length > 6 && ` …等 ${lowStock.length} 項`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-amber-400" onClick={handleSafetyRestock} disabled={creatingRestock}>
              {creatingRestock ? '建立中…' : '補到安全量建採購單'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}>
              查看庫存
            </Button>
          </div>
        </section>
      )}

      {/* ── Feature 056: 這天已排好 → 狀態卡（不再逼使用者看空白挑菜畫面）── */}
      {phase === 'pick' && existingMenuCount > 0 && !showPlannerAnyway && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-green-600" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-green-900">
                {date === today() ? '今天已排好' : `${date} 已排好`}（{existingMenuCount} 份菜單）
              </h2>
              <p className="mt-0.5 text-sm text-green-800">
                備料、採購、排程的狀態到每日工作總覽看；出餐後記得到備料快照按「出餐扣料」。
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => navigate(`/daily-ops?date=${date}`)}>
                  <ListChecks size={14} /> 查看每日工作總覽
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPlannerAnyway(true)}>
                  我要再排一份
                </Button>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 w-40"
                  aria-label="切換日期"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {phase === 'pick' && (existingMenuCount === 0 || showPlannerAnyway) && (
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
                  onClick={handleLoadMonthlyMenu}
                  disabled={loadingMonthly || recipes.length === 0}
                  className="gap-1.5"
                >
                  <CalendarDays size={13} />
                  {loadingMonthly ? '載入中…' : '帶入月菜單'}
                </Button>
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

            {autoLoadedNote && (
              <div className="mb-3 rounded-md bg-green-50 p-3 text-xs text-green-800">
                📋 {autoLoadedNote}
              </div>
            )}

            {monthlyUnmatched.length > 0 && (
              <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                月菜單中這 {monthlyUnmatched.length} 道找不到配方，未帶入：{monthlyUnmatched.join('、')}
                <span className="block pt-1">
                  可至「配方管理 → 從月菜單產生配方草稿」建立後再回來帶入。
                </span>
              </div>
            )}

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
                  const estimate = costEstimateByRecipeId.get(recipe.id);
                  const rank = rankedIds ? rankedIds.indexOf(recipe.id) : -1;
                  return (
                    <li key={recipe.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/20">
                        <input
                          type="checkbox"
                          checked={picked.has(recipe.id)}
                          onChange={() => togglePick(recipe.id)}
                        />
                        <span className="flex-1 font-medium text-foreground">{recipe.name}</span>
                        {rank >= 0 && rank < RECOMMEND_PRECHECK_COUNT && (
                          <Badge variant="default">推薦 #{rank + 1}</Badge>
                        )}
                        {assessment ? (
                          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {assessment.estimatedCostPerServing != null
                              ? `$${assessment.estimatedCostPerServing.toFixed(1)}/份`
                              : '成本未知'}
                            {assessment.maxServingsFromStock != null &&
                              `・庫存可做 ${assessment.maxServingsFromStock} 份`}
                          </span>
                        ) : estimate && estimate.costPerServing != null ? (
                          <span
                            className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                            title={estimate.complete ? '所有食材皆有價' : '部分食材無價，成本偏低'}
                          >
                            ${estimate.costPerServing.toFixed(1)}/份
                            {!estimate.complete && <span className="text-amber-600">*</span>}
                          </span>
                        ) : null}
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
            {picked.size > 0 && pickedCost.pricedDishCount > 0 && (
              <p className="mb-3 rounded-md bg-muted/30 p-3 text-sm tabular-nums">
                💰 預估食材成本：每人約 <span className="font-semibold">${pickedCost.perPerson.toFixed(1)}</span>
                ・{headCount} 人共約 <span className="font-semibold">NT$ {Math.round(pickedCost.perPerson * headCount).toLocaleString('zh-TW')}</span>
                {pickedCost.incompleteCount > 0 && (
                  <span className="text-xs text-amber-700">（{pickedCost.incompleteCount} 道成本不完整，實際會略高）</span>
                )}
                {targetCostPerServing > 0 && (
                  pickedCost.perPerson <= targetCostPerServing ? (
                    <span className="block pt-1 text-xs font-medium text-green-700">
                      ✅ 低於目標 ${targetCostPerServing}/人（還有 ${(targetCostPerServing - pickedCost.perPerson).toFixed(1)} 空間）
                    </span>
                  ) : (
                    <span className="block pt-1 text-xs font-medium text-red-600">
                      ⚠️ 超出目標 ${targetCostPerServing}/人（+${(pickedCost.perPerson - targetCostPerServing).toFixed(1)}/人，
                      {headCount} 人多 NT$ {Math.round((pickedCost.perPerson - targetCostPerServing) * headCount).toLocaleString('zh-TW')}）
                    </span>
                  )
                )}
                <span className="block pt-1 text-xs text-muted-foreground">
                  {costSnapshot ? '以今日市價優先、無市價項用基準價估算' : '今日無市價快取，以基準價估算（可先到市場行情更新）'}
                </span>
              </p>
            )}
            <p className="mb-3 text-xs text-muted-foreground">
              系統會依序建立：當日菜單 → 備料需求 → 採購需求草稿（自動扣除現有庫存，
              只列實際要買的量）→ 製程任務 → 人力排程建議。
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
      {confirmDialog}
    </div>
  );
}
