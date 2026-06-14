/**
 * RecipeSelector — dropdown of active recipes from the Feature 011 recipe
 * data (/recipes/{id}, isActive === true only). Read-only.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import type { Recipe } from '@/services/types';
import { listRecipes } from '@/services/recipeService';

export function RecipeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (recipeId: string, recipe: Recipe | undefined) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRecipes(db, { includeInactive: false })
      .then(setRecipes)
      .finally(() => setLoading(false));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        onChange(id, recipes.find((r) => r.id === id));
      }}
      disabled={loading}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{loading ? '載入中…' : '請選擇配方'}</option>
      {recipes.map((recipe) => (
        <option key={recipe.id} value={recipe.id}>
          {recipe.name}
        </option>
      ))}
    </select>
  );
}
