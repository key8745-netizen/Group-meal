/**
 * TodayPrep — shows today's planned dishes and aggregates ingredient requirements.
 * Compares against live inventory and lets staff create a purchase order for shortages.
 */

import { useEffect, useState } from 'react';
import { UtensilsCrossed, AlertTriangle, CheckCircle, ShoppingCart } from 'lucide-react';
import type { MealPlan, Menu } from '@/services/types';
import { mealPlanService, dishService } from '@/services/mealPlanService';
import { checkInventoryFeasibility, type FeasibilityItem } from '@/services/recipeMatchingService';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AggregatedItem {
  ingredientId:   string;
  name:           string;
  requiredKg:     number;
  currentStockKg: number;
  shortageKg:     number;
  shortageTaijin: number;
  isShortage:     boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtKg     = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} kg`;
const fmtTaijin = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} 台斤`;
const r3        = (n: number) => Math.round(n * 1000) / 1000;

// ─── TodayPrep ────────────────────────────────────────────────────────────────

export function TodayPrep() {
  const [plan,     setPlan]     = useState<MealPlan | null>(null);
  const [dishes,   setDishes]   = useState<Menu[]>([]);
  const [items,    setItems]    = useState<AggregatedItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);

  const today = mealPlanService.today();

  useEffect(() => {
    setLoading(true);

    mealPlanService.get(today)
      .then(async (dayPlan) => {
        setPlan(dayPlan);
        if (!dayPlan || dayPlan.menuIds.length === 0) return;

        const allDishes = await dishService.list();
        const todayDishes = allDishes.filter((d) => dayPlan.menuIds.includes(d.id));
        setDishes(todayDishes);

        // Check feasibility for each dish, then aggregate by ingredient
        const results = await Promise.all(
          dayPlan.menuIds
            .filter((id) => todayDishes.find((d) => d.id === id))
            .map((id) => checkInventoryFeasibility(db, id, dayPlan.headCount)),
        );

        // Aggregate ingredient requirements across all dishes
        const agg = new Map<string, AggregatedItem>();
        results.forEach((result) => {
          result.items.forEach((item: FeasibilityItem) => {
            const prev = agg.get(item.ingredientId);
            if (prev) {
              prev.requiredKg = r3(prev.requiredKg + item.requiredKg);
            } else {
              agg.set(item.ingredientId, {
                ingredientId:   item.ingredientId,
                name:           item.name,
                requiredKg:     item.requiredKg,
                currentStockKg: item.currentStockKg,
                shortageKg:     0,
                shortageTaijin: 0,
                isShortage:     false,
              });
            }
          });
        });

        // Re-compute shortages after aggregation
        const aggregated: AggregatedItem[] = Array.from(agg.values()).map((item) => {
          const shortage = r3(Math.max(0, item.requiredKg - item.currentStockKg));
          return {
            ...item,
            shortageKg:     shortage,
            shortageTaijin: r3(shortage / 0.6),
            isShortage:     item.currentStockKg < item.requiredKg,
          };
        });

        aggregated.sort((a, b) => Number(b.isShortage) - Number(a.isShortage) || a.name.localeCompare(b.name, 'zh-TW'));
        setItems(aggregated);
      })
      .catch(() => toast({ variant: 'destructive', title: '無法載入今日菜單' }))
      .finally(() => setLoading(false));
  }, [today]);

  async function createPurchaseOrder() {
    const shortages = items.filter((i) => i.isShortage);
    if (shortages.length === 0) return;
    setCreating(true);
    try {
      const orderId = await purchaseOrderService.createOrder(
        shortages.map((i) => ({
          ingredientId:   i.ingredientId,
          name:           i.name,
          purchaseQtyKg:  i.shortageKg,
          purchaseTaijin: i.shortageTaijin,
        })),
      );
      toast({ title: '採購單已建立', description: `採購單 #${orderId.slice(-8)} 共 ${shortages.length} 項。` });
    } catch (err) {
      toast({ variant: 'destructive', title: '建立失敗', description: err instanceof Error ? err.message : '' });
    } finally {
      setCreating(false);
    }
  }

  const shortages  = items.filter((i) => i.isShortage);
  const isFeasible = shortages.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <UtensilsCrossed size={20} className="text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">今日備料</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {today} — 依今日菜單計算所有食材需求，核對現有庫存。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : !plan || plan.menuIds.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
          <UtensilsCrossed size={40} strokeWidth={1.1} />
          <p className="text-sm font-medium">今日尚未排定菜單</p>
          <p className="text-xs">請至「每月菜單計畫」tab 新增今日菜色。</p>
        </div>
      ) : (
        <>
          {/* Today's dishes summary */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">今日菜色（{plan.headCount} 人份）</p>
              {isFeasible ? (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle size={14} /> 庫存充足
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle size={14} /> {shortages.length} 項食材不足
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {dishes.map((d) => (
                <Badge key={d.id} variant="outline">{d.name}</Badge>
              ))}
            </div>
            {plan.notes && (
              <p className="text-xs text-muted-foreground">{plan.notes}</p>
            )}
          </div>

          {/* Shortage action */}
          {!isFeasible && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">
                {shortages.length} 項食材庫存不足，建議立即建立採購單。
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={createPurchaseOrder}
                disabled={creating}
                className="gap-1.5"
              >
                <ShoppingCart size={13} />
                {creating ? '建立中…' : '建立採購單'}
              </Button>
            </div>
          )}

          {/* Ingredient requirements table */}
          {items.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>食材名稱</TableHead>
                    <TableHead className="text-right">需求量</TableHead>
                    <TableHead className="text-right">現有庫存</TableHead>
                    <TableHead className="text-right">缺貨量 (台斤)</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow
                      key={item.ingredientId}
                      className={item.isShortage ? 'bg-red-50/60 dark:bg-red-950/20' : idx % 2 !== 0 ? 'bg-muted/30' : ''}
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKg(item.requiredKg)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${item.isShortage ? 'text-destructive font-medium' : ''}`}>
                        {fmtKg(item.currentStockKg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.isShortage ? (
                          <span className="font-medium text-destructive">−{fmtTaijin(item.shortageTaijin)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.isShortage ? (
                          <Badge variant="destructive" className="text-xs">缺貨</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">充足</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <Toaster />
    </div>
  );
}
