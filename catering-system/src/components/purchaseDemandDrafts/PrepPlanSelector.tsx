/**
 * PrepPlanSelector — dropdown of active prep plans from the Feature 013
 * prep plan data (/prepPlans/{id}, isActive === true only). Read-only.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import type { PrepPlan } from '@/services/types';
import { listPrepPlans } from '@/services/prepPlanService';

export function PrepPlanSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (prepPlanId: string, prepPlan: PrepPlan | undefined) => void;
}) {
  const [prepPlans, setPrepPlans] = useState<PrepPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPrepPlans(db, { includeInactive: false })
      .then(setPrepPlans)
      .finally(() => setLoading(false));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        onChange(id, prepPlans.find((p) => p.id === id));
      }}
      disabled={loading}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{loading ? '載入中…' : '請選擇備料規劃'}</option>
      {prepPlans.map((plan) => (
        <option key={plan.id} value={plan.id}>
          {plan.name}（{plan.date}）
        </option>
      ))}
    </select>
  );
}
