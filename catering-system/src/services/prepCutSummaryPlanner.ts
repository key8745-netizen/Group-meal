/**
 * prepCutSummaryPlanner — Feature 103: 今日備料「刀工彙總 / 前處理提醒」（純函式）。
 *
 * 承接 Feature 100/101/102：把一張備料快照（PrepPlan）裡的食材，依「解析後的切法」
 * 跨菜歸類，讓備料人員一次批切同種刀工（切絲的一起切、滾刀的一起切），不用在各菜
 * 之間跳。同時彙整各食材的前處理備註（去蒂頭/去皮…）供開工前一次看齊。
 *
 * 切法解析優先序與 workflowTaskDraftService 一致（單一真相規則）：
 *   配方指定（單一）> 食材預設（defaultCutType）> 未指定。
 * 同食材跨菜指定了不同切法（衝突）→ 歸到「未指定」（無法一次批切，需現場分切）。
 *
 * 純函式、僅 type-import，可用 tsx 直接單測。
 */

import type { CutType, IngredientMaster, PrepPlan } from './types';

/** 切法顯示標籤（含 none）。 */
export const CUT_TYPE_LABELS: Record<CutType, string> = {
  none: '不切',
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

/** 彙總時「已知切法」的排序（未指定永遠排最後）。 */
const CUT_ORDER: CutType[] = ['section', 'julienne', 'shred', 'slice', 'dice', 'chunk', 'rollCut', 'mince', 'diagonal', 'none'];

export interface CutGroupItem {
  ingredientId: string;
  name: string;
  totalBaseQuantity: number;
  baseUnit: string;
}

export interface CutGroup {
  /** null = 未指定（依範本/現場，含跨菜切法衝突者）。 */
  cutType: CutType | null;
  label: string;
  items: CutGroupItem[];
}

export interface PrepNoteItem {
  ingredientId: string;
  name: string;
  note: string;
}

export interface PrepCutSummary {
  groups: CutGroup[];
  prepNotes: PrepNoteItem[];
}

/**
 * 解析單一食材的切法：配方指定（去重後唯一）> 食材預設 > null（未指定）。
 * 配方指定了多種不同切法（衝突）→ null（無法一次批切）。
 */
export function resolveItemCut(specifiedCuts: (CutType | undefined)[], ingredientDefault?: CutType): CutType | null {
  const distinct = Array.from(new Set(specifiedCuts.filter((c): c is CutType => !!c && c !== 'none')));
  if (distinct.length === 1) return distinct[0];
  if (distinct.length > 1) return null; // 跨菜切法衝突 → 未指定
  return ingredientDefault && ingredientDefault !== 'none' ? ingredientDefault : null;
}

/** 依解析後切法把備料項目分組，並彙整前處理備註。 */
export function summarizePrepCuts(
  prepPlan: Pick<PrepPlan, 'prepItems'>,
  ingredientsById: Map<string, Pick<IngredientMaster, 'defaultCutType' | 'prepNote'>> = new Map(),
): PrepCutSummary {
  const byCut = new Map<CutType | null, CutGroupItem[]>();
  const prepNotes: PrepNoteItem[] = [];

  for (const item of prepPlan.prepItems ?? []) {
    const specifiedCuts = (item.recipeContributions ?? []).map((c) => c.cutType);
    const ing = ingredientsById.get(item.ingredientId);
    const cut = resolveItemCut(specifiedCuts, ing?.defaultCutType);

    const list = byCut.get(cut) ?? [];
    list.push({
      ingredientId: item.ingredientId,
      name: item.ingredientNameSnapshot,
      totalBaseQuantity: item.requiredBaseQuantity,
      baseUnit: item.baseUnit,
    });
    byCut.set(cut, list);

    const note = ing?.prepNote?.trim();
    if (note) prepNotes.push({ ingredientId: item.ingredientId, name: item.ingredientNameSnapshot, note });
  }

  const rank = (c: CutType | null): number => (c === null ? CUT_ORDER.length : CUT_ORDER.indexOf(c));
  const groups: CutGroup[] = Array.from(byCut.entries())
    .map(([cutType, items]) => ({
      cutType,
      label: cutType === null ? '未指定（依範本／現場）' : CUT_TYPE_LABELS[cutType],
      items: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')),
    }))
    .sort((a, b) => rank(a.cutType) - rank(b.cutType));

  prepNotes.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

  return { groups, prepNotes };
}
