/**
 * PrepPlanList — table of prep plans (Feature 013: 備料規劃引用菜單配方).
 * Row click opens view/edit; per-row button toggles active/inactive.
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
import type { PrepPlan } from '@/services/types';

export function PrepPlanList({
  prepPlans,
  onEdit,
  onToggleActive,
}: {
  prepPlans: PrepPlan[];
  onEdit: (prepPlan: PrepPlan) => void;
  onToggleActive: (prepPlan: PrepPlan) => void;
}) {
  if (prepPlans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無備料規劃資料</p>
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
            <TableHead>來源菜單</TableHead>
            <TableHead className="text-right">食材項目數</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prepPlans.map((plan) => (
            <TableRow
              key={plan.id}
              className="cursor-pointer"
              onClick={() => onEdit(plan)}
            >
              <TableCell className="font-medium">{plan.name}</TableCell>
              <TableCell>{plan.date}</TableCell>
              <TableCell>{plan.sourceRecipeMenuNameSnapshot}</TableCell>
              <TableCell className="text-right tabular-nums">
                {plan.prepItems?.length ?? 0}
              </TableCell>
              <TableCell>
                <Badge variant={plan.isActive ? 'default' : 'outline'}>
                  {plan.isActive ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(plan);
                  }}
                >
                  {plan.isActive ? '停用' : '啟用'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
