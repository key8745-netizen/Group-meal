import { useState } from 'react';
import type { SubmitDraftToPendingResult } from '@/services/aiHumanSubmitService';
import type { PurchaseOrderDraftRecord } from '@/services/aiHumanSubmitService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  purchaseOrderDraft: PurchaseOrderDraftRecord;
  actorUserId: string;
  onSubmit: (result: SubmitDraftToPendingResult) => void;
  onCancel: () => void;
}

// ─── AIHumanSubmitDialog ──────────────────────────────────────────────────────

/**
 * Asks a human to confirm transitioning an AI-sourced DRAFT purchase order to PENDING.
 *
 * SAFETY INVARIANTS:
 *  - No "入庫" / "確認收貨" / "完成採購" / "自動採購" / "立即入庫" buttons
 *  - Allowed action: "送出為 PENDING" only
 *  - UI prominently warns: submitted but not received, no inventory change
 *  - AI cannot invoke this dialog — actorUserId must be a logged-in human
 */
export function AIHumanSubmitDialog({ purchaseOrderDraft, actorUserId, onSubmit, onCancel }: Props) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const meta = purchaseOrderDraft.aiMetadata;
  const purchaseOrderId = purchaseOrderDraft.id ?? purchaseOrderDraft.purchaseOrderId ?? '(未知)';

  async function handleSubmit() {
    setError('');
    if (!actorUserId) {
      setError('無法識別操作人員，請重新登入');
      return;
    }
    setLoading(true);
    try {
      const { submitApprovedDraftPurchaseOrderToPending } = await import(
        '@/services/aiHumanSubmitService'
      );
      const result = submitApprovedDraftPurchaseOrderToPending({
        purchaseOrderDraft,
        submittedByHumanUserId: actorUserId,
        actorType:              'human',
        submitNote:             note.trim() || undefined,
        requestId:              `req_sub_${Date.now()}`,
        now:                    new Date(),
      });
      onSubmit(result);
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
      data-testid="human-submit-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-5">

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900">
          人工送出：DRAFT → PENDING 採購單
        </h2>

        {/* Pending-only warning — always visible */}
        <div
          data-testid="pending-only-warning"
          className="rounded-md bg-orange-50 border border-orange-200 p-4 space-y-2"
        >
          <p className="text-sm font-semibold text-orange-800">⚠ 重要提醒</p>
          <ul className="text-sm text-orange-700 list-disc list-inside space-y-1">
            <li data-testid="warning-submit-only">這會送出採購單，狀態將從 DRAFT 變為 PENDING</li>
            <li data-testid="warning-no-inventory">不會修改任何庫存數量</li>
            <li data-testid="warning-no-receive">不會觸發任何入庫流程</li>
            <li data-testid="warning-confirm-required">收貨入庫需要下一階段人工確認</li>
          </ul>
          <p className="text-xs text-orange-600 mt-1">
            requiresReceivingConfirmation: true ・ aiCanReceive: false
          </p>
        </div>

        {/* Summary */}
        <div className="rounded-md bg-gray-50 border border-gray-200 p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <span>採購單 ID</span>
            <span className="font-mono text-xs text-gray-800 break-all">{purchaseOrderId}</span>
            <span>狀態變更</span>
            <span className="font-semibold text-gray-900">DRAFT → PENDING</span>
          </div>
          {purchaseOrderDraft.items && purchaseOrderDraft.items.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <p className="font-medium text-gray-700 mb-1">採購項目</p>
              {purchaseOrderDraft.items.map(i => (
                <p key={i.ingredientId} className="text-xs text-gray-600">
                  {i.name} — {i.purchaseQtyKg} kg
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Audit chain */}
        <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-3">
          <p className="font-medium text-gray-700 text-sm mb-1">稽核鏈</p>
          {meta?.suggestionId && (
            <p><span className="font-medium">建議 ID：</span><span className="font-mono">{meta.suggestionId}</span></p>
          )}
          {meta?.draftSuggestionId && (
            <p><span className="font-medium">草稿 ID：</span><span className="font-mono">{meta.draftSuggestionId}</span></p>
          )}
          {meta?.sourceSnapshotId && (
            <p><span className="font-medium">快照 ID：</span><span className="font-mono">{meta.sourceSnapshotId}</span></p>
          )}
          {meta?.auditTrailId && (
            <p><span className="font-medium">稽核軌跡：</span><span className="font-mono">{meta.auditTrailId}</span></p>
          )}
          {meta?.approvalId && (
            <p><span className="font-medium">核准 ID：</span><span className="font-mono">{meta.approvalId}</span></p>
          )}
        </div>

        {/* Optional note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            送出備註（選填）
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            data-testid="submit-note"
            rows={2}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="輸入送出說明..."
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        )}

        {/* Actions — NO receive / inventory / complete buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="cancel-submit-btn"
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            取消
          </button>
          {/* Only "送出為 PENDING" — never "入庫" / "確認收貨" / "完成採購" */}
          <button
            type="button"
            onClick={handleSubmit}
            data-testid="submit-pending-btn"
            disabled={loading}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '處理中…' : '送出為 PENDING'}
          </button>
        </div>
      </div>
    </div>
  );
}
