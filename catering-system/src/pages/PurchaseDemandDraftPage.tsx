/**
 * PurchaseDemandDraftPage — 採購需求草稿 (Feature 014: Purchase Demand Draft
 * from Prep Plans)
 * Create purchase demand drafts from prep plans (copies prepItems into
 * editable demand items), and edit draftName/notes/demandQuantity / toggle
 * archived on existing drafts.
 */

import { useEffect, useState } from 'react';
import { Plus, ClipboardList, Eye, EyeOff } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { PurchaseDemandDraft, PurchaseDemandDraftWorkflowStatus } from '@/services/types';
import {
  listPurchaseDemandDrafts,
  createDraftFromPrepPlan,
  updateDraft,
  archiveDraft,
  updateDraftWorkflowStatus,
} from '@/services/purchaseDemandDraftService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { PurchaseDemandDraftList } from '@/components/purchaseDemandDrafts/PurchaseDemandDraftList';
import { PurchaseDemandDraftPrintView } from '@/components/purchaseDemandDrafts/PurchaseDemandDraftPrintView';
import {
  PurchaseDemandDraftForm,
  type PurchaseDemandDraftFormValues,
} from '@/components/purchaseDemandDrafts/PurchaseDemandDraftForm';
import { draftToCsv, downloadCsv, sanitizeFilename } from '@/utils/purchaseDemandDraftExport';
import { planDraftConversion, convertDraftToPurchaseOrder } from '@/services/draftToPurchaseOrderService';

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; draft: PurchaseDemandDraft }
  | null;

function toFormValues(draft: PurchaseDemandDraft): PurchaseDemandDraftFormValues {
  return {
    draftName: draft.draftName,
    notes: draft.notes ?? '',
    sourcePrepPlanId: draft.sourcePrepPlanId,
    items: draft.items,
  };
}

export default function PurchaseDemandDraftPage() {
  const [drafts, setDrafts] = useState<PurchaseDemandDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [printDraft, setPrintDraft] = useState<PurchaseDemandDraft | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const list = await listPurchaseDemandDrafts(db, { includeInactive: true });
      setDrafts(list);
    } catch {
      toast({ variant: 'destructive', title: '無法載入採購需求草稿資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSave(form: PurchaseDemandDraftFormValues) {
    const uid = auth.currentUser?.uid ?? '';
    if (editing?.mode === 'edit') {
      await updateDraft(db, editing.draft.id, {
        draftName: form.draftName,
        notes: form.notes,
        items: form.items.map((item) => ({
          ingredientId: item.ingredientId,
          baseUnit: item.baseUnit,
          demandQuantity: item.demandQuantity,
          notes: item.notes,
        })),
      }, uid);
      toast({ title: '儲存成功', description: `「${form.draftName}」已更新。` });
    } else {
      await createDraftFromPrepPlan(db, {
        draftName: form.draftName,
        sourcePrepPlanId: form.sourcePrepPlanId,
        notes: form.notes,
      }, uid);
      toast({ title: '新增成功', description: `「${form.draftName}」已建立。` });
    }
    setEditing(null);
    await reload();
  }

  async function handleToggleArchived(draft: PurchaseDemandDraft) {
    const uid = auth.currentUser?.uid ?? '';
    const nextArchived = draft.status !== 'archived';
    try {
      await archiveDraft(db, draft.id, nextArchived, uid);
      toast({ title: nextArchived ? '已封存' : '已取消封存', description: `「${draft.draftName}」` });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  function handleExportCsv(draft: PurchaseDemandDraft) {
    downloadCsv(`${sanitizeFilename(draft.draftName)}.csv`, draftToCsv(draft));
  }

  function handlePrint(draft: PurchaseDemandDraft) {
    setPrintDraft(draft);
    setTimeout(() => {
      window.print();
      setPrintDraft(null);
    }, 0);
  }

  async function handleConvertToOrder(draft: PurchaseDemandDraft) {
    const uid = auth.currentUser?.uid ?? '';
    const plan = planDraftConversion(draft);
    if (plan.lines.length === 0) {
      toast({ title: '沒有可轉換的品項', description: '淨需求皆為 0（庫存足夠），或皆為個數單位。' });
      return;
    }
    const skippedNote = plan.skipped.length > 0 ? `\n（略過 ${plan.skipped.length} 項：${plan.skipped.map((s) => s.ingredientName).join('、')}）` : '';
    const proceed = window.confirm(
      `將建立正式採購單（待採購）：共 ${plan.lines.length} 項食材。${skippedNote}\n確認後草稿會標記為「已送採購」。`,
    );
    if (!proceed) return;
    try {
      const result = await convertDraftToPurchaseOrder(db, draft.id, uid);
      toast({
        title: '已建立採購單',
        description: `${result.lineCount} 項食材已轉入採購管理（待採購）；收貨時會自動入庫。`,
      });
      await reload();
    } catch (err) {
      toast({ variant: 'destructive', title: '轉採購單失敗', description: err instanceof Error ? err.message : '' });
    }
  }

  async function handleWorkflowStatusChange(draft: PurchaseDemandDraft, workflowStatus: PurchaseDemandDraftWorkflowStatus) {
    const uid = auth.currentUser?.uid ?? '';
    try {
      await updateDraftWorkflowStatus(db, draft.id, workflowStatus, uid);
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '更新採購流程狀態失敗' });
    }
  }

  const filtered = drafts
    .filter((d) => showInactive || d.isActive !== false)
    .filter((d) => !search.trim() || d.draftName.includes(search));

  return (
    <>
    <div className="flex flex-col gap-4 p-6 print:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">採購需求草稿</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              從備料規劃建立採購需求草稿，可調整各食材的需求數量。
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1.5">
          <Plus size={14} /> 從備料規劃建立採購需求草稿
        </Button>
      </div>

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <PurchaseDemandDraftForm
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋草稿名稱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? <EyeOff size={13} /> : <Eye size={13} />}
          {showInactive ? '隱藏已封存' : '顯示已封存'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {editing?.mode === 'edit' && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <PurchaseDemandDraftForm
                initial={toFormValues(editing.draft)}
                sourcePrepPlanNameSnapshot={editing.draft.sourcePrepPlanNameSnapshot}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <PurchaseDemandDraftList
            drafts={filtered}
            onEdit={(draft) => setEditing({ mode: 'edit', draft })}
            onToggleArchived={handleToggleArchived}
            onExportCsv={handleExportCsv}
            onPrint={handlePrint}
            onWorkflowStatusChange={handleWorkflowStatusChange}
            onConvertToOrder={handleConvertToOrder}
          />
        </>
      )}

      <Toaster />
    </div>

    {printDraft && (
      <div className="hidden print:block">
        <PurchaseDemandDraftPrintView draft={printDraft} />
      </div>
    )}
    </>
  );
}
