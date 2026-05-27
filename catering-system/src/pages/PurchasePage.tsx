import { useState } from 'react';
import { db } from '@/lib/firebase';
import { PurchasePlanner } from '@/components/PurchasePlanner';
import { PurchaseOrderList } from '@/components/PurchaseOrderList';
import { ManualPurchaseForm } from '@/components/ManualPurchaseForm';

type Tab = 'planner' | 'manual' | 'orders';

const TABS: { key: Tab; label: string }[] = [
  { key: 'planner', label: '採購建議' },
  { key: 'manual',  label: '手動建單' },
  { key: 'orders',  label: '採購單管理' },
];

export default function PurchasePage() {
  const [tab, setTab] = useState<Tab>('planner');

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex gap-1 border-b bg-muted/20 px-6 pt-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'border border-b-background -mb-px bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'planner' && <PurchasePlanner db={db} />}
      {tab === 'manual'  && <ManualPurchaseForm />}
      {tab === 'orders'  && <PurchaseOrderList />}
    </div>
  );
}
