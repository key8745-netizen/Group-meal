export interface InitialIngredient {
  id:            string;
  name:          string;
  /** Starting stock in kg — seeded as 0, to be updated after physical count */
  currentStockKg: number;
  /** Purchase cost per kg — seeded as 0, to be filled in by staff */
  unitCostPerKg:  number;
  /** Fraction lost during prep (0 = no waste, 0.3 = 30% trim loss) */
  wasteFactor:    number;
}

/**
 * The 10 core ingredients for a typical Taiwanese group-meal (團膳) kitchen.
 * wasteFactor values are set per food type:
 *   Grains / liquids    → 0      (essentially no prep loss)
 *   Proteins            → 0.05–0.10 (bone-in trim, cleaning)
 *   Root vegetables     → 0.10–0.15 (peeling)
 *   Leafy vegetables    → 0.25–0.30 (outer leaves, stems)
 */
export const INITIAL_INGREDIENTS: InitialIngredient[] = [
  { id: 'white-rice',   name: '白米',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0    },
  { id: 'pork',         name: '豬肉',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1  },
  { id: 'chicken',      name: '雞肉',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1  },
  { id: 'cabbage',      name: '高麗菜', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.25 },
  { id: 'leafy-greens', name: '葉菜類', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.3  },
  { id: 'tofu',         name: '豆腐',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.05 },
  { id: 'onion',        name: '洋蔥',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.15 },
  { id: 'carrot',       name: '紅蘿蔔', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1  },
  { id: 'oil',          name: '油',     currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0    },
  { id: 'soy-sauce',    name: '醬油',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0    },
];
