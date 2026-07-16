/**
 * recipeFlavorAdvisor — Feature 075: 依「整份配方的食材集合」給風味/技法建議（純函式）。
 *
 * 單一食材的知識查詢由 flavorKnowledgeService 負責；本模組把配方裡「多個食材」
 * 的知識聚合起來，產出兩類對廚房有用的輸出：
 *   1) techniques：配方中各食材的可執行技法提醒（撒鹽時機/火候/解膩/油脂），去重。
 *   2) suggestions：跨食材彙整的「還可以加什麼」搭配建議 —— 把每個食材的 pairsWith
 *      收集起來、扣掉配方裡已經有的，再依「被幾個食材共同推薦」排序（共識越高越前）。
 *
 * 純函式、僅 type-import，可單測。所有輸出皆為參考，不改任何資料。
 */

import { matchFlavorKnowledge } from '@/services/flavorKnowledgeService';

export interface TechniqueTip {
  /** 對應知識庫食材名。 */
  name: string;
  saltTiming?: '提早' | '最後' | '鹽水' | '不適用';
  proteinType?: '軟嫩快煮' | '強韌慢燉' | '脆弱海鮮';
  cookKey?: string;
  acidTip?: string;
  fatTip?: string;
}

export interface PairingSuggestion {
  /** 建議加入的搭配食材名。 */
  name: string;
  /** 被配方中幾個食材共同推薦（共識度）。 */
  count: number;
  /** 由哪些配方食材推薦而來（供顯示理由）。 */
  from: string[];
}

export interface RecipeFlavorAdvice {
  techniques: TechniqueTip[];
  suggestions: PairingSuggestion[];
}

/** 兩個名稱是否指同一食材（雙向子字串，長度 >= 2 才算，避免單字誤判）。 */
function sameIngredient(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x.length < 1 || y.length < 1) return false;
  if (x === y) return true;
  if (x.length >= 2 && y.includes(x)) return true;
  if (y.length >= 2 && x.includes(y)) return true;
  return false;
}

function techniqueHasContent(t: TechniqueTip): boolean {
  return !!(t.saltTiming || t.proteinType || t.cookKey || t.acidTip || t.fatTip);
}

/**
 * 聚合整份配方的風味/技法建議。
 * @param ingredientNames 配方目前的食材名稱清單（使用者主檔名，可有重複/空白）。
 * @param maxSuggestions  搭配建議上限（預設 12）。
 */
export function adviseRecipeFlavors(
  ingredientNames: string[],
  maxSuggestions = 12,
): RecipeFlavorAdvice {
  const names = (ingredientNames ?? []).map((n) => (n ?? '').trim()).filter((n) => n.length >= 1);

  const techniqueById = new Map<string, TechniqueTip>();
  // 建議食材名 → { count, from:Set }
  const suggMap = new Map<string, { count: number; from: Set<string> }>();

  for (const name of names) {
    const k = matchFlavorKnowledge(name);

    if (k.technique) {
      const t = k.technique;
      if (!techniqueById.has(t.id)) {
        const tip: TechniqueTip = {
          name: k.matchedName ?? t.name,
          saltTiming: t.saltTiming,
          proteinType: t.proteinType,
          cookKey: t.cookKey,
          acidTip: t.acidTip,
          fatTip: t.fatTip,
        };
        if (techniqueHasContent(tip)) techniqueById.set(t.id, tip);
      }
    }

    if (k.pairing) {
      for (const p of k.pairing.pairsWith) {
        const cand = p.trim();
        if (cand.length < 1) continue;
        // 扣掉配方裡已經有的食材（含此食材自身命中名）
        const already =
          names.some((n) => sameIngredient(n, cand)) ||
          (k.matchedName != null && sameIngredient(k.matchedName, cand));
        if (already) continue;

        const entry = suggMap.get(cand) ?? { count: 0, from: new Set<string>() };
        // 同一來源食材對同一建議只算一次
        if (!entry.from.has(name)) {
          entry.count += 1;
          entry.from.add(name);
        }
        suggMap.set(cand, entry);
      }
    }
  }

  const suggestions: PairingSuggestion[] = Array.from(suggMap.entries())
    .map(([name, v]) => ({ name, count: v.count, from: Array.from(v.from) }))
    // 共識度高者優先；同分依名稱穩定排序，讓輸出可預測、可測。
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'zh-Hant'))
    .slice(0, Math.max(0, maxSuggestions));

  return { techniques: Array.from(techniqueById.values()), suggestions };
}
