import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProductionWorkflowPlan } from '@/services/types';

export function ProductionWorkflowList({
  plans,
  onEdit,
  onToggleArchive,
}: {
  plans: ProductionWorkflowPlan[];
  onEdit: (plan: ProductionWorkflowPlan) => void;
  onToggleArchive: (plan: ProductionWorkflowPlan) => void;
}) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無製程規劃資料</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>規劃名稱</TableHead>
            <TableHead>來源備料快照</TableHead>
            <TableHead>服務日期</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead className="text-right">任務數</TableHead>
            <TableHead>更新時間</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => {
            const isArchived = plan.status === 'archived';
            const activeTasks = plan.tasks?.filter((t) => t.taskStatus === 'active').length ?? 0;
            const updatedAt = plan.updatedAt?.toDate?.();
            return (
              <TableRow key={plan.id} className="cursor-pointer" onClick={() => onEdit(plan)}>
                <TableCell className="font-medium">{plan.planName}</TableCell>
                <TableCell>{plan.sourcePrepPlanNameSnapshot}</TableCell>
                <TableCell>{plan.serviceDate || '—'}</TableCell>
                <TableCell>
                  <Badge variant={isArchived ? 'outline' : 'default'}>
                    {isArchived ? '已封存' : '草稿'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{activeTasks}</TableCell>
                <TableCell>{updatedAt ? updatedAt.toLocaleString('zh-TW') : '—'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onToggleArchive(plan); }}
                  >
                    {isArchived ? '取消封存' : '封存'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
