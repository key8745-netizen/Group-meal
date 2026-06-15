/**
 * PurchaseDemandDraftList — table of purchase demand drafts (Feature 014:
 * 採購需求草稿). Row click opens view/edit; per-row button toggles
 * archive/unarchive.
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
import type { PurchaseDemandDraft, PurchaseDemandDraftWorkflowStatus } from '@/services/types';

const WORKFLOW_STATUS_LABELS: Record<PurchaseDemandDraftWorkflowStatus, string> = {
  draft: '草稿',
  exported: '已匯出',
  sent: '已送採購',
  completed: '已完成',
  cancelled: '已取消',
};

const WORKFLOW_STATUS_OPTIONS = Object.keys(WORKFLOW_STATUS_LABELS) as PurchaseDemandDraftWorkflowStatus[];

export function PurchaseDemandDraftList({
  drafts,
  onEdit,
  onToggleArchived,
  onExportCsv,
  onPrint,
  onWorkflowStatusChange,
}: {
  drafts: PurchaseDemandDraft[];
  onEdit: (draft: PurchaseDemandDraft) => void;
  onToggleArchived: (draft: PurchaseDemandDraft) => void;
  onExportCsv?: (draft: PurchaseDemandDraft) => void;
  onPrint?: (draft: PurchaseDemandDraft) => void;
  onWorkflowStatusChange?: (draft: PurchaseDemandDraft, workflowStatus: PurchaseDemandDraftWorkflowStatus) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-muted-foreground">
        <p className="text-sm">尚無採購需求草稿資料</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>草稿名稱</TableHead>
            <TableHead>來源備料規劃</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>採購流程狀態</TableHead>
            <TableHead className="text-right">項目數</TableHead>
            <TableHead>更新時間</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((draft) => {
            const isArchived = draft.status === 'archived';
            const updatedAt = draft.updatedAt?.toDate?.();
            return (
              <TableRow
                key={draft.id}
                className="cursor-pointer"
                onClick={() => onEdit(draft)}
              >
                <TableCell className="font-medium">{draft.draftName}</TableCell>
                <TableCell>{draft.sourcePrepPlanNameSnapshot}</TableCell>
                <TableCell>
                  <Badge variant={isArchived ? 'outline' : 'default'}>
                    {isArchived ? '已封存' : '草稿'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {onWorkflowStatusChange ? (
                    <select
                      className="rounded-md border bg-background px-2 py-1 text-xs"
                      value={draft.workflowStatus ?? 'draft'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        onWorkflowStatusChange(draft, e.target.value as PurchaseDemandDraftWorkflowStatus);
                      }}
                    >
                      {WORKFLOW_STATUS_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {WORKFLOW_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    WORKFLOW_STATUS_LABELS[draft.workflowStatus ?? 'draft']
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {draft.items?.length ?? 0}
                </TableCell>
                <TableCell>{updatedAt ? updatedAt.toLocaleString('zh-TW') : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {onExportCsv && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportCsv(draft);
                        }}
                      >
                        匯出 CSV
                      </Button>
                    )}
                    {onPrint && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrint(draft);
                        }}
                      >
                        列印
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchived(draft);
                      }}
                    >
                      {isArchived ? '取消封存' : '封存'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
