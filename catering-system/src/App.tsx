import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import OrderEntry from '@/pages/OrderEntry';
import InventoryStatus from '@/pages/InventoryStatus';
import PurchasePage from '@/pages/PurchasePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<OrderEntry />} />
          <Route path="inventory" element={<InventoryStatus />} />
          <Route path="purchase" element={<PurchasePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
