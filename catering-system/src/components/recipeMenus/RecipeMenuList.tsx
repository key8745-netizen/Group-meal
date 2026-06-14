/**
 * RecipeMenuList — table of recipe menus (Feature 012: 菜單引用配方).
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
import type { RecipeMenu } from '@/services/types';

export function RecipeMenuList({
  menus,
  onEdit,
  onToggleActive,
}: {
  menus: RecipeMenu[];
  onEdit: (menu: RecipeMenu) => void;
  onToggleActive: (menu: RecipeMenu) => void;
}) {
  if (menus.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無菜單資料</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名稱</TableHead>
            <TableHead>日期</TableHead>
            <TableHead>餐別</TableHead>
            <TableHead className="text-right">配方數量</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {menus.map((menu) => (
            <TableRow
              key={menu.id}
              className="cursor-pointer"
              onClick={() => onEdit(menu)}
            >
              <TableCell className="font-medium">{menu.name}</TableCell>
              <TableCell>{menu.date}</TableCell>
              <TableCell>{menu.mealType}</TableCell>
              <TableCell className="text-right tabular-nums">
                {menu.menuRecipes?.length ?? 0}
              </TableCell>
              <TableCell>
                <Badge variant={menu.isActive ? 'default' : 'outline'}>
                  {menu.isActive ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(menu);
                  }}
                >
                  {menu.isActive ? '停用' : '啟用'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
