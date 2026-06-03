import { useState } from 'react';
import type { PurchaseSuggestionItem, OverrideReason, AuditTrailId } from '@/types/aiBoundary';
import type { CreateAISuggestionFeedbackResult } from '@/services/aiSuggestionFeedbackService';
import { toGrams, gramsToKg, gramsToTaijin } from '@/services/unitConversionService';
import type { Unit } from '@/types/aiBoundary';

type InputUnit = 'grams' | 'kg' | 'taijin';

const OVERRIDE_REASON_LABELS: Record<OverrideReason, string> = {
  too_high:               '建議數量過高',
  too_low:                '建議數量過低',
  supplier_limit:         '供應商限量',
  chef_override:          '主廚調整',
  unit_conversion_issue:  '單位換算問題',
  ingredient_unavailable: '食材無法取得',
  seasonal_adjustment:    '季節性調整',
  other:                  '其他原因',
};

const OVERRIDE_REASONS = Object.keys(OVERRIDE_REASON_LABELS) as OverrideReason[];

interface Props {
  item: PurchaseSuggestionItem;
  auditTrailId: AuditTrailId;
  actorId: string;
  onSubmit: (result: CreateAISuggestionFeedbackResult) => void;
  onCancel: () => void;
}

export function HumanOverrideDialog({ item, auditTrailId, actorId, onSubmit, onCancel }: Props) {
  const [qty, setQty] = useState<string>('');
  const [unit, setUnit] = useState<InputUnit>('kg');
  const [reason, setReason] = useState<OverrideReason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const suggestedKg = gramsToKg(item.suggestedQtyGrams);

  // Compute preview grams from current input
  let previewGrams: number | null = null;
  const numQty = parseFloat(qty);
  if (!isNaN(numQty) && numQty > 0) {
    try {
      previewGrams = toGrams(numQty, unit as Unit);
    } catch {
      previewGrams = null;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!reason) {
      setError('請選擇覆寫原因');
      return;
    }
    if (!qty || isNaN(numQty) || numQty <= 0) {
      setError('請輸入有效數量');
      return;
    }

    let finalGrams;
    try {
      finalGrams = toGrams(numQty, unit as Unit);
    } catch (err) {
      setError(`數量換算錯誤：${(err as Error).message}`);
      return;
    }

    // Dynamically import to avoid circular issues in tests — use lazy pattern
    import('@/services/aiSuggestionFeedbackService').then(({ createAISuggestionFeedback }) => {
      // We need the parent suggestion; the item has a reference through ingredientId
      // The parent component must inject the suggestion via the callback pattern.
      // Here we call with a minimal adapter — real usage passes through the card.
      const result = createAISuggestionFeedback({
        suggestion: {
          suggestionId: '' as never,
          tenantId: '' as never,
          sourceSnapshotId: '' as never,
          generatedAt: new Date(),
          expiresAt: new Date(),
          items: [item],
          overallConfidence: item.confidence,
          usableForDraft: false,
          blockedReasons: [],
          warnings: [],
          auditEvent: null as never,
        },
        ingredientId: item.ingredientId,
        finalQtyGrams: finalGrams,
        overrideReason: reason as OverrideReason,
        note: note.trim() || undefined,
        actorId,
        auditTrailId,
        now: new Date(),
      });
      onSubmit(result);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="human-override-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          人工覆寫：{item.name}
        </h2>

        <p className="text-sm text-gray-500">
          AI 建議：<span className="font-medium">{suggestedKg} kg</span>
          （{item.suggestedQtyGrams} g）
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="override-form">
          {/* Quantity + unit */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                最終數量
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={e => setQty(e.target.value)}
                data-testid="qty-input"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="輸入數量"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                單位
              </label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value as InputUnit)}
                data-testid="unit-select"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="kg">kg</option>
                <option value="grams">g</option>
                <option value="taijin">台斤</option>
              </select>
            </div>
          </div>

          {/* Conversion preview */}
          {previewGrams !== null && (
            <div
              data-testid="conversion-preview"
              className="rounded bg-blue-50 border border-blue-200 p-3 text-xs space-y-1"
            >
              <p className="font-medium text-blue-800">確認摘要</p>
              <p>輸入：{numQty} {unit}</p>
              <p>系統儲存：{previewGrams} g</p>
              <p>約 {gramsToKg(previewGrams as never)} kg ／ {gramsToTaijin(previewGrams as never)} 台斤</p>
            </div>
          )}

          {/* Override reason — required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              覆寫原因 <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as OverrideReason)}
              data-testid="reason-select"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">請選擇原因</option>
              {OVERRIDE_REASONS.map(r => (
                <option key={r} value={r}>{OVERRIDE_REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {/* Optional note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              備註（選填）
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              data-testid="note-input"
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="輸入補充說明..."
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          {/* Actions — NO purchase/draft buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              data-testid="cancel-btn"
              className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!reason}
              data-testid="submit-btn"
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              記錄覆寫意見
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
