/**
 * dishCategorySeedPlanner — Feature 091: 依菜名自動猜「菜色類別」種子（純函式）。
 *
 * 替尚未分類的配方，依名稱關鍵字推測 DishCategory（主菜/主食/蔬菜/湯），讓菜單
 * 平衡檢查(089)與一鍵均衡菜單(090)立刻有資料可用。沿用 backfill 安全原則：
 * merge-only（已分類不動）、不臆測（對不上關鍵字就 noMatch，不亂給）。
 * 規則第一個命中者勝，順序刻意為 湯 > 主食 > 主菜 > 蔬菜，處理重疊
 * （如「滷肉飯」= 主食、「冬瓜湯」= 湯、「三杯雞」= 主菜）。「其他」不自動指派。
 * 純函式、僅 type-import，可單測。
 */

import type { DishCategory } from '@/services/types';

export interface DishCategoryRule {
  keywords: string[];
  category: DishCategory;
}

/** 第一個命中者勝；順序處理重疊：湯 > 主食 > 主菜 > 蔬菜。 */
export const DISH_CATEGORY_RULES: DishCategoryRule[] = [
  { keywords: ['湯', '羹', '火鍋', '鍋物'], category: '湯' },
  { keywords: ['飯', '麵', '米粉', '冬粉', '河粉', '粥', '炒飯', '炒麵', '燴飯', '油飯', '米糕'], category: '主食' },
  {
    keywords: ['雞', '豬', '牛', '鴨', '魚', '蝦', '排骨', '里肌', '五花', '絞肉', '滷', '紅燒', '三杯', '糖醋', '宮保', '咖哩', '蒜泥', '椒麻', '獅子頭', '肉'],
    category: '主菜',
  },
  {
    keywords: ['高麗菜', '空心菜', '地瓜葉', '菠菜', '青江菜', '花椰菜', '青菜', '時蔬', 'A菜', '大陸妹', '豆芽', '絲瓜', '苦瓜', '冬瓜', '南瓜', '茄子', '四季豆', '青椒', '竹筍', '筊白筍', '香菇', '金針菇', '娃娃菜', '小白菜', '油菜', '芥藍', '龍鬚菜', '秋葵', '玉米筍', '青花菜', '莧菜', '番茄', '洋蔥', '木耳'],
    category: '蔬菜',
  },
];

export type DishCategorySeedAction = 'willSet' | 'alreadySet' | 'noMatch';

export interface DishCategorySeedRecipe {
  id: string;
  name: string;
  category?: DishCategory;
}

export interface DishCategorySeedResult {
  id: string;
  name: string;
  action: DishCategorySeedAction;
  category?: DishCategory;
}

/** 依菜名猜類別；無命中回 null。 */
export function guessDishCategory(name: string): DishCategory | null {
  const n = (name ?? '').trim();
  if (n.length < 1) return null;
  for (const rule of DISH_CATEGORY_RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.category;
  }
  return null;
}

/** 單一配方的種子動作（merge-only、不臆測）。 */
export function planDishCategorySeed(recipe: DishCategorySeedRecipe): DishCategorySeedResult {
  if (recipe.category) {
    return { id: recipe.id, name: recipe.name, action: 'alreadySet', category: recipe.category };
  }
  const guess = guessDishCategory(recipe.name);
  if (!guess) return { id: recipe.id, name: recipe.name, action: 'noMatch' };
  return { id: recipe.id, name: recipe.name, action: 'willSet', category: guess };
}

/** 批次規劃。 */
export function planDishCategorySeedBatch(recipes: DishCategorySeedRecipe[]): DishCategorySeedResult[] {
  return (recipes ?? []).map(planDishCategorySeed);
}
