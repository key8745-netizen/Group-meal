/**
 * MatchItemDetailPanel — Feature 025. Read-only import metadata + staging
 * ProposedRecipeCandidate/RecipeAlias context for a single MenuImportItem,
 * plus the action buttons allowed for its current matchStatus.
 */

import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { MenuImportItem, ProposedRecipeCandidate, Recipe } from '@/services/types';
import { getCandidate } from '@/services/proposedRecipeCandidateService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecipePicker } from './RecipePicker';

interface Props {
  db: Firestore;
  item: MenuImportItem;
  recipes: Recipe[];
  onConfirmMapping: (recipeId: string) => void;
  onRejectMapping: () => void;
  onReopen: () => void;
  busy?: boolean;
}

const STATUS_LABEL: Record<MenuImportItem['matchStatus'], string> = {
  unmatched: '未比對',
  pending_review: '待人工審核',
  mapped: '已對應',
  unresolved: '比對失敗',
  rejected: '已拒絕（終止）',
};

export function MatchItemDetailPanel({ db, item, recipes, onConfirmMapping, onRejectMapping, onReopen, busy }: Props) {
  const [candidate, setCandidate] = useState<ProposedRecipeCandidate | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setCandidate(null);
    if (item.candidateId) {
      getCandidate(db, item.candidateId).then(setCandidate).catch(() => setCandidate(null));
    }
  }, [db, item.candidateId]);

  const isReadOnly = item.matchStatus === 'rejected' || item.matchStatus === 'mapped';

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{item.rawDishName}</p>
          <p className="text-xs text-muted-foreground">{item.date} · {item.mealType}</p>
        </div>
        <Badge variant="outline">{STATUS_LABEL[item.matchStatus]}</Badge>
      </div>

      {item.matchedRecipeId && (
        <p className="text-xs text-muted-foreground">已對應配方 ID：{item.matchedRecipeId}</p>
      )}

      {candidate && (
        <div className="rounded-md bg-muted/30 p-2 text-xs">
          <p className="font-medium">推定配方候選（暫存，僅供參考）</p>
          <p className="text-muted-foreground mt-1">
            {candidate.ingredients.length > 0 ? candidate.ingredients.join('、') : '（無食材清單）'}
          </p>
        </div>
      )}

      {item.matchingError && (
        <p className="text-xs text-red-600">比對錯誤：{item.matchingError}</p>
      )}

      {item.matchStatus === 'rejected' && (
        <p className="text-xs text-muted-foreground">此項目已終止審核，不可再變更。</p>
      )}

      {!isReadOnly && (
        <div className="space-y-2">
          {picking ? (
            <RecipePicker
              recipes={recipes}
              disabled={busy}
              onCancel={() => setPicking(false)}
              onPick={(recipeId) => { setPicking(false); onConfirmMapping(recipeId); }}
            />
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => setPicking(true)}>選擇配方對應</Button>
              {item.matchStatus === 'pending_review' && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRejectMapping}>拒絕</Button>
              )}
              {item.matchStatus === 'unresolved' && (
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onReopen}>重新送審</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
