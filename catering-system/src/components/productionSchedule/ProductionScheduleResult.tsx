import type {
  ProcessType,
  ScheduledTaskAssignment,
  ProductionScheduleStatus,
  AvailableStaffInput,
  AvailableEquipmentInput,
} from '@/services/types';

const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  wash: '清洗', peel: '去皮', cut: '切割', marinate: '醃製', blanch: '汆燙',
  preCook: '預煮', cool: '冷卻', portion: '分裝', cook: '烹煮', hold: '保溫', clean: '清潔',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  sink: '水槽', cuttingStation: '切菜台', prepTable: '備料台', wok: '炒鍋',
  stoveBurner: '爐頭', stockPot: '湯鍋', deepFryer: '油炸鍋', oven: '烤箱',
  steamer: '蒸爐', holdingCabinet: '保溫箱', coolingArea: '冷卻區',
  packingTable: '分裝台', refrigerator: '冰箱', none: '無',
};

function statusBadge(status: ProductionScheduleStatus) {
  const map: Record<ProductionScheduleStatus, { label: string; cls: string }> = {
    fits: { label: '可完成', cls: 'bg-green-100 text-green-800' },
    overrun: { label: '超出時窗', cls: 'bg-yellow-100 text-yellow-800' },
    infeasible: { label: '無法排入', cls: 'bg-red-100 text-red-800' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatClock(workStartSuggestion: string, offsetMinutes: number): string {
  const t = new Date(new Date(workStartSuggestion).getTime() + offsetMinutes * 60000);
  return t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function formatUtilPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

interface ScheduleResultData {
  scheduleStatus: ProductionScheduleStatus;
  workStartSuggestion: string;
  makespanMinutes: number;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  scheduledTasks: ScheduledTaskAssignment[];
  unschedulableTaskIds: string[];
  staffUtilization: Record<string, number>;
  equipmentUtilization: Record<string, number>;
  manualReviewNotes: string[];
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
}

interface Props {
  result: ScheduleResultData;
  planName: string;
  createdAt?: string;
  /** Task names for unschedulable ids, when known (history detail may not have this map). */
  taskNameById?: Record<string, string>;
}

export function ProductionScheduleResult({ result, planName, createdAt, taskNameById }: Props) {
  const effectiveWindow = result.capacityWindowMinutes - result.bufferMinutes;

  // Per-staff-slot summary: busy minutes aggregated across all scheduledTasks assignments.
  const slotBusyMinutes = new Map<string, number>();
  for (const t of result.scheduledTasks) {
    const duration = t.endOffsetMinutes - t.startOffsetMinutes;
    for (const slotId of t.assignedStaffSlots) {
      slotBusyMinutes.set(slotId, (slotBusyMinutes.get(slotId) ?? 0) + duration);
    }
  }
  const allSlotIds: string[] = [];
  for (const row of result.availableStaff) {
    for (let i = 1; i <= row.count; i++) allSlotIds.push(`${row.role}#${i}`);
  }

  const workStartLabel = new Date(result.workStartSuggestion).toLocaleString('zh-TW');

  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">{planName}</span>
          {statusBadge(result.scheduleStatus)}
        </div>
        {createdAt && <p className="text-xs text-muted-foreground">{createdAt}</p>}
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '建議開工時間', value: workStartLabel },
          { label: '總工時 (makespan)', value: `${result.makespanMinutes} 分` },
          { label: '產能時窗', value: `${result.capacityWindowMinutes} 分` },
          { label: '有效時窗', value: `${effectiveWindow} 分` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-base font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Timeline table */}
      {result.scheduledTasks.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-sm font-semibold">排程時間軸</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1 pr-4">開始</th>
                <th className="pb-1 pr-4">結束</th>
                <th className="pb-1 pr-4">任務</th>
                <th className="pb-1 pr-4">製程</th>
                <th className="pb-1 pr-4">設備</th>
                <th className="pb-1 pr-4">人力配置</th>
                <th className="pb-1 pr-4">依賴</th>
                <th className="pb-1">警告</th>
              </tr>
            </thead>
            <tbody>
              {result.scheduledTasks.map((t) => (
                <tr key={t.taskId} className="border-b last:border-0 align-top">
                  <td className="py-1 pr-4 whitespace-nowrap">
                    +{t.startOffsetMinutes} 分
                    <div className="text-xs text-muted-foreground">
                      {formatClock(result.workStartSuggestion, t.startOffsetMinutes)}
                    </div>
                  </td>
                  <td className="py-1 pr-4 whitespace-nowrap">
                    +{t.endOffsetMinutes} 分
                    <div className="text-xs text-muted-foreground">
                      {formatClock(result.workStartSuggestion, t.endOffsetMinutes)}
                    </div>
                  </td>
                  <td className="py-1 pr-4">{t.taskName}</td>
                  <td className="py-1 pr-4">{PROCESS_TYPE_LABELS[t.processType] ?? t.processType}</td>
                  <td className="py-1 pr-4">
                    {t.assignedEquipmentSlot ?? (EQUIPMENT_LABELS[t.equipmentType] ?? t.equipmentType)}
                  </td>
                  <td className="py-1 pr-4">{t.assignedStaffSlots.join('、') || '—'}</td>
                  <td className="py-1 pr-4">{t.dependsOnTaskIds.join('、') || '—'}</td>
                  <td className="py-1 text-yellow-700">
                    {t.warnings.length > 0 ? t.warnings.join('；') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-staff-slot summary */}
      {allSlotIds.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">人力配置摘要</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1 pr-4">人力位</th>
                <th className="pb-1 pr-4">忙碌分鐘</th>
                <th className="pb-1">使用率</th>
              </tr>
            </thead>
            <tbody>
              {allSlotIds.map((slotId) => {
                const busy = slotBusyMinutes.get(slotId) ?? 0;
                const util = effectiveWindow > 0 ? busy / effectiveWindow : 0;
                return (
                  <tr key={slotId} className="border-b last:border-0">
                    <td className="py-1 pr-4">{slotId}</td>
                    <td className="py-1 pr-4">{busy} 分</td>
                    <td className="py-1">{formatUtilPct(util)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Equipment utilization */}
      {Object.keys(result.equipmentUtilization).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">設備使用率</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1 pr-4">設備</th>
                <th className="pb-1">使用率</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.equipmentUtilization).map(([type, ratio]) => (
                <tr key={type} className="border-b last:border-0">
                  <td className="py-1 pr-4">{EQUIPMENT_LABELS[type] ?? type}</td>
                  <td className="py-1">{formatUtilPct(ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unschedulable tasks */}
      {result.unschedulableTaskIds.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-red-700">無法排入的任務</h4>
          <ul className="text-sm space-y-1 text-red-700">
            {result.unschedulableTaskIds.map((id) => (
              <li key={id}>⚠ {taskNameById?.[id] ?? id}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Manual review notes */}
      {result.manualReviewNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">人工確認事項</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {result.manualReviewNotes.map((note, i) => (
              <li key={i}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground/60 border-t pt-3">
        排程建議不會回寫製程規劃，僅供排班參考。
      </p>
    </div>
  );
}
