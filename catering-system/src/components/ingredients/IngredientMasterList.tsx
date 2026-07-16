/**
 * IngredientMasterList — table of ingredient master data (Feature 010).
 * Row click opens edit; per-row switch toggles active/inactive.
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
import type { IngredientMaster } from '@/services/types';

/** Feature 060: 目前庫存 / 安全庫存 對照格（低於安全量轉紅）。 */
function StockCell({ currentKg, safetyKg }: { currentKg?: number; safetyKg: number }) {
  const hasSafety = safetyKg > 0;
  const hasStock = typeof currentKg === 'number';
  if (!hasSafety && !hasStock) {
    return <span className="text-muted-foreground">—</span>;
  }
  const below = hasSafety && (currentKg ?? 0) < safetyKg;
  return (
    <span className={`tabular-nums ${below ? 'font-medium text-destructive' : ''}`}>
      {hasStock ? (currentKg as number).toFixed(2) : '—'}
      <span className="text-muted-foreground"> / {hasSafety ? `${safetyKg.toFixed(2)} kg` : '未設'}</span>
    </span>
  );
}

export function IngredientMasterList({
  ingredients,
  stockKgById,
  onEdit,
  onToggleActive,
}: {
  ingredients: IngredientMaster[];
  stockKgById: Map<string, number>;
  onEdit: (ingredient: IngredientMaster) => void;
  onToggleActive: (ingredient: IngredientMaster) => void;
}) {
  if (ingredients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無食材資料</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名稱</TableHead>
            <TableHead>類別</TableHead>
            <TableHead>基本單位</TableHead>
            <TableHead>採購單位</TableHead>
            <TableHead className="text-right">換算係數</TableHead>
            <TableHead className="text-right">預設價格</TableHead>
            <TableHead className="text-right">庫存 / 安全</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ingredients.map((ing) => (
            <TableRow
              key={ing.id}
              className="cursor-pointer"
              onClick={() => onEdit(ing)}
            >
              <TableCell className="font-medium">{ing.name}</TableCell>
              <TableCell>{ing.category}</TableCell>
              <TableCell>{ing.baseUnit}</TableCell>
              <TableCell>{ing.purchaseUnit}</TableCell>
              <TableCell className="text-right tabular-nums">{ing.conversionFactorToBaseUnit}</TableCell>
              <TableCell className="text-right tabular-nums">
                {ing.defaultPrice} / {ing.defaultPriceUnit}
              </TableCell>
              <TableCell className="text-right">
                <StockCell
                  currentKg={stockKgById.get(ing.id)}
                  safetyKg={typeof ing.minStockLevel === 'number' ? ing.minStockLevel : 0}
                />
              </TableCell>
              <TableCell>
                <Badge variant={ing.isActive ? 'default' : 'outline'}>
                  {ing.isActive ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(ing);
                  }}
                >
                  {ing.isActive ? '停用' : '啟用'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
