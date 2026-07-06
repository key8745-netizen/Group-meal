import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getPrepPlan } from '@/services/prepPlanService';
import { listIngredients } from '@/services/ingredientMasterService';
import { generateTaskDraftsFromPrepPlan } from '@/services/workflowTaskDraftService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import type {
  ProductionWorkflowTask,
  ProcessType,
  CutType,
  CookingMethod,
  EquipmentType,
} from '@/services/types';

const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  wash: '清洗', peel: '去皮', cut: '切割', marinate: '醃製', blanch: '汆燙',
  preCook: '預煮', cool: '冷卻', portion: '分裝', cook: '烹煮', hold: '保溫', clean: '清潔',
};

const CUT_TYPE_LABELS: Record<CutType, string> = {
  none: '無', julienne: '切絲', slice: '切片', dice: '切丁', chunk: '切塊',
  rollCut: '滾刀', mince: '切末', section: '切段', diagonal: '斜切', shred: '撕碎',
};

const COOKING_METHOD_LABELS: Record<CookingMethod, string> = {
  none: '無', panFry: '煎', boil: '煮', stirFry: '炒', deepFry: '炸', braise: '滷',
  roast: '烤', steam: '蒸', blanch: '汆燙', mix: '拌', holdWarm: '保溫', chill: '冷藏',
};

const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  sink: '水槽', cuttingStation: '切割台', prepTable: '備料台', wok: '炒鍋',
  stoveBurner: '爐灶', stockPot: '湯鍋', deepFryer: '油炸機', oven: '烤箱',
  steamer: '蒸箱', holdingCabinet: '保溫箱', coolingArea: '冷卻區',
  packingTable: '打包台', refrigerator: '冰箱', none: '無',
};

const PROCESS_TYPES = Object.keys(PROCESS_TYPE_LABELS) as ProcessType[];
const CUT_TYPES = Object.keys(CUT_TYPE_LABELS) as CutType[];
const COOKING_METHODS = Object.keys(COOKING_METHOD_LABELS) as CookingMethod[];
const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_TYPE_LABELS) as EquipmentType[];

function emptyNewTask(): Omit<ProductionWorkflowTask, 'id'> {
  return {
    taskStatus: 'active',
    taskName: '',
    processType: 'cut',
    cutType: 'none',
    cookingMethod: 'none',
    equipmentType: 'none',
    estimatedMinutes: 10,
    staffRole: '',
    staffCount: 1,
    sequence: 1,
    dependsOnTaskIds: [],
    canRunInParallel: false,
    notes: '',
  };
}

export function ProductionWorkflowTaskList({
  tasks,
  sourcePrepPlanId,
  onSaveTasks,
  saving,
}: {
  tasks: ProductionWorkflowTask[];
  sourcePrepPlanId: string;
  onSaveTasks: (tasks: ProductionWorkflowTask[]) => Promise<void>;
  saving?: boolean;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentType | ''>('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState<Omit<ProductionWorkflowTask, 'id'>>(emptyNewTask());
  const [pendingTasks, setPendingTasks] = useState<ProductionWorkflowTask[]>(tasks);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftNotes, setDraftNotes] = useState<string[] | null>(null);
  const [draftTaskIds, setDraftTaskIds] = useState<Set<string>>(new Set());

  const visible = pendingTasks
    .filter((t) => showArchived || t.taskStatus === 'active')
    .filter((t) => !equipmentFilter || t.equipmentType === equipmentFilter)
    .filter((t) => !staffRoleFilter.trim() || (t.staffRole ?? '').includes(staffRoleFilter.trim()))
    .sort((a, b) => a.sequence - b.sequence);

  async function handleArchiveTask(taskId: string) {
    const updated = pendingTasks.map((t) =>
      t.id === taskId ? { ...t, taskStatus: 'archived' as const } : t
    );
    setPendingTasks(updated);
    await onSaveTasks(updated);
  }

  async function handleAddTask() {
    if (!newTask.taskName.trim()) return;
    const task: ProductionWorkflowTask = {
      ...newTask,
      id: crypto.randomUUID(),
    };
    const updated = [...pendingTasks, task];
    setPendingTasks(updated);
    await onSaveTasks(updated);
    setNewTask(emptyNewTask());
    setAddingTask(false);
  }

  async function handleGenerateDrafts() {
    const activeCount = pendingTasks.filter((t) => t.taskStatus === 'active').length;
    if (activeCount > 0) {
      const proceed = window.confirm(
        `此規劃已有 ${activeCount} 項進行中的任務，是否仍要附加自動產生的任務草稿？`,
      );
      if (!proceed) return;
    }
    setGeneratingDraft(true);
    try {
      const prepPlan = await getPrepPlan(db, sourcePrepPlanId);
      if (!prepPlan || prepPlan.isActive === false) {
        toast({ variant: 'destructive', title: '來源備料快照不存在或已停用，無法產生任務草稿' });
        return;
      }
      const ingredients = await listIngredients(db, { includeInactive: true });
      const result = generateTaskDraftsFromPrepPlan(prepPlan, ingredients, pendingTasks.map((t) => t.id));
      if (result.tasks.length === 0) {
        toast({ title: '沒有可產生的任務', description: '來源備料快照沒有食材項目。' });
        return;
      }
      setPendingTasks((prev) => [...prev, ...result.tasks]);
      setDraftTaskIds(new Set(result.tasks.map((t) => t.id)));
      setDraftNotes(result.generationNotes);
    } catch (err) {
      toast({ variant: 'destructive', title: '產生任務草稿失敗', description: err instanceof Error ? err.message : undefined });
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleSaveDrafts() {
    await onSaveTasks(pendingTasks);
    setDraftTaskIds(new Set());
    setDraftNotes(null);
  }

  function handleDiscardDrafts() {
    setPendingTasks((prev) => prev.filter((t) => !draftTaskIds.has(t.id)));
    setDraftTaskIds(new Set());
    setDraftNotes(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={equipmentFilter}
          onChange={(e) => setEquipmentFilter(e.target.value as EquipmentType | '')}
        >
          <option value="">所有設備</option>
          {EQUIPMENT_TYPES.map((v) => (
            <option key={v} value={v}>{EQUIPMENT_TYPE_LABELS[v]}</option>
          ))}
        </select>
        <Input
          className="max-w-[140px] text-xs h-8"
          placeholder="篩選人員角色…"
          value={staffRoleFilter}
          onChange={(e) => setStaffRoleFilter(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? '隱藏已封存任務' : '顯示已封存任務'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs ml-auto"
          onClick={handleGenerateDrafts}
          disabled={generatingDraft}
        >
          <Sparkles size={12} /> {generatingDraft ? '產生中…' : '自動產生任務草稿'}
        </Button>
        <Button
          size="sm"
          className="gap-1 text-xs"
          onClick={() => setAddingTask(true)}
          disabled={addingTask}
        >
          <Plus size={12} /> 新增任務
        </Button>
      </div>

      {draftNotes && (
        <div className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-2">
          <p className="text-sm font-medium">自動產生任務草稿結果（尚未儲存）</p>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {draftNotes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
          <div className="mt-1 flex gap-2">
            <Button size="sm" onClick={handleSaveDrafts} disabled={saving}>
              {saving ? '儲存中…' : '儲存草稿任務'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDiscardDrafts} disabled={saving}>
              捨棄草稿
            </Button>
          </div>
        </div>
      )}

      {addingTask && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="mb-3 text-sm font-medium">新增任務</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">任務名稱 *</label>
              <Input
                className="text-xs h-8"
                value={newTask.taskName}
                onChange={(e) => setNewTask((p) => ({ ...p, taskName: e.target.value }))}
                placeholder="任務名稱"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">製程類型</label>
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs h-8"
                value={newTask.processType}
                onChange={(e) => setNewTask((p) => ({ ...p, processType: e.target.value as ProcessType }))}
              >
                {PROCESS_TYPES.map((v) => <option key={v} value={v}>{PROCESS_TYPE_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">切割方式</label>
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs h-8"
                value={newTask.cutType ?? 'none'}
                onChange={(e) => setNewTask((p) => ({ ...p, cutType: e.target.value as CutType }))}
              >
                {CUT_TYPES.map((v) => <option key={v} value={v}>{CUT_TYPE_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">烹調方式</label>
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs h-8"
                value={newTask.cookingMethod ?? 'none'}
                onChange={(e) => setNewTask((p) => ({ ...p, cookingMethod: e.target.value as CookingMethod }))}
              >
                {COOKING_METHODS.map((v) => <option key={v} value={v}>{COOKING_METHOD_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">設備</label>
              <select
                className="rounded-md border bg-background px-2 py-1 text-xs h-8"
                value={newTask.equipmentType}
                onChange={(e) => setNewTask((p) => ({ ...p, equipmentType: e.target.value as EquipmentType }))}
              >
                {EQUIPMENT_TYPES.map((v) => <option key={v} value={v}>{EQUIPMENT_TYPE_LABELS[v]}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">預估時間（分鐘）</label>
              <Input
                className="text-xs h-8"
                type="number"
                min={1}
                value={newTask.estimatedMinutes}
                onChange={(e) => setNewTask((p) => ({ ...p, estimatedMinutes: Number(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">人員角色</label>
              <Input
                className="text-xs h-8"
                value={newTask.staffRole ?? ''}
                onChange={(e) => setNewTask((p) => ({ ...p, staffRole: e.target.value }))}
                placeholder="例：切割師"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">人員數量</label>
              <Input
                className="text-xs h-8"
                type="number"
                min={1}
                value={newTask.staffCount}
                onChange={(e) => setNewTask((p) => ({ ...p, staffCount: Number(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">順序</label>
              <Input
                className="text-xs h-8"
                type="number"
                min={1}
                value={newTask.sequence}
                onChange={(e) => setNewTask((p) => ({ ...p, sequence: Number(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-medium">相依任務（需先完成）</label>
              <div className="flex flex-wrap gap-1 rounded-md border bg-background p-2 min-h-[32px]">
                {pendingTasks.filter((t) => t.taskStatus === 'active').length === 0 ? (
                  <span className="text-xs text-muted-foreground">尚無可選擇的任務</span>
                ) : (
                  pendingTasks
                    .filter((t) => t.taskStatus === 'active')
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((t) => {
                      const checked = newTask.dependsOnTaskIds.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center gap-1 text-xs cursor-pointer rounded px-1.5 py-0.5 border bg-muted/30 hover:bg-muted/60">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setNewTask((p) => ({
                                ...p,
                                dependsOnTaskIds: e.target.checked
                                  ? [...p.dependsOnTaskIds, t.id]
                                  : p.dependsOnTaskIds.filter((id) => id !== t.id),
                              }));
                            }}
                          />
                          {t.sequence}. {t.taskName}
                        </label>
                      );
                    })
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                id="canRunInParallel"
                type="checkbox"
                checked={newTask.canRunInParallel}
                onChange={(e) => setNewTask((p) => ({ ...p, canRunInParallel: e.target.checked }))}
              />
              <label htmlFor="canRunInParallel" className="text-xs font-medium">可並行</label>
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-medium">備註</label>
              <Input
                className="text-xs h-8"
                value={newTask.notes ?? ''}
                onChange={(e) => setNewTask((p) => ({ ...p, notes: e.target.value }))}
                placeholder="選填"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleAddTask} disabled={!newTask.taskName.trim() || saving}>
              {saving ? '儲存中…' : '儲存任務'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddingTask(false); setNewTask(emptyNewTask()); }}>
              取消
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-10 text-muted-foreground">
          <p className="text-sm">尚無任務</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs">順序</th>
                <th className="px-3 py-2 text-left text-xs">任務名稱</th>
                <th className="px-3 py-2 text-left text-xs">製程</th>
                <th className="px-3 py-2 text-left text-xs">切割</th>
                <th className="px-3 py-2 text-left text-xs">烹調</th>
                <th className="px-3 py-2 text-left text-xs">設備</th>
                <th className="px-3 py-2 text-right text-xs">時間(分)</th>
                <th className="px-3 py-2 text-left text-xs">人員角色</th>
                <th className="px-3 py-2 text-right text-xs">人數</th>
                <th className="px-3 py-2 text-left text-xs">並行</th>
                <th className="px-3 py-2 text-left text-xs">相依任務</th>
                <th className="px-3 py-2 text-left text-xs">狀態</th>
                <th className="px-3 py-2 text-right text-xs">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => (
                <tr key={task.id} className="border-b last:border-0">
                  <td className="px-3 py-2 tabular-nums text-xs">{task.sequence}</td>
                  <td className="px-3 py-2 font-medium text-xs">
                    {task.taskName}
                    {draftTaskIds.has(task.id) && (
                      <Badge variant="outline" className="ml-1.5 text-[10px]">未儲存草稿</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{PROCESS_TYPE_LABELS[task.processType]}</td>
                  <td className="px-3 py-2 text-xs">{task.cutType ? CUT_TYPE_LABELS[task.cutType] : '—'}</td>
                  <td className="px-3 py-2 text-xs">{task.cookingMethod ? COOKING_METHOD_LABELS[task.cookingMethod] : '—'}</td>
                  <td className="px-3 py-2 text-xs">{EQUIPMENT_TYPE_LABELS[task.equipmentType]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{task.estimatedMinutes}</td>
                  <td className="px-3 py-2 text-xs">{task.staffRole || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{task.staffCount}</td>
                  <td className="px-3 py-2 text-xs">{task.canRunInParallel ? '是' : '否'}</td>
                  <td className="px-3 py-2 text-xs">
                    {task.dependsOnTaskIds.length === 0 ? '—' : (
                      <span title={task.dependsOnTaskIds
                        .map((id) => {
                          const dep = pendingTasks.find((t) => t.id === id);
                          return dep ? `${dep.sequence}. ${dep.taskName}` : id;
                        })
                        .join(', ')}
                        className="cursor-help underline decoration-dotted"
                      >
                        {task.dependsOnTaskIds.length} 個
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Badge variant={task.taskStatus === 'archived' ? 'outline' : 'default'} className="text-xs">
                      {task.taskStatus === 'archived' ? '已封存' : '進行中'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {task.taskStatus === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleArchiveTask(task.id)}
                        disabled={saving}
                      >
                        封存任務
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
