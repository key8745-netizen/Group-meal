import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import OrderEntry from '@/pages/OrderEntry';
import InventoryStatus from '@/pages/InventoryStatus';
import PurchasePage from '@/pages/PurchasePage';
import PlanPage from '@/pages/PlanPage';
import MenusPage from '@/pages/MenusPage';
import Analytics from '@/pages/Analytics';
import Login from '@/pages/Login';
import ShareOrderPage from '@/pages/share/ShareOrderPage';

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
    <BrowserRouter>
      <Routes>
        {/* Public — no login required */}
        <Route path="share/:orderId" element={<ShareOrderPage />} />

        {/* Auth-protected */}
        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<OrderEntry />} />
          <Route path="inventory" element={<InventoryStatus />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="menus" element={<MenusPage />} />
          <Route path="purchase" element={<PurchasePage />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
