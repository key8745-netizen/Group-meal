import { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, Eye, EyeOff } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { ProductionWorkflowPlan, ProductionWorkflowTask } from '@/services/types';
import {
  listProductionWorkflowPlans,
  createProductionWorkflowPlanFromPrepPlan,
  updateProductionWorkflowPlan,
  archiveProductionWorkflowPlan,
} from '@/services/productionWorkflowService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { ProductionWorkflowList } from '@/components/productionWorkflows/ProductionWorkflowList';
import {
  ProductionWorkflowForm,
  type ProductionWorkflowFormValues,
} from '@/components/productionWorkflows/ProductionWorkflowForm';
import { ProductionWorkflowTaskList } from '@/components/productionWorkflows/ProductionWorkflowTaskList';

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; plan: ProductionWorkflowPlan }
  | null;

function toFormValues(plan: ProductionWorkflowPlan): ProductionWorkflowFormValues {
  return {
    planName: plan.planName,
    sourcePrepPlanId: plan.sourcePrepPlanId,
    serviceDate: plan.serviceDate ?? '',
    notes: plan.notes ?? '',
  };
}

export default function ProductionWorkflowPage() {
  const [plans, setPlans] = useState<ProductionWorkflowPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const list = await listProductionWorkflowPlans(db, { includeInactive: true });
      setPlans(list);
    } catch {
      toast({ variant: 'destructive', title: '無法載入製程規劃資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleSave(form: ProductionWorkflowFormValues) {
    const uid = auth.currentUser?.uid ?? '';
    try {
      if (editing?.mode === 'edit') {
        await updateProductionWorkflowPlan(db, editing.plan.id, {
          planName: form.planName,
          serviceDate: form.serviceDate,
          notes: form.notes,
          tasks: editing.plan.tasks,
        }, uid);
        toast({ title: '儲存成功', description: `「${form.planName}」已更新。` });
      } else {
        await createProductionWorkflowPlanFromPrepPlan(db, form.sourcePrepPlanId, {
          planName: form.planName,
          serviceDate: form.serviceDate,
          notes: form.notes,
        }, uid);
        toast({ title: '新增成功', description: `「${form.planName}」已建立。` });
      }
      setEditing(null);
      await reload();
    } catch (err) {
      toast({ variant: 'destructive', title: '操作失敗', description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleToggleArchive(plan: ProductionWorkflowPlan) {
    const uid = auth.currentUser?.uid ?? '';
    const nextArchived = plan.status !== 'archived';
    try {
      await archiveProductionWorkflowPlan(db, plan.id, nextArchived, uid);
      toast({ title: nextArchived ? '已封存' : '已取消封存', description: `「${plan.planName}」` });
      if (editing?.mode === 'edit' && editing.plan.id === plan.id) {
        setEditing(null);
      }
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  async function handleSaveTasks(planId: string, tasks: ProductionWorkflowTask[]) {
    const uid = auth.currentUser?.uid ?? '';
    setTaskSaving(true);
    try {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      await updateProductionWorkflowPlan(db, planId, {
        planName: plan.planName,
        serviceDate: plan.serviceDate,
        notes: plan.notes,
        tasks,
      }, uid);
      await reload();
      // update editing plan reference to reflect new tasks
      setEditing((prev) => {
        if (prev?.mode === 'edit' && prev.plan.id === planId) {
          return { mode: 'edit', plan: { ...prev.plan, tasks } };
        }
        return prev;
      });
    } catch (err) {
      toast({ variant: 'destructive', title: '任務儲存失敗', description: err instanceof Error ? err.message : undefined });
    } finally {
      setTaskSaving(false);
    }
  }

  const filtered = plans
    .filter((p) => showInactive || p.isActive !== false)
    .filter((p) => !search.trim() || p.planName.includes(search));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">製程規劃</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              從備料快照建立廚房作業製程規劃表，安排任務順序與設備人員配置。
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditing({ mode: 'create' }); }} className="gap-1.5">
          <Plus size={14} /> 從備料規劃建立製程規劃
        </Button>
      </div>

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <ProductionWorkflowForm
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋規劃名稱…"
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
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {editing?.mode === 'edit' && (
            <div className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-6">
              <div>
                <p className="mb-3 text-sm font-medium text-muted-foreground">規劃資訊</p>
                <ProductionWorkflowForm
                  initial={toFormValues(editing.plan)}
                  sourcePrepPlanNameSnapshot={editing.plan.sourcePrepPlanNameSnapshot}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-muted-foreground">任務清單</p>
                <ProductionWorkflowTaskList
                  key={editing.plan.id}
                  tasks={editing.plan.tasks}
                  onSaveTasks={(tasks) => handleSaveTasks(editing.plan.id, tasks)}
                  saving={taskSaving}
                />
              </div>
            </div>
          )}
          <ProductionWorkflowList
            plans={filtered}
            onEdit={(plan) => setEditing({ mode: 'edit', plan })}
            onToggleArchive={handleToggleArchive}
          />
        </>
      )}

      <Toaster />
    </div>
  );
}
