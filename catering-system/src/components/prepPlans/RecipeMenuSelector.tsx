/**
 * RecipeMenuSelector — dropdown of active recipe menus from the Feature 012
 * recipe menu data (/recipeMenus/{id}, isActive === true only). Read-only.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import type { RecipeMenu } from '@/services/types';
import { listMenus } from '@/services/recipeMenuService';

export function RecipeMenuSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (recipeMenuId: string, recipeMenu: RecipeMenu | undefined) => void;
}) {
  const [menus, setMenus] = useState<RecipeMenu[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMenus(db, { includeInactive: false })
      .then(setMenus)
      .finally(() => setLoading(false));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        onChange(id, menus.find((m) => m.id === id));
      }}
      disabled={loading}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{loading ? '載入中…' : '請選擇菜單'}</option>
      {menus.map((menu) => (
        <option key={menu.id} value={menu.id}>
          {menu.name}（{menu.date}）
        </option>
      ))}
    </select>
  );
}
