import type { DraftPurchaseSuggestion } from '@/types/aiBoundary';
import { gramsToKg, gramsToTaijin } from '@/services/unitConversionService';
import { AISuggestionConfidenceBadge } from './AISuggestionConfidenceBadge';
import { AISuggestionReasonList } from './AISuggestionReasonList';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  draft: DraftPurchaseSuggestion;
  /** Called when user confirms they have reviewed the draft */
  onAcknowledge?: () => void;
  onCancel?: () => void;
}

// ─── AIDraftSuggestionPreview ─────────────────────────────────────────────────

/**
 * Read-only preview of a DraftPurchaseSuggestion.
 *
 * SAFETY INVARIANTS:
 *  - Does NOT show purchase order actions
 *  - Does NOT show submit / confirm purchase buttons
 *  - Does NOT show receive / inventory buttons
 *  - Does NOT show PENDING / RECEIVED status transitions
 *  - requiresHumanApproval is always displayed as true
 *  - Allowed button labels: 準備草稿建議 / 記錄草稿建議 / 取消 only
 */
export function AIDraftSuggestionPreview({ draft, onAcknowledge, onCancel }: Props) {
  const {
    ingredientName, ingredientId, suggestedQtyGrams, finalQtyGrams,
    confidence, status, blockedReasons, warnings,
    requiresHumanApproval, auditTrailId, sourceSnapshotId, suggestionId,
    feedbackId, overrideId, draftSuggestionId,
  } = draft;

  const isBlocked = status === 'BLOCKED' || blockedReasons.length > 0;

  return (
    <div
      data-testid="draft-suggestion-preview"
      className="rounded-lg border border-gray-200 shadow-sm bg-white overflow-hidden max-w-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">草稿採購建議預覽</h3>
          <AISuggestionConfidenceBadge level={confidence.level} />
        </div>
        <span
          data-testid="draft-status"
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isBlocked ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {status}
        </span>
      </div>

      {/* Requires human approval notice — always visible */}
      <div
        data-testid="requires-approval-notice"
        className="px-5 py-2 bg-amber-50 border-b border-amber-100"
      >
        <p className="text-xs text-amber-800 font-medium">
          ⚠ 此草稿需要人工確認才能進入採購流程（Phase 6 開放）
        </p>
        <p className="text-xs text-amber-600">
          requiresHumanApproval: {String(requiresHumanApproval)}
        </p>
      </div>

      {/* Blocked banner */}
      {isBlocked && (
        <div
          data-testid="draft-blocked-banner"
          className="px-5 py-3 bg-red-50 border-b border-red-200"
        >
          <p className="text-sm font-medium text-red-700">此草稿已被阻擋，無法繼續</p>
          <AISuggestionReasonList blockedReasons={blockedReasons} warnings={warnings} />
        </div>
      )}

      {/* Ingredient / qty */}
      <div className="px-5 py-4 space-y-3">
        <div>
          <p className="text-sm text-gray-500">食材</p>
          <p className="font-semibold text-gray-900">{ingredientName ?? ingredientId}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs text-gray-500 mb-1">AI 建議數量</p>
            <p className="font-semibold text-gray-700">{gramsToKg(suggestedQtyGrams)} kg</p>
            <p className="text-xs text-gray-400">{gramsToTaijin(suggestedQtyGrams)} 台斤 / {suggestedQtyGrams} g</p>
          </div>
          <div className="bg-blue-50 rounded p-3">
            <p className="text-xs text-blue-600 mb-1">最終數量</p>
            <p className="font-semibold text-blue-800">{gramsToKg(finalQtyGrams)} kg</p>
            <p className="text-xs text-blue-400">{gramsToTaijin(finalQtyGrams)} 台斤 / {finalQtyGrams} g</p>
          </div>
        </div>

        {!isBlocked && <AISuggestionReasonList blockedReasons={[]} warnings={warnings} />}
      </div>

      {/* Audit chain links */}
      <div className="px-5 pb-4 space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <p className="font-medium text-gray-700 text-sm mb-2">稽核鏈</p>
        <p><span className="font-medium">草稿 ID：</span><span className="font-mono">{draftSuggestionId}</span></p>
        <p><span className="font-medium">建議 ID：</span><span className="font-mono">{suggestionId}</span></p>
        <p><span className="font-medium">快照 ID：</span><span className="font-mono">{sourceSnapshotId}</span></p>
        <p><span className="font-medium">稽核軌跡：</span><span className="font-mono">{auditTrailId}</span></p>
        {feedbackId && (
          <p><span className="font-medium">覆寫意見：</span><span className="font-mono">{feedbackId}</span></p>
        )}
        {overrideId && (
          <p><span className="font-medium">覆寫紀錄：</span><span className="font-mono">{overrideId}</span></p>
        )}
      </div>

      {/* Actions — strictly no purchase/draft/inventory actions */}
      <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            data-testid="cancel-draft-btn"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
        )}
        {onAcknowledge && !isBlocked && (
          <button
            type="button"
            data-testid="acknowledge-draft-btn"
            onClick={onAcknowledge}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            記錄草稿建議
          </button>
        )}
      </div>
    </div>
  );
}
