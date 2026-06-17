import { useState } from 'react';
import type { MenuImportBatch, MenuImportItem } from '@/services/types';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface Props {
  batch: MenuImportBatch;
  items: MenuImportItem[];
  onUpdateItem: (itemId: string, patch: { normalizedDishName?: string; reviewStatus?: MenuImportItem['reviewStatus'] }) => void;
  onStartReview: () => void;
  onFinalize: () => void;
  onArchive: () => void;
}

export function MenuImportItemReviewTable({ batch, items, onUpdateItem, onStartReview, onFinalize, onArchive }: Props) {
  const [editing, setEditing] = useState<Record<string, string>>({});

  const editable = batch.importStatus === 'parsed' || batch.importStatus === 'reviewing';

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>餐別</TableHead>
            <TableHead>欄位</TableHead>
            <TableHead>原始菜名</TableHead>
            <TableHead>正規化菜名</TableHead>
            <TableHead>審核狀態</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.date}</TableCell>
              <TableCell>{item.mealType}</TableCell>
              <TableCell>{item.columnKey}</TableCell>
              <TableCell>{item.rawDishName}</TableCell>
              <TableCell>
                {editable ? (
                  <input
                    className="rounded-md border px-2 py-1 text-sm w-full"
                    value={editing[item.id] ?? item.normalizedDishName}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    onBlur={(e) => onUpdateItem(item.id, { normalizedDishName: e.target.value })}
                  />
                ) : (
                  item.normalizedDishName
                )}
              </TableCell>
              <TableCell>
                {editable ? (
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={item.reviewStatus}
                    onChange={(e) => onUpdateItem(item.id, { reviewStatus: e.target.value as MenuImportItem['reviewStatus'] })}
                  >
                    <option value="pending">待審</option>
                    <option value="confirmed">已確認</option>
                    <option value="rejected">已拒絕</option>
                  </select>
                ) : (
                  item.reviewStatus
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-end gap-2">
        {batch.importStatus === 'parsed' && (
          <Button type="button" size="sm" variant="outline" onClick={onStartReview}>進入審核</Button>
        )}
        {batch.importStatus === 'reviewing' && (
          <Button type="button" size="sm" onClick={onFinalize}>定案（不可撤銷）</Button>
        )}
        {batch.importStatus === 'finalized' && (
          <Button type="button" size="sm" variant="outline" onClick={onArchive}>封存</Button>
        )}
      </div>
    </div>
  );
}
