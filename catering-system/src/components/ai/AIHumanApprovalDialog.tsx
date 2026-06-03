import { useState } from 'react';
import type { DraftPurchaseSuggestion } from '@/types/aiBoundary';
import type { ApproveDraftSuggestionResult } from '@/services/aiHumanApprovalService';
import { gramsToKg, gramsToTaijin } from '@/services/unitConversionService';
import { AISuggestionConfidenceBadge } from './AISuggestionConfidenceBadge';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  draft: DraftPurchaseSuggestion;
  actorUserId: string;
  onApprove: (result: ApproveDraftSuggestionResult) => void;
  onCancel: () => void;
}

// ─── AIHumanApprovalDialog ────────────────────────────────────────────────────

/**
 * Asks a human to explicitly confirm conversion of a DraftPurchaseSuggestion
 * into a purchaseOrders DRAFT document.
 *
 * SAFETY INVARIANTS:
 *  - No "送出採購" / "確認採購" / "入庫" / "立即下單" buttons
 *  - Allowed action: "建立 DRAFT 採購單" only
 *  - UI prominently warns: this is DRAFT only, not yet submitted, no inventory change
 *  - AI cannot invoke this dialog — actorUserId must be a logged-in human
 */
export function AIHumanApprovalDialog({ draft, actorUserId, onApprove, onCancel }: Props) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const kgDisplay     = gramsToKg(draft.finalQtyGrams);
  const taijinDisplay = gramsToTaijin(draft.finalQtyGrams);

  async function handleApprove() {
    setError('');
    if (!actorUserId) {
      setError('無法識別操作人員，請重新登入');
      return;
    }
    setLoading(true);
    try {
      const { approveDraftSuggestionForPurchaseOrder } = await import(
        '@/services/aiHumanApprovalService'
      );
      const result = approveDraftSuggestionForPurchaseOrder({
        draftSuggestion:       draft,
        approvedByHumanUserId: actorUserId,
        actorType:             'human',
        approvalNote:          note.trim() || undefined,
        requestId:             `req_appr_${Date.now()}`,
        now:                   new Date(),
      });
      onApprove(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="human-approval-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-5">

        {/* Title */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">人工核准：建立 DRAFT 採購單</h2>
          <AISuggestionConfidenceBadge level={draft.confidence.level} />
        </div>

        {/* Draft-only warning — always visible */}
        <div
          data-testid="draft-only-warning"
          className="rounded-md bg-amber-50 border border-amber-200 p-4 space-y-2"
        >
          <p className="text-sm font-semibold text-amber-800">⚠ 重要提醒</p>
          <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
            <li data-testid="warning-draft-only">這只是 DRAFT 草稿，尚未送出採購</li>
            <li data-testid="warning-no-submit">建立後仍需人工送出才會進入 PENDING</li>
            <li data-testid="warning-no-inventory">不會修改任何庫存數量</li>
            <li data-testid="warning-no-receive">不會觸發任何入庫流程</li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            requiresFinalSubmission: true ・ aiCanSubmit: false
          </p>
        </div>

        {/* Summary */}
        <div className="rounded-md bg-gray-50 border border-gray-200 p-4 space-y-2 text-sm">
          <p className="font-medium text-gray-800">{draft.ingredientName ?? draft.ingredientId}</p>
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <span>核准數量</span>
            <span className="font-semibold text-gray-900">
              {kgDisplay} kg ／ {taijinDisplay} 台斤 ／ {draft.finalQtyGrams} g
            </span>
          </div>
        </div>

        {/* Audit chain */}
        <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
          <p className="font-medium text-gray-700 text-sm mb-1">稽核鏈</p>
          <p><span className="font-medium">建議 ID：</span><span className="font-mono">{draft.suggestionId}</span></p>
          <p><span className="font-medium">草稿 ID：</span><span className="font-mono">{draft.draftSuggestionId}</span></p>
          <p><span className="font-medium">快照 ID：</span><span className="font-mono">{draft.sourceSnapshotId}</span></p>
          <p><span className="font-medium">稽核軌跡：</span><span className="font-mono">{draft.auditTrailId}</span></p>
        </div>

        {/* Optional note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            核准備註（選填）
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            data-testid="approval-note"
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="輸入核准說明..."
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        )}

        {/* Actions — NO purchase submit / receive / inventory buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="cancel-approval-btn"
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            取消
          </button>
          {/* Only "建立 DRAFT 採購單" — never "送出採購" / "確認採購" / "入庫" */}
          <button
            type="button"
            onClick={handleApprove}
            data-testid="create-draft-btn"
            disabled={loading}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '處理中…' : '建立 DRAFT 採購單'}
          </button>
        </div>
      </div>
    </div>
  );
}
