/**
 * preservationYieldSeedPlanner — Feature 082: 加工延壽良率種子計畫（純函式）。
 *
 * 依食材名/類別，替常見食材帶入合理的加工延壽預設良率（processedYieldRatio），
 * 讓使用者不必逐一手填。設計沿用 Feature 030 backfill 的安全原則：
 *   - Merge-only：已設定良率者不動（alreadySet）。
 *   - 不臆測：名稱/類別都對不上的食材一律跳過（noMatch），不亂給值。
 *   - 乾貨（isPerishable === false）不需要良率，直接略過。
 * 良率＝煮熟後產出／原料重量；數值為保守通用值，使用者之後仍可在主檔手動改。
 * 純函式、僅 type-import，可單測。
 */

export interface YieldRule {
  /** 命中任一關鍵字即套用（對食材名做子字串比對）。 */
  keywords: string[];
  ratio: number;
  label: string;
}

/** 類別關鍵字 → 良率的備援規則（名稱未命中時用）。 */
export interface CategoryYieldRule {
  keywords: string[];
  ratio: number;
  label: string;
}

/** 名稱規則：由具體到一般，第一個命中者勝。 */
export const YIELD_RULES: YieldRule[] = [
  { keywords: ['五花', '三層'], ratio: 0.70, label: '豬五花／三層（油脂多、失重大）' },
  { keywords: ['牛腩', '牛肋'], ratio: 0.65, label: '牛腩（久燉失重大）' },
  { keywords: ['梅花'], ratio: 0.72, label: '梅花肉' },
  { keywords: ['絞肉'], ratio: 0.75, label: '絞肉' },
  { keywords: ['雞胸'], ratio: 0.75, label: '雞胸' },
  { keywords: ['雞腿', '棒腿'], ratio: 0.75, label: '雞腿' },
  { keywords: ['里肌', '里脊'], ratio: 0.75, label: '里肌／里脊' },
  { keywords: ['鮭魚', '鯖魚', '鱈魚', '魚排', '魚片'], ratio: 0.80, label: '魚肉' },
  { keywords: ['蝦'], ratio: 0.85, label: '蝦' },
  { keywords: ['豆腐', '豆乾', '豆干'], ratio: 0.95, label: '豆製品（失重小）' },
  { keywords: ['高麗菜', '空心菜', '地瓜葉', '菠菜', '小白菜', '青江菜', 'A菜', '葉菜'], ratio: 0.55, label: '葉菜（炒後大幅縮水）' },
  { keywords: ['菇'], ratio: 0.60, label: '菇類（出水縮水）' },
  { keywords: ['洋蔥'], ratio: 0.70, label: '洋蔥' },
  { keywords: ['馬鈴薯', '紅蘿蔔', '胡蘿蔔', '白蘿蔔', '地瓜', '芋頭', '南瓜'], ratio: 0.90, label: '根莖類（失重小）' },
  { keywords: ['蛋'], ratio: 0.90, label: '蛋' },
];

/** 類別備援：名稱未命中時，依主檔 category 粗略給值。 */
export const CATEGORY_YIELD_RULES: CategoryYieldRule[] = [
  { keywords: ['葉菜'], ratio: 0.55, label: '葉菜類（依類別）' },
  { keywords: ['根莖'], ratio: 0.90, label: '根莖類（依類別）' },
  { keywords: ['海鮮', '水產'], ratio: 0.80, label: '海鮮（依類別）' },
  { keywords: ['肉'], ratio: 0.72, label: '肉類（依類別）' },
];

export type YieldSeedAction = 'willSet' | 'alreadySet' | 'noMatch' | 'skippedNonPerishable';

export interface YieldSeedIngredient {
  id: string;
  name: string;
  category?: string;
  processedYieldRatio?: number;
  isPerishable?: boolean;
}

export interface YieldSeedResult {
  id: string;
  name: string;
  action: YieldSeedAction;
  /** willSet 時要寫入的良率。 */
  ratio?: number;
  /** 命中的規則說明（供報表）。 */
  matchedRule?: string;
}

/** 依名稱（優先）與類別（備援）找出適用良率規則；無命中回 null。 */
export function matchYieldRule(name: string, category?: string): { ratio: number; label: string } | null {
  const n = (name ?? '').trim();
  for (const rule of YIELD_RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return { ratio: rule.ratio, label: rule.label };
  }
  const c = (category ?? '').trim();
  if (c.length > 0) {
    for (const rule of CATEGORY_YIELD_RULES) {
      if (rule.keywords.some((k) => c.includes(k))) return { ratio: rule.ratio, label: rule.label };
    }
  }
  return null;
}

/** 計算單一食材的種子動作（merge-only、不臆測、乾貨略過）。 */
export function planYieldSeed(ing: YieldSeedIngredient): YieldSeedResult {
  if (ing.isPerishable === false) {
    return { id: ing.id, name: ing.name, action: 'skippedNonPerishable' };
  }
  if (typeof ing.processedYieldRatio === 'number' && ing.processedYieldRatio > 0) {
    return { id: ing.id, name: ing.name, action: 'alreadySet', ratio: ing.processedYieldRatio };
  }
  const rule = matchYieldRule(ing.name, ing.category);
  if (!rule) return { id: ing.id, name: ing.name, action: 'noMatch' };
  return { id: ing.id, name: ing.name, action: 'willSet', ratio: rule.ratio, matchedRule: rule.label };
}

/** 批次規劃：對整份食材清單各自計算種子動作。 */
export function planYieldSeedBatch(list: YieldSeedIngredient[]): YieldSeedResult[] {
  return (list ?? []).map(planYieldSeed);
}
