import { useEffect, useState } from 'react';
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
import MenuImportPage from '@/pages/MenuImportPage';
import MarketPricePage from '@/pages/MarketPricePage';
import DailyOpsPage from '@/pages/DailyOpsPage';
import WeekPlanPage from '@/pages/WeekPlanPage';
import KitchenSettingsPage from '@/pages/KitchenSettingsPage';
import Analytics from '@/pages/Analytics';
import ShareOrderPage from '@/pages/share/ShareOrderPage';
import Login from '@/pages/Login';
import { WeightUnitProvider } from '@/contexts/WeightUnitContext';

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
        <Route path="share/:orderId" element={<ShareOrderPage />} />

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
          <Route path="menu-import" element={<MenuImportPage />} />
          <Route path="market-prices" element={<MarketPricePage />} />
          <Route path="daily-ops" element={<DailyOpsPage />} />
          <Route path="week-plan" element={<WeekPlanPage />} />
          <Route path="kitchen-settings" element={<KitchenSettingsPage />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </WeightUnitProvider>
  );
}
