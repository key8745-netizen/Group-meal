/**
 * PrepPlanPage — 備料快照 (Feature 013: 備料規劃引用菜單配方)
 * Create prep plans from recipe menus (read-only computed prepItems), and
 * edit name/date/notes / toggle active on existing plans.
 */

import { useEffect, useState } from 'react';
import { Plus, ClipboardCheck, Eye, EyeOff } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { IngredientMaster, PrepPlan } from '@/services/types';
import {
  listPrepPlans,
  createPrepPlanFromRecipeMenu,
  updatePrepPlan,
  setPrepPlanActive,
} from '@/services/prepPlanService';
import { listIngredients } from '@/services/ingredientMasterService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { PrepPlanList } from '@/components/prepPlans/PrepPlanList';
import { PrepPlanForm, type PrepPlanFormValues } from '@/components/prepPlans/PrepPlanForm';
import { PrepPlanDeductDialog } from '@/components/prepPlans/PrepPlanDeductDialog';

type EditingState =
  | { mode: 'create' }
  | { mode: 'edit'; prepPlan: PrepPlan }
  | null;

function toFormValues(prepPlan: PrepPlan): PrepPlanFormValues {
  return {
    name: prepPlan.name,
    date: prepPlan.date,
    notes: prepPlan.notes ?? '',
    sourceRecipeMenuId: prepPlan.sourceRecipeMenuId,
  };
}

export default function PrepPlanPage() {
  const [prepPlans, setPrepPlans] = useState<PrepPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [deducting, setDeducting] = useState<PrepPlan | null>(null);
  // Feature 103: 食材主檔（供刀工彙總解析預設切法／前處理備註）。best-effort，載入失敗不擋主流程。
  const [ingredientsById, setIngredientsById] = useState<Map<string, IngredientMaster>>(new Map());

  async function reload() {
    setLoading(true);
    try {
      const list = await listPrepPlans(db, { includeInactive: true });
      setPrepPlans(list);
    } catch {
      toast({ variant: 'destructive', title: '無法載入備料規劃資料' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    listIngredients(db, { includeInactive: true })
      .then((list) => setIngredientsById(new Map(list.map((i) => [i.id, i]))))
      .catch(() => { /* 刀工彙總降級為只看配方指定切法 */ });
  }, []);

  async function handleSave(form: PrepPlanFormValues) {
    const uid = auth.currentUser?.uid ?? '';
    if (editing?.mode === 'edit') {
      await updatePrepPlan(db, editing.prepPlan.id, {
        name: form.name,
        date: form.date,
        notes: form.notes,
      }, uid);
      toast({ title: '儲存成功', description: `「${form.name}」已更新。` });
    } else {
      await createPrepPlanFromRecipeMenu(db, {
        name: form.name,
        date: form.date,
        sourceRecipeMenuId: form.sourceRecipeMenuId,
        notes: form.notes,
      }, uid);
      toast({ title: '新增成功', description: `「${form.name}」已建立。` });
    }
    setEditing(null);
    await reload();
  }

  async function handleToggleActive(prepPlan: PrepPlan) {
    const uid = auth.currentUser?.uid ?? '';
    const nextActive = !prepPlan.isActive;
    try {
      await setPrepPlanActive(db, prepPlan.id, nextActive, uid);
      toast({ title: nextActive ? '已啟用' : '已停用', description: `「${prepPlan.name}」` });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作失敗' });
    }
  }

  const filtered = prepPlans
    .filter((p) => showInactive || p.isActive !== false)
    .filter((p) => !search.trim() || p.name.includes(search));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">備料快照</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              從菜單配方建立備料規劃，自動彙總各配方所需的食材數量。
            </p>
          </div>
        </div>
        <Button onClick={() => setEditing({ mode: 'create' })} className="gap-1.5">
          <Plus size={14} /> 從菜單配方建立備料規劃
        </Button>
      </div>

      {editing?.mode === 'create' && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <PrepPlanForm
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Input
          placeholder="搜尋備料規劃名稱…"
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
          {showInactive ? '隱藏已停用' : '顯示已停用'}
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
              <PrepPlanForm
                initial={toFormValues(editing.prepPlan)}
                prepItems={editing.prepPlan.prepItems}
                ingredientsById={ingredientsById}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}
          <PrepPlanList
            prepPlans={filtered}
            onEdit={(prepPlan) => setEditing({ mode: 'edit', prepPlan })}
            onToggleActive={handleToggleActive}
            onDeductStock={(prepPlan) => setDeducting(prepPlan)}
          />
          {deducting && (
            <PrepPlanDeductDialog
              prepPlan={deducting}
              onClose={() => setDeducting(null)}
              onDeducted={reload}
            />
          )}
        </>
      )}

      <Toaster />
    </div>
  );
}
