import { useState } from 'react';
import type {
  ProcessType,
  ScheduledTaskAssignment,
  ProductionScheduleStatus,
  AvailableStaffInput,
  AvailableEquipmentInput,
} from '@/services/types';
import { ExecutionBoard } from './ExecutionBoard';

/** Feature 106: 以「開工時鐘時間」為錨，把偏移分鐘換成當日 ISO。 */
function withClock(baseISO: string, hhmm: string): string {
  const d = new Date(baseISO);
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function toClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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

/** Feature 105: 排程甘特圖——每個任務一條橫條，實心=要顧、淺色斜紋=免顧（燉煮中）；
 *  時間上並排的橫條代表同時進行。一眼看出「炒青菜卡在滷肉的免顧空檔裡」。 */
function GanttTimeline({ result, anchorISO }: { result: ScheduleResultData; anchorISO: string }) {
  const { scheduledTasks, makespanMinutes } = result;
  if (scheduledTasks.length === 0 || makespanMinutes <= 0) return null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * makespanMinutes));
  const stripes =
    'repeating-linear-gradient(45deg, rgba(16,185,129,0.28), rgba(16,185,129,0.28) 3px, transparent 3px, transparent 6px)';
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">
        排程甘特圖
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          實心＝要顧、淺色斜紋＝免顧（燉煮中）；並排＝同時進行
        </span>
      </h4>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="relative mb-1 ml-28 h-4 text-[10px] text-muted-foreground">
            {ticks.map((m, i) => (
              <div
                key={i}
                className={`absolute whitespace-nowrap ${i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                style={{ left: `${(m / makespanMinutes) * 100}%` }}
              >
                {formatClock(anchorISO, m)}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {scheduledTasks.map((t) => {
              const dur = t.endOffsetMinutes - t.startOffsetMinutes;
              // 舊排程建議文件可能沒有 attentionMinutes → 視為全程要顧。
              const attn = Number.isFinite(t.attentionMinutes) ? t.attentionMinutes : dur;
              const leftPct = (t.startOffsetMinutes / makespanMinutes) * 100;
              const widthPct = Math.max((dur / makespanMinutes) * 100, 0.6);
              const attendPct = dur > 0 ? Math.min(100, (attn / dur) * 100) : 100;
              const passive = dur - attn;
              return (
                <div key={t.taskId} className="flex items-center gap-2">
                  <div className="w-28 shrink-0 truncate text-xs" title={t.taskName}>{t.taskName}</div>
                  <div className="relative h-5 flex-1 rounded bg-muted/40">
                    <div
                      className="absolute top-0 flex h-5 overflow-hidden rounded"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`+${t.startOffsetMinutes}–+${t.endOffsetMinutes} 分｜要顧 ${t.attentionMinutes} 分${passive > 0 ? `、免顧 ${passive} 分` : ''}`}
                    >
                      <div className="h-full bg-emerald-500" style={{ width: `${attendPct}%` }} />
                      {passive > 0 && (
                        <div className="h-full flex-1 bg-emerald-500/10" style={{ backgroundImage: stripes }} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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

  const suggestedStartLabel = new Date(result.workStartSuggestion).toLocaleString('zh-TW');

  // Feature 106: 以使用者設定的「開工時間」為錨，把時間軸攤在真實時鐘上並判定來不來得及。
  // 幾何關係：workStartSuggestion = 出餐時間 − (makespan + buffer)（＝最晚開工）。
  //   出餐緩衝底線 deadline = workStartSuggestion + makespan；出餐時間 = deadline + buffer。
  //   餘裕 slack = workStartSuggestion − 開工錨（>0 提早、有空檔；<0 開太晚、來不及）。
  const [startClock, setStartClock] = useState(() => toClock(result.workStartSuggestion));
  // Feature 107: 執行看板模式
  const [execMode, setExecMode] = useState(false);
  // storageKey 以排程起始時間＋總工時為鍵，換排程自動切換狀態
  const storageKey = `exec-${result.workStartSuggestion}-${result.makespanMinutes}`;
  const anchorISO = withClock(result.workStartSuggestion, startClock);
  const finishISO = new Date(new Date(anchorISO).getTime() + result.makespanMinutes * 60000).toISOString();
  const deadlineISO = new Date(new Date(result.workStartSuggestion).getTime() + result.makespanMinutes * 60000).toISOString();
  const serviceISO = new Date(new Date(deadlineISO).getTime() + result.bufferMinutes * 60000).toISOString();
  const slackMin = Math.round((new Date(result.workStartSuggestion).getTime() - new Date(anchorISO).getTime()) / 60000);
  const onTime = slackMin >= 0;
  const hasTasks = result.scheduledTasks.length > 0 && result.makespanMinutes > 0;

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
          { label: '建議最晚開工', value: suggestedStartLabel },
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

      {/* Feature 106: 開工時間規劃——設定實際上班時間，看這段時間怎麼排、來不來得及 */}
      {hasTasks && (
        <div className={`rounded-md border p-4 ${onTime ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              我幾點開工
              <input
                type="time"
                value={startClock}
                onChange={(e) => setStartClock(e.target.value || startClock)}
                className="rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
              />
            </label>
            <span className="text-sm text-muted-foreground">
              → 預計 <b className="text-foreground tabular-nums">{formatClock(finishISO, 0)}</b> 完工
              　·　出餐 <span className="tabular-nums">{formatClock(serviceISO, 0)}</span>
              （前 {result.bufferMinutes} 分緩衝 → 需 <span className="tabular-nums">{formatClock(deadlineISO, 0)}</span> 前完成）
            </span>
          </div>
          <p className={`mt-2 text-sm font-semibold ${onTime ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {onTime
              ? `✅ 來得及——完工後距出餐緩衝底線還有 ${slackMin} 分空檔（最晚拖到 ${formatClock(result.workStartSuggestion, 0)} 開工也趕得上）`
              : `⚠️ 來不及——這樣會做到 ${formatClock(finishISO, 0)}，超出底線 ${-slackMin} 分。請提早到 ${formatClock(result.workStartSuggestion, 0)} 前開工，或加人／減菜。`}
          </p>
        </div>
      )}

      {/* Feature 105/107: 檢視模式切換（甘特圖 ↔ 執行看板） */}
      {hasTasks && (
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
          <button
            onClick={() => setExecMode(false)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${!execMode ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            甘特圖
          </button>
          <button
            onClick={() => setExecMode(true)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${execMode ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            執行看板
          </button>
        </div>
      )}

      {execMode ? (
        <ExecutionBoard
          scheduledTasks={result.scheduledTasks}
          anchorISO={anchorISO}
          storageKey={storageKey}
        />
      ) : (
        <>
      {/* Feature 105: 視覺甘特圖（Feature 106: 錨定使用者開工時間） */}
      <GanttTimeline result={result} anchorISO={anchorISO} />

      {/* Timeline table */}
      {result.scheduledTasks.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-sm font-semibold">排程時間軸（明細）</h4>
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
                      {formatClock(anchorISO, t.startOffsetMinutes)}
                    </div>
                  </td>
                  <td className="py-1 pr-4 whitespace-nowrap">
                    +{t.endOffsetMinutes} 分
                    <div className="text-xs text-muted-foreground">
                      {formatClock(anchorISO, t.endOffsetMinutes)}
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
        </>
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
