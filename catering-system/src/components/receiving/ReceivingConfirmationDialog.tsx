/**
 * ReceivingConfirmationDialog.tsx
 *
 * UI for human confirmation of PENDING → RECEIVED purchase order transition.
 *
 * SAFETY INVARIANTS (Phase 3):
 *  - This component NEVER writes Firestore directly.
 *  - It calls ONLY purchaseOrderService.receiveAISourcedPurchaseOrder(),
 *    which in turn executes receivingTransactionService — one runTransaction.
 *  - The "確認收貨並更新庫存" button is disabled during submission (duplicate guard).
 *  - Delta > 15% shows a prominent warning and requires a receivingNote.
 *  - An irreversible-action warning is always visible.
 *  - Quantity input supports grams / kg / 台斤, converted via toGrams() only.
 *  - "taijin * 0.6" is NEVER used — conversion goes through GRAMS_PER_TAIJIN = 600.
 */

import { useState, useCallback } from 'react';
import type { Grams, TenantId, AuditTrailId } from '@/types/aiBoundary';
import type { ReceivingTransactionResult } from '@/services/receivingTransactionService';
import {
  toGrams,
  GRAMS_PER_KG,
  GRAMS_PER_TAIJIN,
  gramsToKg,
  gramsToTaijin,
  UnitConversionError,
} from '@/services/unitConversionService';
import { RECEIVING_DELTA_NOTE_THRESHOLD } from '@/types/receivingBoundary';
import {
  generateReceivingToken,
  generateReceivingRequestId,
} from '@/services/receivingIdempotencyService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReceivingUnit = 'grams' | 'kg' | 'taijin';

export interface ReceivingDeltaInfo {
  deltaGrams: Grams;
  deltaPercent: number;
  requiresNote: boolean;
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/**
 * Computes delta between ordered and received quantity.
 * Pure function — no Firestore, no React.
 */
export function computeReceivingDelta(
  orderedGrams: Grams,
  receivedGrams: Grams,
): ReceivingDeltaInfo {
  const deltaGrams = (receivedGrams - orderedGrams) as Grams;
  const deltaPercent =
    orderedGrams > 0
      ? Math.round((Math.abs(deltaGrams) / orderedGrams) * 10000) / 100
      : 0;
  return {
    deltaGrams,
    deltaPercent,
    requiresNote: deltaPercent > RECEIVING_DELTA_NOTE_THRESHOLD * 100,
  };
}

/**
 * Parses a human-entered quantity string to Grams using safe unit conversion.
 * Returns null if the input is invalid or non-positive.
 *
 * Uses toGrams() from unitConversionService — never taijin * 0.6.
 */
export function parseReceivingQtyToGrams(
  rawValue: string,
  unit: ReceivingUnit,
): Grams | null {
  const n = parseFloat(rawValue);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    // Round to nearest gram before calling asGrams()
    const rounded = Math.round(unit === 'grams' ? n : unit === 'kg' ? n * GRAMS_PER_KG : n * GRAMS_PER_TAIJIN);
    return toGrams(rounded, 'grams');
  } catch (e) {
    if (e instanceof UnitConversionError) return null;
    throw e;
  }
}

/**
 * Formats a Grams value for display (both kg and 台斤 shown).
 */
export function formatGramsDisplay(grams: Grams): string {
  return `${grams} g（${gramsToKg(grams)} kg ／ ${gramsToTaijin(grams)} 台斤）`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ReceivingConfirmationDialogProps {
  purchaseOrderId: string;
  ingredientId: string;
  ingredientName: string;
  /** Quantity on the original purchase order (in Grams) */
  orderedQtyGrams: Grams;
  /** Human user ID of the person confirming receipt */
  actorUserId: string;
  tenantId: TenantId;
  auditTrailId: AuditTrailId;
  onReceived: (result: ReceivingTransactionResult) => void;
  onCancel: () => void;
}

// ─── ReceivingConfirmationDialog ──────────────────────────────────────────────

/**
 * HARD RULES (must not be removed):
 *  1. No direct Firestore writes in this component.
 *  2. Service is called via dynamic import to avoid circular deps.
 *  3. Submit button is disabled while submission is in progress.
 *  4. The irreversible warning block is always rendered (data-testid="irreversible-warning").
 *  5. Delta warning is shown when deltaPercent > 15%.
 *  6. Receiving note is required when delta > 15%.
 */
export function ReceivingConfirmationDialog({
  purchaseOrderId,
  ingredientId,
  ingredientName,
  orderedQtyGrams,
  actorUserId,
  tenantId,
  auditTrailId,
  onReceived,
  onCancel,
}: ReceivingConfirmationDialogProps) {
  const [receivingUnit, setReceivingUnit] = useState<ReceivingUnit>('kg');
  const [qtyInput, setQtyInput]           = useState('');
  const [receivingNote, setReceivingNote] = useState('');
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [submitted, setSubmitted]         = useState(false);

  // Derived: parse entered quantity to Grams
  const receivedQtyGrams = parseReceivingQtyToGrams(qtyInput, receivingUnit);
  const deltaInfo = receivedQtyGrams !== null
    ? computeReceivingDelta(orderedQtyGrams, receivedQtyGrams)
    : null;

  const canSubmit =
    !loading &&
    !submitted &&
    receivedQtyGrams !== null &&
    receivedQtyGrams > 0 &&
    (deltaInfo === null || !deltaInfo.requiresNote || receivingNote.trim().length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || receivedQtyGrams === null) return;
    if (!actorUserId) {
      setError('無法識別操作人員，請重新登入');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { purchaseOrderService } = await import('@/services/purchaseOrderService');

      const request = {
        requestId:        generateReceivingRequestId(),
        receivingToken:   generateReceivingToken(),
        tenantId,
        purchaseOrderId,
        auditTrailId,
        humanReceiverId:  actorUserId,
        callerType:       'human' as const,
        orderedQtyGrams,
        receivedQtyGrams,
        receivingNote:    receivingNote.trim() || undefined,
        receivedAt:       new Date(),
      };

      const result = await purchaseOrderService.receiveAISourcedPurchaseOrder(
        purchaseOrderId,
        ingredientId,
        request,
      );

      // Prevent any further submission attempts (idempotency: same token used once)
      setSubmitted(true);
      onReceived(result);
    } catch (err) {
      setError((err as Error).message ?? '收貨失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [
    canSubmit, receivedQtyGrams, actorUserId, tenantId, purchaseOrderId,
    auditTrailId, orderedQtyGrams, receivingNote, ingredientId, onReceived,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="receiving-confirmation-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-5">

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900">
          確認收貨：PENDING → RECEIVED
        </h2>

        {/* ── IRREVERSIBLE WARNING — always visible (data-testid required) ── */}
        <div
          data-testid="irreversible-warning"
          className="rounded-md bg-red-50 border border-red-300 p-4 space-y-2"
        >
          <p className="text-sm font-bold text-red-800">⚠ 此動作不可撤銷</p>
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            <li data-testid="warning-irreversible">此動作不可撤銷。</li>
            <li data-testid="warning-status-change">確認後採購單會變成 RECEIVED。</li>
            <li data-testid="warning-inventory-update">確認後會更新庫存。</li>
            <li data-testid="warning-human-confirm">請確認實際已收到貨品後再執行。</li>
          </ul>
        </div>

        {/* Order summary */}
        <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-sm space-y-2">
          <div className="grid grid-cols-2 gap-1 text-gray-600">
            <span>採購單 ID</span>
            <span className="font-mono text-xs text-gray-800 break-all">{purchaseOrderId}</span>
            <span>食材</span>
            <span className="font-semibold text-gray-900">{ingredientName}</span>
            <span>訂購數量</span>
            <span className="font-semibold text-gray-900">{formatGramsDisplay(orderedQtyGrams)}</span>
          </div>
        </div>

        {/* ── Received quantity input ── */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            實際收到數量
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.001"
              step="any"
              value={qtyInput}
              onChange={e => { setQtyInput(e.target.value); setError(''); }}
              data-testid="received-qty-input"
              placeholder="輸入數量"
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || submitted}
            />
            <select
              value={receivingUnit}
              onChange={e => { setReceivingUnit(e.target.value as ReceivingUnit); setError(''); }}
              data-testid="unit-selector"
              className="border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || submitted}
            >
              <option value="kg">kg</option>
              <option value="taijin">台斤</option>
              <option value="grams">g</option>
            </select>
          </div>

          {/* Parsed grams preview */}
          {receivedQtyGrams !== null && (
            <p
              data-testid="parsed-grams-preview"
              className="text-xs text-gray-500"
            >
              = {formatGramsDisplay(receivedQtyGrams)}
            </p>
          )}
        </div>

        {/* ── Delta warning — shown when >15% ── */}
        {deltaInfo !== null && deltaInfo.requiresNote && (
          <div
            data-testid="delta-warning"
            className="rounded-md bg-yellow-50 border border-yellow-300 p-3"
          >
            <p className="text-sm font-semibold text-yellow-800">
              ⚠ 收貨數量偏差 {deltaInfo.deltaPercent.toFixed(1)}%（超過 15%）
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              差異：{deltaInfo.deltaGrams > 0 ? '+' : ''}{deltaInfo.deltaGrams} g
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              偏差超過 15% 須填寫備註說明原因。
            </p>
          </div>
        )}

        {/* Receiving note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            收貨備註
            {deltaInfo?.requiresNote && (
              <span className="text-red-600 ml-1">（偏差 &gt;15%，必填）</span>
            )}
          </label>
          <textarea
            value={receivingNote}
            onChange={e => setReceivingNote(e.target.value)}
            data-testid="receiving-note"
            rows={2}
            disabled={loading || submitted}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder={deltaInfo?.requiresNote ? '必填：說明偏差原因…' : '輸入備註（選填）…'}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert" data-testid="error-message">
            {error}
          </p>
        )}

        {/* ── Actions — only "確認收貨並更新庫存" and "取消" ── */}
        {/* Forbidden labels: "完成", "確認", "OK", "入庫", "送出", "自動" */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="cancel-receiving-btn"
            disabled={loading}
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            data-testid="confirm-receiving-btn"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '處理中…' : submitted ? '已送出' : '確認收貨並更新庫存'}
          </button>
        </div>

      </div>
    </div>
  );
}
