import { useState, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import type { MenuDraft, RecipeMenu } from '@/services/types';
import { createMenuFromApprovedDraft } from '@/services/recipeMenuService';
import { Button } from '@/components/ui/button';

interface Props {
  draft: MenuDraft;
  onCreated: (menu: RecipeMenu) => void;
  onCancel: () => void;
}

/**
 * draft is preview-only — the actual write goes through
 * createMenuFromApprovedDraft(db, draft.id, ...), which re-reads the source
 * menuDraft document from Firestore. The full object is never passed as the
 * write source.
 */
export function MenuDraftApprovalDialog({ draft, onCreated, onCancel }: Props) {
  const [date, setDate] = useState('');
  const [mealType, setMealType] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = !loading && date.trim().length > 0 && mealType.trim().length > 0 && acknowledged;

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
      const menu = await createMenuFromApprovedDraft(
        db,
        draft.id,
        { date: date.trim(), mealType: mealType.trim() },
        uid,
      );
      onCreated(menu);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立正式菜單失敗');
    } finally {
      setLoading(false);
    }
  }, [canSubmit, draft.id, date, mealType, onCreated]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">核准並建立正式菜單</h2>

        <div className="rounded-md bg-yellow-50 border border-yellow-300 p-3 space-y-2">
          <p className="text-sm font-bold text-yellow-800">⚠ 此動作不可撤銷</p>
          <p className="text-xs text-yellow-700">
            確認後將以草稿菜單「{draft.menuName}」建立一筆正式菜單記錄，此記錄建立後不可再編輯。
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loading}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">餐別</label>
          <input
            type="text"
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            disabled={loading}
            placeholder="例如：午餐"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={loading}
          />
          我已人工審查此草稿菜單並確認要建立正式菜單
        </label>

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
            {loading ? '建立中…' : '核准並建立正式菜單'}
          </Button>
        </div>
      </div>
    </div>
  );
}
