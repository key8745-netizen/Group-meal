/**
 * RecipePicker — Feature 025. Search/select an existing /recipes/{id} to
 * confirm a MenuImportItem mapping. Reference-only; never creates a recipe.
 */

import { useMemo, useState } from 'react';
import type { Recipe } from '@/services/types';
import { Button } from '@/components/ui/button';

interface Props {
  recipes: Recipe[];
  onPick: (recipeId: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function RecipePicker({ recipes, onPick, onCancel, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <input
        className="w-full rounded-md border px-2 py-1 text-sm"
        placeholder="搜尋配方名稱…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />
      <select
        className="w-full rounded-md border px-2 py-1 text-sm"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={disabled}
        size={6}
      >
        {filtered.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>取消</Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !selected}
          onClick={() => selected && onPick(selected)}
        >
          確認對應
        </Button>
      </div>
    </div>
  );
}
