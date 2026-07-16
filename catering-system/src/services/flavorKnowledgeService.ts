/**
 * flavorKnowledgeService — Feature 074: 把食材名對應到風味/技法知識庫（純函式）。
 *
 * 使用者的食材主檔用自己的名稱（「九層塔」「豬五花」），知識庫用可能不同的
 * 名稱（「羅勒」「豬五花／帶骨豬」）。此比對器以「別名包含」比對，並在兩個
 * 知識庫之間用共同 id 互補（配對到技法就一併帶出同 id 的搭配，反之亦然）。
 * 純函式、僅 type-import，可單測。
 */

import { FLAVOR_PAIRINGS, FLAVOR_PAIRING_BY_ID, type FlavorPairing } from '@/constants/flavorPairings';
import { INGREDIENT_TECHNIQUES, INGREDIENT_TECHNIQUE_BY_ID, type IngredientTechnique } from '@/constants/ingredientTechniques';

export interface FlavorKnowledge {
  /** 命中的知識庫名稱（供顯示「對應：X」）；無命中為 null。 */
  matchedName: string | null;
  pairing: FlavorPairing | null;
  technique: IngredientTechnique | null;
}

/** 把知識庫名稱拆成別名 tokens（分隔：／ / 、（）()），過濾長度 < 2 者。 */
function aliasesOf(name: string, nameEn?: string): string[] {
  const parts = name
    .split(/[／/、（）()]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (nameEn && nameEn.trim().length >= 2) parts.push(nameEn.trim().toLowerCase());
  return parts;
}

/**
 * query 命中某別名的最佳分數（0 = 未命中）。優先序：
 *  完全相同 > 別名完整包含於食材名（越長越精準）> 食材名包含於較長別名（越接近越好）。
 * 這確保「香菇」命中「香菇」（新鮮）而非「乾香菇」。
 */
function matchScore(query: string, aliases: string[]): number {
  let best = 0;
  for (const a of aliases) {
    if (a.length < 2) continue;
    let s = 0;
    if (a === query) s = 1000;
    else if (query.includes(a)) s = 100 + a.length;
    else if (a.includes(query)) s = 50 - (a.length - query.length);
    if (s > best) best = s;
  }
  return best;
}

function bestMatch<T extends { name: string; nameEn?: string }>(
  query: string,
  list: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const item of list) {
    const score = matchScore(query, aliasesOf(item.name, item.nameEn));
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * 依食材名找出風味搭配與料理技法。先各自以名稱比對，再用共同 id 互補：
 * 只配到其中一邊時，若另一邊有相同 id 的條目也一併帶出。
 */
export function matchFlavorKnowledge(ingredientName: string): FlavorKnowledge {
  const query = (ingredientName ?? '').trim();
  if (query.length < 1) return { matchedName: null, pairing: null, technique: null };

  let pairing = bestMatch(query, FLAVOR_PAIRINGS);
  let technique = bestMatch(query, INGREDIENT_TECHNIQUES);

  // 以共同 id 互補
  if (pairing && !technique) technique = INGREDIENT_TECHNIQUE_BY_ID.get(pairing.id) ?? null;
  if (technique && !pairing) pairing = FLAVOR_PAIRING_BY_ID.get(technique.id) ?? null;

  const matchedName = pairing?.name ?? technique?.name ?? null;
  return { matchedName, pairing, technique };
}
