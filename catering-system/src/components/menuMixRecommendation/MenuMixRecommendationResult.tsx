import type { MenuMixRecommendationResult } from '@/services/menuMixRecommendationService';

const STATUS_LABELS: Record<string, string> = {
  feasible: '可行',
  risky: '有風險',
  notRecommended: '不建議',
};

const STATUS_COLORS: Record<string, string> = {
  feasible: 'bg-green-100 text-green-800 border-green-300',
  risky: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  notRecommended: 'bg-red-100 text-red-800 border-red-300',
};

const RISK_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' };

interface Props {
  result: MenuMixRecommendationResult;
}

function RatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 150);
  const color = ratio > 1 ? 'bg-red-500' : ratio > 0.8 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums w-12 text-right">
        {isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '∞'}
      </span>
    </div>
  );
}

export function MenuMixRecommendationResult({ result }: Props) {
  const {
    recommendationStatus,
    riskLevel,
    recommendedMixItems,
    estimatedEquipmentLoadRatios,
    estimatedStaffLoadRatios,
    estimatedProcessLoadSummary,
    bottleneckWarnings,
    manualReviewNotes,
  } = result;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${STATUS_COLORS[recommendationStatus] ?? ''}`}>
          {STATUS_LABELS[recommendationStatus] ?? recommendationStatus}
        </span>
        <span className="text-sm text-muted-foreground">風險等級：{RISK_LABELS[riskLevel] ?? riskLevel}</span>
      </div>

      {/* Recommended mix */}
      {recommendedMixItems.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">菜色</th>
                <th className="px-3 py-2 text-right font-medium">份數</th>
                <th className="px-3 py-2 text-right font-medium">比例</th>
                <th className="px-3 py-2 text-left font-medium">主製程</th>
                <th className="px-3 py-2 text-left font-medium">主設備</th>
                <th className="px-3 py-2 text-right font-medium">負載分鐘</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recommendedMixItems.map((item) => (
                <tr key={item.recipeId} className="hover:bg-muted/20">
                  <td className="px-3 py-2">{item.recipeNameSnapshot}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.suggestedServingCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(item.suggestedRatio * 100)}%</td>
                  <td className="px-3 py-2">{item.primaryProcessType}</td>
                  <td className="px-3 py-2">{item.primaryEquipmentType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(item.estimatedLoadContribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.keys(estimatedEquipmentLoadRatios).length > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">設備負載率</h3>
            {Object.entries(estimatedEquipmentLoadRatios).map(([type, ratio]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span>{type}</span>
                </div>
                <RatioBar ratio={ratio} />
              </div>
            ))}
          </div>
        )}

        {Object.keys(estimatedStaffLoadRatios).length > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">人員負載率</h3>
            {Object.entries(estimatedStaffLoadRatios).map(([role, ratio]) => (
              <div key={role}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span>{role}</span>
                </div>
                <RatioBar ratio={ratio} />
              </div>
            ))}
          </div>
        )}

        {Object.keys(estimatedProcessLoadSummary).length > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">製程負載摘要（分鐘）</h3>
            {Object.entries(estimatedProcessLoadSummary).map(([proc, mins]) => (
              <div key={proc} className="flex justify-between text-sm">
                <span>{proc}</span>
                <span className="tabular-nums">{Math.round(mins)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottleneck warnings */}
      {bottleneckWarnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-yellow-800">瓶頸警告</p>
          {bottleneckWarnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700">• {w}</p>
          ))}
        </div>
      )}

      {/* Manual review notes */}
      {manualReviewNotes.length > 0 && (
        <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">人工審查備注</p>
          {manualReviewNotes.map((n, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {n}</p>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground border-t pt-3">
        本評估為人工參考用啟發式估算，非精確排程結果。
      </p>
    </div>
  );
}
