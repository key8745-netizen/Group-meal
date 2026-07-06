/**
 * workflowTaskDraftService — Feature 036: 製程任務自動草稿.
 *
 * Pure, zero-Firestore generator that turns a `PrepPlan`'s aggregated
 * `prepItems[]` into a first-pass set of `ProductionWorkflowTask` drafts,
 * using a small heuristic template table keyed on `IngredientMaster.category`
 * keywords. This closes the gap between 備料快照 (prep plan) and 製程規劃
 * (production workflow) so a user is not forced to hand-write every wash /
 * cut / marinate / cook task from scratch.
 *
 * IMPORTANT: this is a *draft* generator only. The caller is responsible for
 * appending the returned `tasks` into the existing task editor's local
 * unsaved state and letting the human review + save via the existing
 * `updateProductionWorkflowPlan` path. This module never touches Firestore
 * and never decides estimatedMinutes with anything more than a coarse linear
 * heuristic — the numbers in the template table below are defaults meant to
 * be adjusted by a human in the editor, not authoritative labor estimates.
 */

import type {
  CutType,
  EquipmentType,
  IngredientMaster,
  PrepPlan,
  ProcessType,
  ProductionWorkflowTask,
} from './types';

/** One step of a category template — an editable default, not a hard rule. */
export interface TaskDraftTemplateStep {
  processType: ProcessType;
  cutType?: CutType;
  equipmentType: EquipmentType;
  baseMinutes: number;
  minutesPerKg: number;
  staffRole: string;
}

export interface GeneratedTaskDraftResult {
  tasks: ProductionWorkflowTask[];
  generationNotes: string[];
}

// ─── Template table (editable defaults — heuristic minutes, human adjusts in the editor) ───

/** category includes 蔬 / 菜 / 葉 → wash then cut(slice). */
export const VEGETABLE_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 5, minutesPerKg: 2, staffRole: '助手' },
  { processType: 'cut', cutType: 'slice', equipmentType: 'cuttingStation', baseMinutes: 5, minutesPerKg: 4, staffRole: '助手' },
];

/** category includes 肉 / 雞 / 豬 / 牛 / 魚 / 海鮮 → cut(slice) then marinate. */
export const MEAT_SEAFOOD_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'cut', cutType: 'slice', equipmentType: 'cuttingStation', baseMinutes: 5, minutesPerKg: 5, staffRole: '廚師' },
  { processType: 'marinate', equipmentType: 'prepTable', baseMinutes: 10, minutesPerKg: 2, staffRole: '廚師' },
];

/** category includes 乾貨 / 調味 / 米 / 麵 → single portioning step. */
export const DRY_GOODS_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'portion', equipmentType: 'prepTable', baseMinutes: 3, minutesPerKg: 1, staffRole: '助手' },
];

/** Unknown/missing category, or ingredient missing from master data → same chain as vegetables. */
export const FALLBACK_TEMPLATE: TaskDraftTemplateStep[] = VEGETABLE_TEMPLATE;

const VEGETABLE_KEYWORDS = ['蔬', '菜', '葉'];
const MEAT_SEAFOOD_KEYWORDS = ['肉', '雞', '豬', '牛', '魚', '海鮮'];
const DRY_GOODS_KEYWORDS = ['乾貨', '調味', '米', '麵'];

const PROCESS_STEP_LABELS: Partial<Record<ProcessType, string>> = {
  wash: '清洗',
  cut: '切割',
  marinate: '醃製',
  portion: '分裝',
};

function matchTemplate(category: string | undefined): { steps: TaskDraftTemplateStep[]; matched: boolean } {
  const cat = category ?? '';
  if (VEGETABLE_KEYWORDS.some((k) => cat.includes(k))) return { steps: VEGETABLE_TEMPLATE, matched: true };
  if (MEAT_SEAFOOD_KEYWORDS.some((k) => cat.includes(k))) return { steps: MEAT_SEAFOOD_TEMPLATE, matched: true };
  if (DRY_GOODS_KEYWORDS.some((k) => cat.includes(k))) return { steps: DRY_GOODS_TEMPLATE, matched: true };
  return { steps: FALLBACK_TEMPLATE, matched: false };
}

function stepTaskName(ingredientName: string, step: TaskDraftTemplateStep): string {
  const label = PROCESS_STEP_LABELS[step.processType] ?? step.processType;
  if (step.cutType && step.cutType !== 'none') {
    const cutLabel = step.cutType === 'slice' ? '切片' : step.cutType;
    return `${ingredientName}：${label}（${cutLabel}）`;
  }
  return `${ingredientName}：${label}`;
}

/**
 * Allocates `draft-{n}` ids (incrementing n, skipping any collision with
 * `existingTaskIds` or ids already handed out in this call) — deterministic
 * and collision-safe, matching the "prefix draft-{n}" convention. The task
 * editor itself assigns ids via `crypto.randomUUID()` when a user manually
 * adds a task (see `ProductionWorkflowTaskList.tsx`), but task ids are
 * opaque internal strings with no format validation anywhere (tasks live in
 * an embedded array on the plan doc, not as Firestore doc ids), so using a
 * deterministic scheme here has no user-visible effect while keeping this
 * generator pure and reproducible for tests.
 */
function makeIdAllocator(existingTaskIds: string[]) {
  const used = new Set(existingTaskIds);
  let n = 1;
  return function nextId(): string {
    while (used.has(`draft-${n}`)) n += 1;
    const id = `draft-${n}`;
    used.add(id);
    n += 1;
    return id;
  };
}

/**
 * Generates a first-pass set of production workflow tasks from a prep plan's
 * aggregated ingredient requirements. Pure function — no Firestore access.
 *
 * `existingTaskIds` is used both as an id-collision safety filter and (since
 * this function has no visibility into existing tasks' `sequence` values) as
 * a proxy for "how many tasks already exist" when continuing the sequence
 * counter — this assumes existing tasks are numbered contiguously from 1,
 * which matches how the manual task editor is normally used.
 */
export function generateTaskDraftsFromPrepPlan(
  prepPlan: PrepPlan,
  ingredients: IngredientMaster[],
  existingTaskIds: string[],
): GeneratedTaskDraftResult {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const nextId = makeIdAllocator(existingTaskIds);

  const tasks: ProductionWorkflowTask[] = [];
  const notes: string[] = [];
  let seq = existingTaskIds.length;

  // recipeId -> (last prep-step task id of every ingredient it touches)
  const recipeLastStepIds = new Map<string, Set<string>>();
  const recipeNameById = new Map<string, string>();
  const recipeServingsById = new Map<string, number>();

  const prepItems = prepPlan.prepItems ?? [];

  for (const item of prepItems) {
    const ingredient = ingredientById.get(item.ingredientId);
    const { steps, matched } = matchTemplate(ingredient?.category);

    if (!matched) {
      if (!ingredient) {
        notes.push(
          `「${item.ingredientNameSnapshot}」（ID: ${item.ingredientId}）找不到食材主檔資料，已套用預設清洗→切割範本，請人工確認實際製程。`,
        );
      } else {
        notes.push(
          `「${item.ingredientNameSnapshot}」缺少可辨識類別（category: ${ingredient.category || '（空白）'}），已套用預設清洗→切割範本，請人工確認實際製程。`,
        );
      }
    }

    let quantityKg = 0;
    if (item.baseUnit === 'g') {
      quantityKg = item.requiredBaseQuantity / 1000;
    } else if (item.baseUnit === 'ml') {
      quantityKg = item.requiredBaseQuantity / 1000;
      notes.push(`「${item.ingredientNameSnapshot}」以毫升（ml）計量，暫以 1 毫升 ≈ 1 公克概算重量，請人工確認。`);
    } else if (item.baseUnit === 'pcs') {
      quantityKg = 0;
      notes.push(`「${item.ingredientNameSnapshot}」以個數（pcs）計量，僅套用固定時間估算，未依重量調整工時。`);
    }

    const sourcePrepPlanItemId = `${item.ingredientId}__${item.baseUnit}`;
    let prevStepId: string | undefined;
    let lastStepId: string | undefined;

    for (const step of steps) {
      const minutes = Math.max(1, Math.round(step.baseMinutes + step.minutesPerKg * quantityKg));
      seq += 1;
      const id = nextId();
      const task: ProductionWorkflowTask = {
        id,
        taskStatus: 'active',
        ingredientId: item.ingredientId,
        ingredientNameSnapshot: item.ingredientNameSnapshot,
        sourcePrepPlanItemId,
        taskName: stepTaskName(item.ingredientNameSnapshot, step),
        processType: step.processType,
        ...(step.cutType ? { cutType: step.cutType } : {}),
        equipmentType: step.equipmentType,
        estimatedMinutes: minutes,
        staffRole: step.staffRole,
        staffCount: 1,
        sequence: seq,
        dependsOnTaskIds: prevStepId ? [prevStepId] : [],
        canRunInParallel: true,
        notes: '自動產生草稿，請人工確認',
      };
      tasks.push(task);
      prevStepId = id;
      lastStepId = id;
    }

    for (const contribution of item.recipeContributions ?? []) {
      if (!recipeLastStepIds.has(contribution.recipeId)) {
        recipeLastStepIds.set(contribution.recipeId, new Set());
      }
      if (lastStepId) {
        recipeLastStepIds.get(contribution.recipeId)!.add(lastStepId);
      }
      if (!recipeNameById.has(contribution.recipeId)) {
        recipeNameById.set(contribution.recipeId, contribution.recipeNameSnapshot);
      }
      if (!recipeServingsById.has(contribution.recipeId)) {
        recipeServingsById.set(contribution.recipeId, contribution.sourceServings);
      }
    }
  }

  const recipeIds = Array.from(recipeNameById.keys()).sort((a, b) =>
    recipeNameById.get(a)!.localeCompare(recipeNameById.get(b)!, 'zh-TW'),
  );

  if (recipeIds.length > 0) {
    notes.push('所有烹調任務之烹調方式／設備為系統預設值（炒／炒鍋），請依實際製程調整。');
  }

  for (const recipeId of recipeIds) {
    const recipeName = recipeNameById.get(recipeId)!;
    const servings = recipeServingsById.get(recipeId) ?? 0;
    const minutes = Math.max(15, Math.round(15 + 0.05 * servings));
    seq += 1;
    const id = nextId();
    const dependsOnTaskIds = Array.from(recipeLastStepIds.get(recipeId) ?? []);
    tasks.push({
      id,
      taskStatus: 'active',
      recipeId,
      recipeNameSnapshot: recipeName,
      taskName: `烹調：${recipeName}`,
      processType: 'cook',
      cookingMethod: 'stirFry',
      equipmentType: 'wok',
      estimatedMinutes: minutes,
      staffRole: '廚師',
      staffCount: 1,
      sequence: seq,
      dependsOnTaskIds,
      canRunInParallel: false,
      notes: '自動產生草稿，請人工確認',
    });
  }

  notes.unshift(`${prepItems.length} 食材 → ${tasks.length} 任務`);
  notes.push('自動產生僅為草稿，工時與製程請人工確認後儲存。');

  return { tasks, generationNotes: notes };
}
