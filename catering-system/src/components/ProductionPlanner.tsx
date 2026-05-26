import { useEffect, useState } from 'react';
import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { AlertTriangle, ChefHat, RefreshCw } from 'lucide-react';
import {
  calculateRequiredIngredients,
  checkInventoryFeasibility,
  type FeasibilityItem,
  type FeasibilityResult,
} from '@/services/recipeMatchingService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Toaster } from '@/components/ui/toaster';
import { toast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipe {
  id:   string;
  name: string;
}

interface ProductionPlannerProps {
  db: Firestore;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtKg    = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;
const fmtTaijin = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} 台斤`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

function FeasibilitySummary({ result }: { result: FeasibilityResult }) {
  const shortages = result.items.filter((i) => i.isShortage);
  if (result.isFeasible) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        庫存充足，可生產此份量
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
      <AlertTriangle size={14} />
      {shortages.length} 項食材庫存不足，請先補貨
    </div>
  );
}

function IngredientRow({ item, idx }: { item: FeasibilityItem; idx: number }) {
  const rowBase = item.isShortage
    ? 'bg-red-50 dark:bg-red-950/20'
    : idx % 2 !== 0
      ? 'bg-muted/30'
      : '';

  return (
    <TableRow className={rowBase}>
      {/* 食材名稱 */}
      <TableCell className="font-medium">{item.name}</TableCell>

      {/* 需求量 kg */}
      <TableCell className="text-right tabular-nums">{fmtKg(item.requiredKg)}</TableCell>

      {/* 需求量 台斤 */}
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtTaijin(item.requiredKg <= 0 ? 0 : /* requiredTaijin passed via item */ (item as FeasibilityItem & { requiredTaijin?: number }).requiredTaijin ?? 0)}
      </TableCell>

      {/* 庫存現狀 */}
      <TableCell className="text-right tabular-nums">
        <span className={item.isShortage ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
          {fmtKg(item.currentStockKg)}
        </span>
      </TableCell>

      {/* 缺貨量 台斤 */}
      <TableCell className="text-right tabular-nums">
        {item.isShortage ? (
          <Badge variant="destructive" className="font-mono text-xs">
            -{fmtTaijin(item.shortageTaijin)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── ProductionPlanner ────────────────────────────────────────────────────────

export function ProductionPlanner({ db }: ProductionPlannerProps) {
  const [recipes,    setRecipes]    = useState<Recipe[]>([]);
  const [recipeId,   setRecipeId]   = useState('');
  const [headCount,  setHeadCount]  = useState(360);
  const [result,     setResult]     = useState<FeasibilityResult | null>(null);
  const [richItems,  setRichItems]  = useState<(FeasibilityItem & { requiredTaijin: number })[]>([]);

  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [loadingResult,  setLoadingResult]  = useState(false);

  // ── Load recipe list ─────────────────────────────────────────────────────

  useEffect(() => {
    getDocs(collection(db, 'menus'))
      .then((snaps) => {
        const list = snaps.docs.map((d) => ({
          id:   d.id,
          name: (d.data().name as string) ?? d.id,
        }));
        setRecipes(list);
        if (list.length > 0) setRecipeId(list[0].id);
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入菜單清單' }))
      .finally(() => setLoadingRecipes(false));
  }, [db]);

  // ── Recalculate when recipeId or headCount changes ───────────────────────

  useEffect(() => {
    if (!recipeId || headCount <= 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setLoadingResult(true);

    Promise.all([
      checkInventoryFeasibility(db, recipeId, headCount),
      calculateRequiredIngredients(db, recipeId, headCount),
    ]).then(([feasibility, required]) => {
      if (cancelled) return;

      const taijinMap = new Map(required.map((r) => [r.ingredientId, r.requiredTaijin]));
      const enriched = feasibility.items.map((item) => ({
        ...item,
        requiredTaijin: taijinMap.get(item.ingredientId) ?? 0,
      }));

      setResult(feasibility);
      setRichItems(enriched);
    }).catch((err) => {
      if (cancelled) return;
      toast({
        variant:     'destructive',
        title:       '計算失敗',
        description: err instanceof Error ? err.message : '請稍後再試。',
      });
      setResult(null);
    }).finally(() => {
      if (!cancelled) setLoadingResult(false);
    });

    return () => { cancelled = true; };
  }, [db, recipeId, headCount]);

  // ── Render ────────────────────────────────────────────────────────────────

  const busy = loadingRecipes || loadingResult;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Header */}
      <div className="flex items-center gap-2">
        <ChefHat size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">備料規劃</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            依菜單與人數計算食材需求，即時核對庫存狀態。
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">

          {/* Recipe selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">選擇菜單</label>
            {loadingRecipes ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <select
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                disabled={busy}
                className="h-9 w-48 rounded-md border bg-background px-3 text-sm
                           focus:outline-none focus:ring-2 focus:ring-ring
                           disabled:opacity-50"
              >
                {recipes.length === 0 && (
                  <option value="">（無菜單）</option>
                )}
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Head count input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">供餐人數</label>
            <div className="relative w-32">
              <Input
                type="number"
                min={1}
                step={10}
                value={headCount}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n > 0) setHeadCount(n);
                }}
                disabled={busy}
                className="pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                人
              </span>
            </div>
          </div>

          {/* Refresh indicator */}
          {loadingResult && (
            <div className="flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
              <RefreshCw size={12} className="animate-spin" />
              計算中…
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result table */}
      {!loadingResult && result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">食材需求清單</CardTitle>
              <FeasibilitySummary result={result} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>食材名稱</TableHead>
                  <TableHead className="text-right">需求量 (kg)</TableHead>
                  <TableHead className="text-right">需求量 (台斤)</TableHead>
                  <TableHead className="text-right">現有庫存</TableHead>
                  <TableHead className="text-right">缺貨量 (台斤)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {richItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      此菜單沒有食材資料
                    </TableCell>
                  </TableRow>
                ) : (
                  richItems.map((item, idx) => (
                    <IngredientRow key={item.ingredientId} item={item} idx={idx} />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {loadingResult && <TableSkeleton />}

      <Toaster />
    </div>
  );
}
