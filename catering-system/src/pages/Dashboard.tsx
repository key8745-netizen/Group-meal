import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { ClipboardList, Package, ShoppingCart, TrendingDown } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Ingredient, InventoryDoc } from '@/services/types';
import { UnitConverter } from '@/services/unitConverter';
import { generatePurchaseSuggestion } from '@/services/purchaseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface LowStockItem {
  ingredientId: string;
  ingredientName: string;
  currentStockKg: number;
  safetyLevelKg: number;
}

const fmtKg = (n: number) => `${n.toFixed(2)} kg`;
const fmtCurrency = (n: number) =>
  `NT$ ${n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;

export default function Dashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [todayOrderCount, setTodayOrderCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [purchaseEstimate, setPurchaseEstimate] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        const [orderSnap, inventorySnap, ingredientSnap, suggestion] = await Promise.all([
          getDocs(query(
            collection(db, 'orders'),
            where('orderDate', '>=', Timestamp.fromDate(todayStart)),
            where('orderDate', '<', Timestamp.fromDate(tomorrowStart)),
          )),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'ingredients')),
          generatePurchaseSuggestion(db),
        ]);

        setTodayOrderCount(orderSnap.size);
        setPurchaseEstimate(suggestion.totalEstimatedCost);

        const ingredientMap = new Map<string, Ingredient>();
        ingredientSnap.docs.forEach(doc => {
          ingredientMap.set(doc.id, { id: doc.id, ...doc.data() } as Ingredient);
        });

        const lowItems: LowStockItem[] = [];
        inventorySnap.docs.forEach(doc => {
          const inv = doc.data() as InventoryDoc;
          const ing = ingredientMap.get(inv.ingredientId);
          if (!ing) return;
          const currentStockKg = inv.currentStock ?? 0;
          let safetyLevelKg = 0;
          try {
            safetyLevelKg = UnitConverter.toKg(ing.minStockLevel, ing.unit);
          } catch {
            safetyLevelKg = ing.minStockLevel;
          }
          if (currentStockKg < safetyLevelKg) {
            lowItems.push({
              ingredientId: inv.ingredientId,
              ingredientName: inv.ingredientName,
              currentStockKg,
              safetyLevelKg,
            });
          }
        });

        setLowStockItems(
          lowItems.sort((a, b) =>
            (a.currentStockKg / Math.max(a.safetyLevelKg, 0.001)) -
            (b.currentStockKg / Math.max(b.safetyLevelKg, 0.001)),
          ),
        );
      } catch {
        // Dashboard is best-effort
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const kpis = [
    {
      title: '今日訂單',
      icon: ClipboardList,
      value: loading ? null : String(todayOrderCount),
      desc: '今日新建訂單總數',
      alert: false,
    },
    {
      title: '低庫存食材',
      icon: TrendingDown,
      value: loading ? null : String(lowStockItems.length),
      desc: '低於安全水位的食材項目',
      alert: lowStockItems.length > 0,
    },
    {
      title: '待採購預估',
      icon: ShoppingCart,
      value: loading ? null : purchaseEstimate !== null ? fmtCurrency(purchaseEstimate) : '—',
      desc: '依庫存及訂單需求估算',
      alert: false,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">控制台</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">餐飲管理系統總覽</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map(({ title, icon: Icon, value, desc, alert }) => (
          <Card key={title} className={alert ? 'border-destructive/50' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <Icon size={16} className={alert ? 'text-destructive' : 'text-muted-foreground'} />
            </CardHeader>
            <CardContent>
              {value === null ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <div className={`text-3xl font-bold tabular-nums ${alert ? 'text-destructive' : ''}`}>
                  {value}
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Body: Alerts + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">

        {/* Alerts panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">庫存警示</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : lowStockItems.length === 0 ? (
            <Alert>
              <AlertDescription>
                ✓ 目前所有食材庫存充足，無警示項目。
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-hidden rounded-lg border border-destructive/30">
              <Table>
                <TableHeader>
                  <TableRow className="bg-destructive/5 hover:bg-destructive/5">
                    <TableHead>食材名稱</TableHead>
                    <TableHead className="text-right">目前庫存</TableHead>
                    <TableHead className="text-right">安全水位</TableHead>
                    <TableHead className="text-right">缺口</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item, idx) => {
                    const gap = item.safetyLevelKg - item.currentStockKg;
                    const ratio = item.safetyLevelKg > 0
                      ? item.currentStockKg / item.safetyLevelKg
                      : 0;
                    const isCritical = ratio < 0.3;
                    return (
                      <TableRow
                        key={item.ingredientId}
                        className={idx % 2 !== 0 ? 'bg-muted/30' : ''}
                      >
                        <TableCell className="font-medium">{item.ingredientName}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {fmtKg(item.currentStockKg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtKg(item.safetyLevelKg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                          −{fmtKg(gap)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isCritical ? 'destructive' : 'outline'}
                            className={isCritical ? '' : 'border-amber-400 text-amber-700'}
                          >
                            {isCritical ? '嚴重不足' : '偏低'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">快捷操作</h2>
          <div className="space-y-2 rounded-lg border p-4">
            <Button className="w-full justify-start gap-2" onClick={() => navigate('/orders')}>
              <ClipboardList size={14} />
              快速下單
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/purchase')}
            >
              <ShoppingCart size={14} />
              生成採購單
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/inventory')}
            >
              <Package size={14} />
              查看庫存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
