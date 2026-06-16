import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { listPrepPlans } from '@/services/prepPlanService';
import type { PrepPlan } from '@/services/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ProductionWorkflowFormValues {
  planName: string;
  sourcePrepPlanId: string;
  serviceDate: string;
  notes: string;
}

export function ProductionWorkflowForm({
  initial,
  sourcePrepPlanNameSnapshot,
  onSave,
  onCancel,
}: {
  initial?: ProductionWorkflowFormValues;
  sourcePrepPlanNameSnapshot?: string;
  onSave: (values: ProductionWorkflowFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [planName, setPlanName] = useState(initial?.planName ?? '');
  const [sourcePrepPlanId, setSourcePrepPlanId] = useState(initial?.sourcePrepPlanId ?? '');
  const [serviceDate, setServiceDate] = useState(initial?.serviceDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [prepPlans, setPrepPlans] = useState<PrepPlan[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) {
      listPrepPlans(db, { includeInactive: false }).then(setPrepPlans).catch(() => {});
    }
  }, [isEdit]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ planName, sourcePrepPlanId, serviceDate, notes });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="planName" className="text-sm font-medium">規劃名稱 *</label>
        <Input
          id="planName"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          placeholder="請輸入製程規劃名稱"
          required
        />
      </div>

      {isEdit ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">來源備料快照</label>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {sourcePrepPlanNameSnapshot ?? '—'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sourcePrepPlanId" className="text-sm font-medium">來源備料快照 *</label>
          <select
            id="sourcePrepPlanId"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={sourcePrepPlanId}
            onChange={(e) => setSourcePrepPlanId(e.target.value)}
            required
          >
            <option value="">請選擇備料快照…</option>
            {prepPlans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="serviceDate" className="text-sm font-medium">服務日期</label>
        <Input
          id="serviceDate"
          type="date"
          value={serviceDate}
          onChange={(e) => setServiceDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">備註</label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="選填"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? '儲存中…' : isEdit ? '更新規劃' : '建立規劃'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </form>
  );
}
