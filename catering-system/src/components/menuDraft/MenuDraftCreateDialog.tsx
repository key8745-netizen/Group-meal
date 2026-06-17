import { useState, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import type { MenuMixRecommendation, MenuDraft } from '@/services/types';
import { createMenuDraftFromRecommendation } from '@/services/menuDraftService';
import { Button } from '@/components/ui/button';

interface Props {
  recommendation: MenuMixRecommendation;
  onCreated: (draft: MenuDraft) => void;
  onCancel: () => void;
}

/**
 * recommendation is preview-only — used only to render the table/status here.
 * The actual write goes through createMenuDraftFromRecommendation(db, recommendation.id, ...),
 * which re-reads the source document from Firestore by ID. The full object is
 * NEVER passed as the write source.
 */
export function MenuDraftCreateDialog({ recommendation, onCreated, onCancel }: Props) {
  const [menuName, setMenuName] = useState('');
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isNotRecommended = recommendation.recommendationStatus === 'notRecommended';
  const canSubmit =
    !loading && menuName.trim().length > 0 && (!isNotRecommended || acknowledged);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('請先登入');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const draft = await createMenuDraftFromRecommendation(
        db,
        recommendation.id,
        { menuName: menuName.trim(), notes: notes.trim() || undefined },
        uid,
      );
      onCreated(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立草稿菜單失敗');
    } finally {
      setLoading(false);
    }
  }, [canSubmit, recommendation.id, menuName, notes, onCreated]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">建立草稿菜單</h2>

        <p className="text-xs text-muted-foreground border-b pb-3">
          此操作僅建立人工參考用草稿菜單，非正式菜單，不會觸發任何下游自動化流程。
        </p>

        {isNotRecommended && (
          <div className="rounded-md bg-red-50 border border-red-300 p-3 space-y-2">
            <p className="text-sm font-bold text-red-800">⚠ 此建議狀態為「不建議」</p>
            <p className="text-xs text-red-700">
              此菜單組合建議被系統評估為不建議採用，建立草稿前請確認已人工審查風險。
            </p>
            <label className="flex items-center gap-2 text-sm text-red-800">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={loading}
              />
              我已了解風險並確認要建立此草稿菜單
            </label>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">草稿菜單名稱</label>
          <input
            type="text"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            disabled={loading}
            placeholder="輸入草稿菜單名稱"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">備註（選填）</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="輸入備註…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {loading ? '建立中…' : '建立草稿菜單'}
          </Button>
        </div>
      </div>
    </div>
  );
}
