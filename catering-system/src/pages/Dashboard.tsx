import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Package, ShoppingCart, TrendingDown, TrendingUp, UtensilsCrossed, ClipboardList, CalendarRange,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import type { IngredientMaster, InventoryDoc, MarketPriceSnapshot } from '@/services/types';
import { listMenus } from '@/services/recipeMenuService';
import { getMarketPriceSnapshot, todayLocalIsoDate } from '@/services/marketPriceService';
import { computeLowStock, type LowStockItem } from '@/services/stockAlertService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import MarketPriceCard from '@/components/dashboard/MarketPriceCard';
import CostAwareMenuCard from '@/components/dashboard/CostAwareMenuCard';
import ProductionScheduleCard from '@/components/dashboard/ProductionScheduleCard';

const fmtKg = (n: number) => `${n.toFixed(2)} kg`;

export default function Dashboard() {
  const navigate = useNavigate();

  const [loading,          setLoading]          = useState(true);
  const [todayMenuCount,   setTodayMenuCount]   = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [lowStockItems,    setLowStockItems]    = useState<LowStockItem[]>([]);
  const [marketSnapshot,   setMarketSnapshot]   = useState<MarketPriceSnapshot | null>(null);
  const [ingredientMasters, setIngredientMasters] = useState<IngredientMaster[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const today = todayLocalIsoDate();

        // Feature 058: KPI 全面改接新資料鏈（recipeMenus / purchaseOrders
        // PENDING / minStockLevel 低庫存 / 今日市價快取），移除舊 orders 與
        // AI 採購預估查詢。
        const [menus, inventorySnap, ingredientSnap, pendingSnap, snapshot] = await Promise.all([
          listMenus(db),
          getDocs(collection(db, 'inventory')),
          getDocs(collection(db, 'ingredients')),
          getDocs(query(collection(db, 'purchaseOrders'), where('status', '==', 'PENDING'))),
          getMarketPriceSnapshot(db, todayLocalIsoDate()).catch(() => null),
        ]);

        setTodayMenuCount(menus.filter((m) => m.date === today).length);
        setPendingOrderCount(pendingSnap.size);
        setMarketSnapshot(snapshot);

        // Feature 035: same docs, reused as IngredientMaster (additive fields
        // on the same `ingredients/{id}` doc — see marketPriceService) for
        // the 今日市場行情 dashboard card, avoiding a duplicate query.
        setIngredientMasters(
          ingredientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as IngredientMaster)),
        );

        // Feature 057: 低庫存改用 stockAlertService（minStockLevel 以 kg 計）。
        const stockKgById = new Map<string, number>();
        inventorySnap.docs.forEach(doc => {
          const inv = doc.data() as InventoryDoc;
          if (typeof inv.currentStock === 'number') stockKgById.set(doc.id, inv.currentStock);
        });
        setLowStockItems(computeLowStock(
          ingredientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as IngredientMaster)),
          stockKgById,
        ));
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
      title:   '今日菜單',
      icon:    CalendarRange,
      value:   loading ? null : String(todayMenuCount),
      desc:    todayMenuCount > 0 ? '今日出餐菜單已建立' : '今日尚未開工（首頁一鍵開工）',
      alert:   !loading && todayMenuCount === 0,
      onClick: () => navigate(todayMenuCount > 0 ? '/daily-ops' : '/'),
    },
    {
      title:   '低庫存食材',
      icon:    TrendingDown,
      value:   loading ? null : String(lowStockItems.length),
      desc:    '低於安全庫存（食材主檔可設定）',
      alert:   lowStockItems.length > 0,
      onClick: () => navigate('/inventory'),
    },
    {
      title:   '待收貨採購單',
      icon:    ShoppingCart,
      value:   loading ? null : String(pendingOrderCount),
      desc:    '貨到後至採購管理按收貨（自動入庫）',
      alert:   pendingOrderCount > 0,
      onClick: () => navigate('/purchase'),
    },
    {
      title:   '今日市價',
      icon:    TrendingUp,
      value:   loading ? null : marketSnapshot ? `${marketSnapshot.entries.length} 項` : '未更新',
      desc:    marketSnapshot ? `行情快取 ${marketSnapshot.rocDate}` : '開啟市場行情頁會自動抓取',
      alert:   !loading && !marketSnapshot,
      onClick: () => navigate('/market-prices'),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">控制台</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">餐飲管理系統總覽</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ title, icon: Icon, value, desc, alert, onClick }) => (
          <Card
            key={title}
            className={`cursor-pointer transition-shadow hover:shadow-md ${alert ? 'border-destructive/50' : ''}`}
            onClick={onClick}
          >
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

      {/* Feature 035: Intelligence cards — market prices, cost-aware menu, production schedule */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">智慧卡片</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MarketPriceCard ingredients={ingredientMasters} ready={!loading} />
          <CostAwareMenuCard />
          <ProductionScheduleCard />
        </div>
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
                    const ratio = item.safetyKg > 0 ? item.currentKg / item.safetyKg : 0;
                    const isCritical = ratio < 0.3;
                    return (
                      <TableRow
                        key={item.ingredientId}
                        className={idx % 2 !== 0 ? 'bg-muted/30' : ''}
                      >
                        <TableCell className="font-medium">{item.ingredientName}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {fmtKg(item.currentKg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtKg(item.safetyKg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">
                          −{fmtKg(item.deficitKg)}
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
            <Button className="w-full justify-start gap-2" onClick={() => navigate('/daily-ops')}>
              <ClipboardList size={14} />
              每日工作總覽
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/prep-plans')}
            >
              <UtensilsCrossed size={14} />
              備料快照
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/purchase')}
            >
              <ShoppingCart size={14} />
              採購管理
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
