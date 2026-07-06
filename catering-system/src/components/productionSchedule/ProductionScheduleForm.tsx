import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { listProductionWorkflowPlans } from '@/services/productionWorkflowService';
import type { ProductionWorkflowPlan, EquipmentType, AvailableStaffInput, AvailableEquipmentInput } from '@/services/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductionScheduleInput } from '@/services/productionScheduleService';

const EQUIPMENT_TYPE_OPTIONS: EquipmentType[] = [
  'sink', 'cuttingStation', 'prepTable', 'wok', 'stoveBurner',
  'stockPot', 'deepFryer', 'oven', 'steamer', 'holdingCabinet',
  'coolingArea', 'packingTable', 'refrigerator',
];

const EQUIPMENT_LABELS: Record<string, string> = {
  sink: '水槽', cuttingStation: '切菜台', prepTable: '備料台', wok: '炒鍋',
  stoveBurner: '爐頭', stockPot: '湯鍋', deepFryer: '油炸鍋', oven: '烤箱',
  steamer: '蒸爐', holdingCabinet: '保溫箱', coolingArea: '冷卻區',
  packingTable: '分裝台', refrigerator: '冰箱',
};

function defaultServiceDateTime(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T11:30`;
}

interface Props {
  onSubmit: (planId: string, planName: string, input: ProductionScheduleInput) => Promise<void>;
  submitting: boolean;
}

export function ProductionScheduleForm({ onSubmit, submitting }: Props) {
  const [plans, setPlans] = useState<ProductionWorkflowPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [targetServiceDateTime, setTargetServiceDateTime] = useState(defaultServiceDateTime());
  const [capacityWindowMinutes, setCapacityWindowMinutes] = useState(240);
  const [bufferMinutes, setBufferMinutes] = useState(30);
  const [availableStaff, setAvailableStaff] = useState<AvailableStaffInput[]>([
    { role: '', count: 1 },
  ]);
  const [availableEquipment, setAvailableEquipment] = useState<AvailableEquipmentInput[]>([
    { type: 'wok', count: 1 },
  ]);

  useEffect(() => {
    listProductionWorkflowPlans(db, { includeInactive: false }).then(setPlans).catch(() => {});
  }, []);

  function addStaffRow() {
    setAvailableStaff((prev) => [...prev, { role: '', count: 1 }]);
  }

  function removeStaffRow(idx: number) {
    setAvailableStaff((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStaffRow(idx: number, field: keyof AvailableStaffInput, value: string | number) {
    setAvailableStaff((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    );
  }

  function addEquipmentRow() {
    setAvailableEquipment((prev) => [...prev, { type: 'sink', count: 1 }]);
  }

  function removeEquipmentRow(idx: number) {
    setAvailableEquipment((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateEquipmentRow(
    idx: number,
    field: keyof AvailableEquipmentInput,
    value: string | number,
  ) {
    setAvailableEquipment((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selectedPlan = plans.find((p) => p.id === planId);
    if (!selectedPlan) return;
    await onSubmit(planId, selectedPlan.planName, {
      targetServiceDateTime: new Date(targetServiceDateTime),
      capacityWindowMinutes,
      bufferMinutes,
      availableStaff,
      availableEquipment,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="planId" className="text-sm font-medium">製程規劃 *</label>
        <select
          id="planId"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          required
        >
          <option value="">請選擇製程規劃…</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.planName}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="targetServiceDateTime" className="text-sm font-medium">供餐時間 *</label>
        <Input
          id="targetServiceDateTime"
          type="datetime-local"
          value={targetServiceDateTime}
          onChange={(e) => setTargetServiceDateTime(e.target.value)}
          required
        />
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="capacityWindowMinutes" className="text-sm font-medium">產能時窗（分鐘）*</label>
          <Input
            id="capacityWindowMinutes"
            type="number"
            min={1}
            value={capacityWindowMinutes}
            onChange={(e) => setCapacityWindowMinutes(Number(e.target.value))}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label htmlFor="bufferMinutes" className="text-sm font-medium">緩衝時間（分鐘）</label>
          <Input
            id="bufferMinutes"
            type="number"
            min={0}
            value={bufferMinutes}
            onChange={(e) => setBufferMinutes(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Available Staff */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">可用人員</label>
          <Button type="button" variant="outline" size="sm" onClick={addStaffRow}>＋ 新增人員</Button>
        </div>
        {availableStaff.map((row, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input
              placeholder="職務角色"
              value={row.role}
              onChange={(e) => updateStaffRow(idx, 'role', e.target.value)}
              className="flex-1"
              required
            />
            <Input
              type="number"
              min={1}
              value={row.count}
              onChange={(e) => updateStaffRow(idx, 'count', Number(e.target.value))}
              className="w-20"
              required
            />
            {availableStaff.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeStaffRow(idx)}>✕</Button>
            )}
          </div>
        ))}
      </div>

      {/* Available Equipment */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">可用設備</label>
          <Button type="button" variant="outline" size="sm" onClick={addEquipmentRow}>＋ 新增設備</Button>
        </div>
        {availableEquipment.map((row, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm flex-1"
              value={row.type}
              onChange={(e) => updateEquipmentRow(idx, 'type', e.target.value as EquipmentType)}
            >
              {EQUIPMENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{EQUIPMENT_LABELS[t] ?? t}</option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              value={row.count}
              onChange={(e) => updateEquipmentRow(idx, 'count', Number(e.target.value))}
              className="w-20"
              required
            />
            {availableEquipment.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeEquipmentRow(idx)}>✕</Button>
            )}
          </div>
        ))}
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? '排程中…' : '產生排程建議'}
      </Button>
    </form>
  );
}
