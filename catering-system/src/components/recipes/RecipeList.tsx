/**
 * RecipeList — table of recipes (Feature 011: 配方引用食材主檔).
 * Row click opens edit; per-row button toggles active/inactive.
 */

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Recipe } from '@/services/types';

export function RecipeList({
  recipes,
  onEdit,
  onToggleActive,
}: {
  recipes: Recipe[];
  onEdit: (recipe: Recipe) => void;
  onToggleActive: (recipe: Recipe) => void;
}) {
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無配方資料</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名稱</TableHead>
            <TableHead className="text-right">食材數量</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipes.map((recipe) => (
            <TableRow
              key={recipe.id}
              className="cursor-pointer"
              onClick={() => onEdit(recipe)}
            >
              <TableCell className="font-medium">{recipe.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {recipe.recipeIngredients?.length ?? 0}
              </TableCell>
              <TableCell>
                <Badge variant={recipe.isActive ? 'default' : 'outline'}>
                  {recipe.isActive ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(recipe);
                  }}
                >
                  {recipe.isActive ? '停用' : '啟用'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
