/**
 * IngredientSelector — dropdown of active ingredients from the Feature 010
 * ingredient master data (/ingredients/{id}, isActive === true only).
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import type { IngredientMaster } from '@/services/types';
import { listIngredients } from '@/services/ingredientMasterService';

export function IngredientSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (ingredientId: string, ingredient: IngredientMaster | undefined) => void;
}) {
  const [ingredients, setIngredients] = useState<IngredientMaster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listIngredients(db, { includeInactive: false })
      .then(setIngredients)
      .finally(() => setLoading(false));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        onChange(id, ingredients.find((i) => i.id === id));
      }}
      disabled={loading}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{loading ? '載入中…' : '請選擇食材'}</option>
      {ingredients.map((ing) => (
        <option key={ing.id} value={ing.id}>
          {ing.name}
        </option>
      ))}
    </select>
  );
}
