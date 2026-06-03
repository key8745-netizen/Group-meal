import { useState } from 'react';
import type {
  AIPurchaseSuggestion, PurchaseSuggestionItem, AuditTrailId, AIContextSnapshot,
} from '@/types/aiBoundary';
import type { CreateAISuggestionFeedbackResult } from '@/services/aiSuggestionFeedbackService';
import { gramsToKg, gramsToTaijin } from '@/services/unitConversionService';
import { AISuggestionConfidenceBadge } from './AISuggestionConfidenceBadge';
import { AISuggestionReasonList } from './AISuggestionReasonList';
import { AISuggestionDataLineage } from './AISuggestionDataLineage';
import { HumanOverrideDialog } from './HumanOverrideDialog';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  suggestion: AIPurchaseSuggestion;
  /** Snapshot used to build the suggestion — for data lineage display only */
  snapshot: Pick<AIContextSnapshot, 'snapshotId' | 'generatedAt' | 'sourceCollections'>;
  auditTrailId: AuditTrailId;
  actorId: string;
  /** Called after a human override is recorded — for parent state updates */
  onOverride?: (result: CreateAISuggestionFeedbackResult) => void;
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: PurchaseSuggestionItem;
  auditTrailId: AuditTrailId;
  actorId: string;
  onOverride?: (result: CreateAISuggestionFeedbackResult) => void;
}

function SuggestionItemRow({ item, auditTrailId, actorId, onOverride }: ItemRowProps) {
  const [showDialog, setShowDialog] = useState(false);
  const { confidence } = item;
  const isBlocked = confidence.level === 'BLOCKED';

  return (
    <div
      data-testid={`suggestion-item-${item.ingredientId}`}
      className="border border-gray-200 rounded-md p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{item.name}</span>
          <AISuggestionConfidenceBadge level={confidence.level} />
        </div>

        {/* Override button — only when not BLOCKED and usableForDraft is always false */}
        {!isBlocked && (
          <button
            type="button"
            data-testid="override-btn"
            onClick={() => setShowDialog(true)}
            className="text-sm px-3 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            人工覆寫
          </button>
        )}
      </div>

      {/* Quantities */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-gray-50 rounded p-2 text-center">
          <p className="text-gray-500 text-xs mb-0.5">建議採購</p>
          <p className="font-semibold text-gray-900">{gramsToKg(item.suggestedQtyGrams)} kg</p>
          <p className="text-gray-400 text-xs">{gramsToTaijin(item.suggestedQtyGrams)} 台斤</p>
        </div>
        <div className="bg-gray-50 rounded p-2 text-center">
          <p className="text-gray-500 text-xs mb-0.5">目前庫存</p>
          <p className="font-semibold text-gray-900">{gramsToKg(item.currentStockGrams)} kg</p>
        </div>
        <div className="bg-gray-50 rounded p-2 text-center">
          <p className="text-gray-500 text-xs mb-0.5">缺口</p>
          <p className="font-semibold text-red-600">{gramsToKg(item.shortageGrams)} kg</p>
        </div>
      </div>

      {/* Blocked notice */}
      {isBlocked && (
        <div
          data-testid="blocked-notice"
          className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 font-medium"
        >
          此建議不可使用（已阻擋）
        </div>
      )}

      {/* Reasons / warnings */}
      <AISuggestionReasonList
        blockedReasons={confidence.blockedReasons}
        warnings={confidence.warnings}
      />

      {/* Override dialog — no purchase/draft actions inside */}
      {showDialog && (
        <HumanOverrideDialog
          item={item}
          auditTrailId={auditTrailId}
          actorId={actorId}
          onSubmit={result => {
            setShowDialog(false);
            onOverride?.(result);
          }}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}

// ─── AISuggestionCard ─────────────────────────────────────────────────────────

/**
 * Renders one AI purchase suggestion (all items) with:
 *  - Overall confidence badge
 *  - Per-item rows with override buttons
 *  - Data lineage summary
 *
 * SAFETY INVARIANTS:
 *  - usableForDraft is always false → no Draft button rendered anywhere
 *  - BLOCKED items show a notice and NO override/action button
 *  - No purchase order / inventory buttons exist in this component tree
 *  - No raw logs, OCR text, PII, or sensitive supplier data is displayed
 */
export function AISuggestionCard({
  suggestion, snapshot, auditTrailId, actorId, onOverride,
}: Props) {
  const { overallConfidence, items, blockedReasons, warnings } = suggestion;
  const isOverallBlocked = overallConfidence.level === 'BLOCKED';

  return (
    <div
      data-testid="ai-suggestion-card"
      className="rounded-lg border border-gray-200 shadow-sm bg-white overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">AI 採購建議</h3>
          <AISuggestionConfidenceBadge level={overallConfidence.level} />
        </div>
        <span className="text-xs text-gray-400">
          {suggestion.generatedAt.toLocaleString('zh-TW')}
        </span>
      </div>

      {/* Overall blocked banner */}
      {isOverallBlocked && (
        <div
          data-testid="overall-blocked-banner"
          className="bg-red-50 border-b border-red-200 px-5 py-3"
        >
          <p className="text-sm font-medium text-red-700">此建議整體已被阻擋，無法使用</p>
          <AISuggestionReasonList
            blockedReasons={blockedReasons}
            warnings={warnings}
          />
        </div>
      )}

      {/* Phase 3 / 4 notice — usableForDraft is always false, no draft/purchase button */}
      <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
        <p className="text-xs text-amber-700">
          本建議僅供參考，目前不開放建立採購草稿（Phase 5 開放）
        </p>
      </div>

      {/* Items */}
      <div className="px-5 py-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">目前無缺料項目</p>
        ) : (
          items.map(item => (
            <SuggestionItemRow
              key={item.ingredientId}
              item={item}
              auditTrailId={auditTrailId}
              actorId={actorId}
              onOverride={onOverride}
            />
          ))
        )}
      </div>

      {/* Data lineage — safe metadata only */}
      <div className="px-5 py-4 border-t border-gray-100">
        <AISuggestionDataLineage snapshot={snapshot} />
      </div>
    </div>
  );
}
