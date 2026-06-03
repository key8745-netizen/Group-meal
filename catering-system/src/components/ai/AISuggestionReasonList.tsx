import type { BlockedReason } from '@/types/aiBoundary';

interface Props {
  blockedReasons: BlockedReason[];
  warnings: BlockedReason[];
  /** Optional human-readable rationale string */
  rationale?: string;
}

const REASON_LABELS: Partial<Record<BlockedReason, string>> = {
  UNVERIFIED_OCR_SOURCE:        'OCR 資料未驗證',
  EXPIRED_SNAPSHOT:             '資料快照已過期',
  SNAPSHOT_DEBUG_NOT_ALLOWED:   'Debug 快照不可使用',
  MISSING_INGREDIENT_ID:        '缺少食材 ID',
  TENANT_MISMATCH:              '租戶資料不一致',
  INCOMPLETE_BOM:               '配方資料不完整',
  MISSING_GRAMS_FIELD:          '缺少庫存重量資料',
  LEGACY_KG_FALLBACK_USED:      '使用舊版 kg 格式（建議驗證）',
  NEGATIVE_STOCK_UNVERIFIED:    '庫存異常（負值未驗證）',
  UNIT_MIGRATION_MISMATCH:      '單位遷移不一致',
  MISSING_AUDIT_TRAIL:          '缺少稽核鏈',
};

function formatReason(r: BlockedReason): string {
  return REASON_LABELS[r] ?? r.replace(/_/g, ' ');
}

export function AISuggestionReasonList({ blockedReasons, warnings, rationale }: Props) {
  const hasBlocked = blockedReasons.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAny = hasBlocked || hasWarnings || !!rationale;

  if (!hasAny) return null;

  return (
    <div data-testid="reason-list" className="space-y-2 text-sm">
      {rationale && (
        <div className="text-gray-600">
          <span className="font-medium">建議理由：</span>{rationale}
        </div>
      )}

      {hasBlocked && (
        <div>
          <p className="font-medium text-red-700 mb-1">阻擋原因</p>
          <ul className="list-disc list-inside space-y-0.5">
            {blockedReasons.map(r => (
              <li key={r} className="text-red-600">{formatReason(r)}</li>
            ))}
          </ul>
        </div>
      )}

      {hasWarnings && (
        <div>
          <p className="font-medium text-yellow-700 mb-1">注意事項</p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map(w => (
              <li key={w} className="text-yellow-600">{formatReason(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
