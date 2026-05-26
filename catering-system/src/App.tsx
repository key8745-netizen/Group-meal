import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import OrderEntry from '@/pages/OrderEntry';
import InventoryStatus from '@/pages/InventoryStatus';
import PurchasePage from '@/pages/PurchasePage';
import Analytics from '@/pages/Analytics';
import Login from '@/pages/Login';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Still resolving auth state
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
      <AuthGuard>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<OrderEntry />} />
            <Route path="inventory" element={<InventoryStatus />} />
            <Route path="purchase" element={<PurchasePage />} />
            <Route path="analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </AuthGuard>
    </BrowserRouter>
  );
}
