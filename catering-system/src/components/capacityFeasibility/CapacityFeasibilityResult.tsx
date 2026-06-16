import type { CapacityResult, FeasibilityStatus } from '@/services/types';

const EQUIPMENT_LABELS: Record<string, string> = {
  sink: '水槽', cuttingStation: '切菜台', prepTable: '備料台', wok: '炒鍋',
  stoveBurner: '爐頭', stockPot: '湯鍋', deepFryer: '油炸鍋', oven: '烤箱',
  steamer: '蒸爐', holdingCabinet: '保溫箱', coolingArea: '冷卻區',
  packingTable: '分裝台', refrigerator: '冰箱',
};

function statusBadge(status: FeasibilityStatus) {
  const map: Record<FeasibilityStatus, { label: string; cls: string }> = {
    feasible: { label: '可行', cls: 'bg-green-100 text-green-800' },
    risky: { label: '有風險', cls: 'bg-yellow-100 text-yellow-800' },
    notRecommended: { label: '不建議', cls: 'bg-red-100 text-red-800' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function riskBadge(level: 'low' | 'medium' | 'high') {
  const map = {
    low: { label: '低風險', cls: 'bg-green-50 text-green-700' },
    medium: { label: '中風險', cls: 'bg-yellow-50 text-yellow-700' },
    high: { label: '高風險', cls: 'bg-red-50 text-red-700' },
  };
  const { label, cls } = map[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatRatio(ratio: number): string {
  if (!isFinite(ratio)) return '∞ / 資源不足';
  return `${Math.round(ratio * 100)}%`;
}

function ratioStatusCls(ratio: number): string {
  if (!isFinite(ratio) || ratio > 1.0) return 'text-red-600 font-semibold';
  if (ratio > 0.8) return 'text-yellow-600 font-semibold';
  return 'text-green-700';
}

interface Props {
  result: CapacityResult;
  planName: string;
  createdAt?: string;
}

export function CapacityFeasibilityResult({ result, planName, createdAt }: Props) {
  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">{planName}</span>
          {statusBadge(result.feasibilityStatus)}
          {riskBadge(result.riskLevel)}
        </div>
        {createdAt && (
          <p className="text-xs text-muted-foreground">{createdAt}</p>
        )}
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '有效任務數', value: result.activeTaskCount },
          { label: '估計總任務分鐘', value: `${result.estimatedTotalTaskMinutes} 分` },
          { label: '產能時窗', value: `${result.capacityWindowMinutes} 分` },
          { label: '可並行比率', value: `${Math.round(result.parallelizationRatio * 100)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-base font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Equipment load ratios */}
      {Object.keys(result.equipmentLoadRatios).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">設備負載率</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1 pr-4">設備</th>
                <th className="pb-1 pr-4">累計分鐘</th>
                <th className="pb-1">負載率</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.equipmentLoadRatios).map(([type, ratio]) => (
                <tr key={type} className="border-b last:border-0">
                  <td className="py-1 pr-4">{EQUIPMENT_LABELS[type] ?? type}</td>
                  <td className="py-1 pr-4">
                    {result.estimatedCriticalEquipmentMinutes[type] ?? 0} 分
                  </td>
                  <td className={`py-1 ${ratioStatusCls(ratio)}`}>
                    {formatRatio(ratio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Staff load ratios */}
      {Object.keys(result.staffLoadRatios).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">人員負載率</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1 pr-4">職務</th>
                <th className="pb-1">負載率</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.staffLoadRatios).map(([role, ratio]) => (
                <tr key={role} className="border-b last:border-0">
                  <td className="py-1 pr-4">{role}</td>
                  <td className={`py-1 ${ratioStatusCls(ratio)}`}>
                    {formatRatio(ratio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottlenecks */}
      {(result.bottleneckEquipmentTypes.length > 0 || result.bottleneckStaffRoles.length > 0) && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">瓶頸資源</h4>
          <ul className="text-sm space-y-1">
            {result.bottleneckEquipmentTypes.map((t) => (
              <li key={t} className="text-yellow-700">⚠ 設備：{EQUIPMENT_LABELS[t] ?? t}</li>
            ))}
            {result.bottleneckStaffRoles.map((r) => (
              <li key={r} className="text-yellow-700">⚠ 人員：{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sequence risk notes */}
      {result.sequenceRiskNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">順序風險提示</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {result.sequenceRiskNotes.map((note, i) => (
              <li key={i}>• {note}</li>
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
        本評估為人工參考用啟發式估算，非精確排程結果
      </p>
    </div>
  );
}
