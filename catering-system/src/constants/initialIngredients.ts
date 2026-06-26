import type { IngredientBaseUnit } from '@/services/types';

export interface InitialIngredient {
  id:            string;
  name:          string;
  /** Starting stock in kg — seeded as 0, to be updated after physical count */
  currentStockKg: number;
  /** Purchase cost per kg — seeded as 0, to be filled in by staff */
  unitCostPerKg:  number;
  /** Fraction lost during prep (0 = no waste, 0.3 = 30% trim loss) */
  wasteFactor:    number;
  /** Feature 010 — smallest unit used for stock-level conversion math. */
  baseUnit:       IngredientBaseUnit;
  /** Feature 010 — unit used when placing purchase orders, e.g. "kg", "L". */
  purchaseUnit:   string;
  /** Feature 010 — multiplier to convert 1 purchaseUnit into baseUnit quantity. Must be > 0. */
  conversionFactorToBaseUnit: number;
  /** Feature 010 — default unit price, denominated in defaultPriceUnit. Seeded as 0, to be filled in by staff. */
  defaultPrice:   number;
  /** Feature 010 — unit that defaultPrice is denominated in (here, always purchaseUnit). */
  defaultPriceUnit: string;
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
  { id: 'white-rice',   name: '白米',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'pork',         name: '豬肉',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'chicken',      name: '雞肉',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'cabbage',      name: '高麗菜', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.25,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'leafy-greens', name: '葉菜類', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.3,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'tofu',         name: '豆腐',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.05,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'onion',        name: '洋蔥',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.15,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'carrot',       name: '紅蘿蔔', currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0.1,
    baseUnit: 'g',  purchaseUnit: 'kg', conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'kg' },
  { id: 'oil',          name: '油',     currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0,
    baseUnit: 'ml', purchaseUnit: 'L',  conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'L'  },
  { id: 'soy-sauce',    name: '醬油',   currentStockKg: 0, unitCostPerKg: 0, wasteFactor: 0,
    baseUnit: 'ml', purchaseUnit: 'L',  conversionFactorToBaseUnit: 1000, defaultPrice: 0, defaultPriceUnit: 'L'  },
];
