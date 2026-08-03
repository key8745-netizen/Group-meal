import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AppLayout from '@/components/layout/AppLayout';
import DayStartPage from '@/pages/DayStartPage';
import Dashboard from '@/pages/Dashboard';
import InventoryStatus from '@/pages/InventoryStatus';
import PurchasePage from '@/pages/PurchasePage';
import IngredientMasterPage from '@/pages/IngredientMasterPage';
import RecipePage from '@/pages/RecipePage';
import RecipeMenuPage from '@/pages/RecipeMenuPage';
import PrepPlanPage from '@/pages/PrepPlanPage';
import PurchaseDemandDraftPage from '@/pages/PurchaseDemandDraftPage';
import ProductionWorkflowPage from '@/pages/ProductionWorkflowPage';
import ProductionSchedulePage from '@/pages/ProductionSchedulePage';
import MenuSuggestionsPage from '@/pages/MenuSuggestionsPage';
import MenuDraftsPage from '@/pages/MenuDraftsPage';
import DailyOpsPage from '@/pages/DailyOpsPage';
import WeekPlanPage from '@/pages/WeekPlanPage';
import KitchenSettingsPage from '@/pages/KitchenSettingsPage';
import ShareOrderPage from '@/pages/share/ShareOrderPage';
import Login from '@/pages/Login';
import { WeightUnitProvider } from '@/contexts/WeightUnitContext';

// 這三頁把兩個最大的相依（recharts ~491kB、xlsx ~332kB）拖進 bundle，但都不是
// 每天會開的頁面——廚房日常走的是「今日開工」那條鏈。改成延遲載入後，這些位元組
// 只在真的點進去時才下載，首次載入少掉約 800kB（gzip 約 258kB）。
const MenuImportPage  = lazy(() => import('@/pages/MenuImportPage'));   // xlsx
const MarketPricePage = lazy(() => import('@/pages/MarketPricePage'));  // recharts
const Analytics       = lazy(() => import('@/pages/Analytics'));        // recharts

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      載入中…
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        載入中…
      </div>
    );
  }

  if (!user) return <Login />;

  return <>{children}</>;
}

export default function App() {
  return (
    <WeightUnitProvider>
    <BrowserRouter>
      <Routes>
        {/* Public: purchase-order share links sent to suppliers */}
        <Route path="share/:shareToken" element={<ShareOrderPage />} />

        {/* Auth-protected */}
        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route index element={<DayStartPage />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inventory" element={<InventoryStatus />} />
          <Route path="purchase" element={<PurchasePage />} />
          <Route path="ingredients-master" element={<IngredientMasterPage />} />
          <Route path="recipes" element={<RecipePage />} />
          <Route path="recipe-menus" element={<RecipeMenuPage />} />
          <Route path="prep-plans" element={<PrepPlanPage />} />
          <Route path="purchase-demand-drafts" element={<PurchaseDemandDraftPage />} />
          <Route path="production-workflows" element={<ProductionWorkflowPage />} />
          <Route path="production-schedules" element={<ProductionSchedulePage />} />
          <Route path="menu-suggestions" element={<MenuSuggestionsPage />} />
          <Route path="menu-mix-recommendations" element={<Navigate to="/menu-suggestions" replace />} />
          <Route path="cost-menu-suggestions" element={<Navigate to="/menu-suggestions?tab=cost" replace />} />
          <Route path="menu-drafts" element={<MenuDraftsPage />} />
          <Route path="menu-import" element={<Suspense fallback={<RouteFallback />}><MenuImportPage /></Suspense>} />
          <Route path="market-prices" element={<Suspense fallback={<RouteFallback />}><MarketPricePage /></Suspense>} />
          <Route path="daily-ops" element={<DailyOpsPage />} />
          <Route path="week-plan" element={<WeekPlanPage />} />
          <Route path="kitchen-settings" element={<KitchenSettingsPage />} />
          <Route path="analytics" element={<Suspense fallback={<RouteFallback />}><Analytics /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </WeightUnitProvider>
  );
}
