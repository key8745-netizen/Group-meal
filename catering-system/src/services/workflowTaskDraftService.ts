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
  /** zh-TW step name override（工序名稱）；缺省用 processType 標籤。 */
  label?: string;
  /** 工序要領——寫入任務 notes 供現場人員參考（Feature 051）。 */
  guidance?: string;
}

export interface GeneratedTaskDraftResult {
  tasks: ProductionWorkflowTask[];
  generationNotes: string[];
}

// ─── Template table（Feature 051: 專業備料工序範本）────────────────────────
// 依團膳實務工序編寫：前置清潔 → 刀工成型 → 蛋白質精處理（醃漬上漿）→
// 半製備初熟（汆燙/過油/預炸）→ 小料與醬汁預調。每步驟附「要領」寫入
// 任務備註。全部是可編輯的草稿預設值，不是硬性規則。

/** 葉菜類：挑揀摘除 → 流動水清洗＋瀝乾 → 切段。 */
export const LEAFY_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'prepTable', baseMinutes: 4, minutesPerKg: 2, staffRole: '助手',
    label: '挑揀摘除', guidance: '摘除黃葉、老梗與蒂頭；不可食部位去蕪存菁' },
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 5, minutesPerKg: 2, staffRole: '助手',
    label: '清洗瀝乾', guidance: '流動清水浸泡沖洗去除農藥與泥沙；脫水籮甩乾，避免多餘水分稀釋醬汁、降低炒製溫度' },
  { processType: 'cut', cutType: 'section', equipmentType: 'cuttingStation', baseMinutes: 4, minutesPerKg: 3, staffRole: '助手',
    label: '切段成型', guidance: '依菜式切等長段落，受熱均勻、口感一致' },
];

/** 根莖／瓜果類：刷洗削皮 → 切割成型（滾刀塊/片/絲依菜式）。 */
export const ROOT_GOURD_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'peel', equipmentType: 'sink', baseMinutes: 5, minutesPerKg: 3, staffRole: '助手',
    label: '刷洗削皮', guidance: '帶皮品項以專用刷具刷除縫隙泥沙；需削皮者以刨刀去皮、去蒂頭' },
  { processType: 'cut', cutType: 'rollCut', equipmentType: 'cuttingStation', baseMinutes: 5, minutesPerKg: 4, staffRole: '助手',
    label: '切割成型', guidance: '圓柱狀食材滾刀塊（每切一刀轉 90°）多切面受熱均勻易入味；燉煮用 1.5cm 以上角塊、快炒切片或切絲（逆紋較嫩）' },
];

/** 豆菜類：挑揀去筋 → 切段。 */
export const BEAN_VEG_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 5, minutesPerKg: 3, staffRole: '助手',
    label: '挑揀去筋', guidance: '撕除豆莢頭尾與粗筋（豌豆絲），流動水清洗瀝乾' },
  { processType: 'cut', cutType: 'section', equipmentType: 'cuttingStation', baseMinutes: 4, minutesPerKg: 3, staffRole: '助手',
    label: '切段', guidance: '切等長段落' },
];

/** 辛香類：清洗去皮 → 小料準備（切末分裝調料盒）。 */
export const AROMATICS_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 3, minutesPerKg: 2, staffRole: '助手',
    label: '清洗去皮', guidance: '蒜剝皮、薑刷洗、蔥去根與黃葉' },
  { processType: 'cut', cutType: 'mince', equipmentType: 'cuttingStation', baseMinutes: 5, minutesPerKg: 6, staffRole: '助手',
    label: '小料準備', guidance: '切蔥花／薑末／蒜末／辣椒絲（細丁約 0.2cm），依爆香比例分裝小調料盒備用' },
];

/** 菇蕈類：修整清潔（勿久泡）→ 切片。 */
export const MUSHROOM_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 3, minutesPerKg: 2, staffRole: '助手',
    label: '修整清潔', guidance: '剪除根部，快速沖洗或濕布擦拭；勿久泡吸水影響口感' },
  { processType: 'cut', cutType: 'slice', equipmentType: 'cuttingStation', baseMinutes: 4, minutesPerKg: 3, staffRole: '助手',
    label: '切片', guidance: '依菜式切片或撕條' },
];

/** 肉類：分切修整 → 醃漬上漿 → 預熟處理（視菜式，可刪）。 */
export const MEAT_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'cut', cutType: 'slice', equipmentType: 'cuttingStation', baseMinutes: 6, minutesPerKg: 5, staffRole: '廚師',
    label: '分切修整', guidance: '依克重定量分切；修除多餘肥油、淋巴與硬筋膜；逆紋切破壞纖維口感較嫩；厚排以肉槌/刀背斷筋防縮' },
  { processType: 'marinate', equipmentType: 'prepTable', baseMinutes: 10, minutesPerKg: 2, staffRole: '廚師',
    label: '醃漬上漿', guidance: '打水：水或高湯分次揉入使蛋白質吸水；上漿：蛋白＋太白粉揉勻形成保護膜鎖水；鹽/醬油/米酒/薑汁打底去腥' },
  { processType: 'preCook', equipmentType: 'stoveBurner', baseMinutes: 8, minutesPerKg: 3, staffRole: '廚師',
    label: '預熟處理', guidance: '視菜式選用：排骨/大骨冷水下鍋汆燙去血水雜質；上漿肉片 120–140°C 低溫過油定型保嫩；需預炸定型者高溫油炸——不需要此步驟請刪除' },
];

/** 水產類：分切修整 → 去腥醃漬。 */
export const SEAFOOD_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'cut', cutType: 'slice', equipmentType: 'cuttingStation', baseMinutes: 6, minutesPerKg: 5, staffRole: '廚師',
    label: '分切修整', guidance: '魚去鱗去刺（片菲力）；蝦開背去腸泥；依克重定量分切' },
  { processType: 'marinate', equipmentType: 'prepTable', baseMinutes: 6, minutesPerKg: 2, staffRole: '廚師',
    label: '去腥醃漬', guidance: '米酒、薑汁去腥，鹽打底；海鮮醃漬時間宜短以免出水' },
];

/** 蛋豆製品：前處理（切塊/打散，板豆腐可先汆燙）。 */
export const EGG_TOFU_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'cut', cutType: 'dice', equipmentType: 'cuttingStation', baseMinutes: 4, minutesPerKg: 3, staffRole: '助手',
    label: '前處理', guidance: '豆腐切塊（板豆腐可先汆燙定型去豆味）；蛋打散調味；豆干切片或切丁' },
];

/** 米麵乾貨：泡發/洗米 → 分裝備用。 */
export const DRY_GOODS_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 4, minutesPerKg: 2, staffRole: '助手',
    label: '泡發洗淨', guidance: '乾香菇/金針/海帶芽等溫水泡發；米洗淨浸泡；麵條備妥' },
  { processType: 'portion', equipmentType: 'prepTable', baseMinutes: 3, minutesPerKg: 1, staffRole: '助手',
    label: '分裝備用', guidance: '依出餐量分裝' },
];

/** 加工食品類：解凍分裝。 */
export const PROCESSED_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'portion', equipmentType: 'prepTable', baseMinutes: 4, minutesPerKg: 1, staffRole: '助手',
    label: '解凍分裝', guidance: '冷凍品提前移冷藏解凍；依出餐量分裝備用' },
];

/** 水果類：清洗 → 切分。 */
export const FRUIT_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'wash', equipmentType: 'sink', baseMinutes: 3, minutesPerKg: 2, staffRole: '助手',
    label: '清洗', guidance: '流動水清洗、去蒂頭' },
  { processType: 'cut', cutType: 'chunk', equipmentType: 'cuttingStation', baseMinutes: 4, minutesPerKg: 3, staffRole: '助手',
    label: '切分', guidance: '依供餐份量切分' },
];

/** 飲品類：分裝。 */
export const BEVERAGE_TEMPLATE: TaskDraftTemplateStep[] = [
  { processType: 'portion', equipmentType: 'prepTable', baseMinutes: 3, minutesPerKg: 1, staffRole: '助手',
    label: '分裝', guidance: '依出餐量分裝' },
];

/** Unknown/missing category → 通用清洗切割鏈（同葉菜）。 */
export const FALLBACK_TEMPLATE: TaskDraftTemplateStep[] = LEAFY_TEMPLATE;

/** 向後相容別名（既有測試/引用）。 */
export const VEGETABLE_TEMPLATE = LEAFY_TEMPLATE;
export const MEAT_SEAFOOD_TEMPLATE = MEAT_TEMPLATE;

/** Keyword → template，先長詞後短詞避免誤判（蛋豆 before 豆菜 before 菜）。 */
const TEMPLATE_MATCHERS: { keywords: string[]; steps: TaskDraftTemplateStep[] }[] = [
  { keywords: ['蛋豆'], steps: EGG_TOFU_TEMPLATE },
  { keywords: ['豆菜'], steps: BEAN_VEG_TEMPLATE },
  { keywords: ['辛香'], steps: AROMATICS_TEMPLATE },
  { keywords: ['菇', '蕈'], steps: MUSHROOM_TEMPLATE },
  { keywords: ['水果'], steps: FRUIT_TEMPLATE },
  { keywords: ['水產', '海鮮', '魚', '蝦', '蛤'], steps: SEAFOOD_TEMPLATE },
  { keywords: ['加工', '冷凍'], steps: PROCESSED_TEMPLATE },
  { keywords: ['根莖', '瓜果'], steps: ROOT_GOURD_TEMPLATE },
  { keywords: ['肉', '雞', '豬', '牛', '鴨'], steps: MEAT_TEMPLATE },
  { keywords: ['乾貨', '調味', '米', '麵'], steps: DRY_GOODS_TEMPLATE },
  { keywords: ['飲'], steps: BEVERAGE_TEMPLATE },
  { keywords: ['葉', '蔬', '菜'], steps: LEAFY_TEMPLATE },
];

const PROCESS_STEP_LABELS: Partial<Record<ProcessType, string>> = {
  wash: '清洗',
  peel: '削皮',
  cut: '切割',
  marinate: '醃製',
  blanch: '汆燙',
  preCook: '預熟',
  cool: '冷卻',
  portion: '分裝',
  cook: '烹調',
  hold: '保溫',
  clean: '清潔',
};

const CUT_LABELS: Partial<Record<CutType, string>> = {
  julienne: '切絲',
  slice: '切片',
  dice: '切丁',
  chunk: '切塊',
  rollCut: '滾刀塊',
  mince: '切末',
  section: '切段',
  diagonal: '斜切',
  shred: '刨絲',
};

function matchTemplate(category: string | undefined): { steps: TaskDraftTemplateStep[]; matched: boolean } {
  const cat = category ?? '';
  for (const { keywords, steps } of TEMPLATE_MATCHERS) {
    if (keywords.some((k) => cat.includes(k))) return { steps, matched: true };
  }
  return { steps: FALLBACK_TEMPLATE, matched: false };
}

function stepTaskName(ingredientName: string, step: TaskDraftTemplateStep): string {
  if (step.label) return `${ingredientName}：${step.label}`;
  const label = PROCESS_STEP_LABELS[step.processType] ?? step.processType;
  if (step.cutType && step.cutType !== 'none') {
    const cutLabel = CUT_LABELS[step.cutType] ?? step.cutType;
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

    // Feature 100: 配方指定的切法覆蓋類別範本的 cut 步驟（同食材跨菜若切法不同，
    // 無法一次分切，維持範本預設並提示人工分切）。
    const specifiedCuts = Array.from(
      new Set(
        (item.recipeContributions ?? [])
          .map((c) => c.cutType)
          .filter((c): c is CutType => !!c && c !== 'none'),
      ),
    );
    const cutOverride = specifiedCuts.length === 1 ? specifiedCuts[0] : undefined;
    if (specifiedCuts.length > 1) {
      notes.push(
        `「${item.ingredientNameSnapshot}」跨菜有不同指定切法（${specifiedCuts
          .map((c) => CUT_LABELS[c] ?? c)
          .join('、')}），維持類別預設，請人工分切。`,
      );
    }

    let prevStepId: string | undefined;
    let lastStepId: string | undefined;

    for (const rawStep of steps) {
      const step =
        cutOverride && rawStep.processType === 'cut' && rawStep.cutType !== cutOverride
          ? {
              ...rawStep,
              cutType: cutOverride,
              label: undefined,
              guidance: `依配方指定切法：${CUT_LABELS[cutOverride] ?? cutOverride}（覆蓋類別預設）`,
            }
          : rawStep;
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
        notes: step.guidance ?? '自動產生草稿，請人工確認',
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

    // Feature 051: 開火前的風味組合預調——一張全場共用的任務。
    seq += 1;
    tasks.push({
      id: nextId(),
      taskStatus: 'active',
      taskName: '調味汁預混與芡水調配',
      processType: 'portion',
      equipmentType: 'prepTable',
      estimatedMinutes: Math.max(10, 5 + 2 * recipeIds.length),
      staffRole: '廚師',
      staffCount: 1,
      sequence: seq,
      dependsOnTaskIds: [],
      canRunInParallel: true,
      notes: '碗汁：醬油/糖/醋/高湯/太白粉依菜式比例預混，出菜風味一致並縮短收汁；太白粉水（芡水）預調備用，使用前攪拌',
    });
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
