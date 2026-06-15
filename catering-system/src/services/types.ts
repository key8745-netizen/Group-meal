import { Timestamp } from 'firebase/firestore';
import type { SuggestionConfidence } from './aiSuggestionConfidence';

// ─── BOM & Menu ───────────────────────────────────────────────────────────────

export interface BOMItem {
  ingredientId: string;
  ingredientName: string;
  /** Per-serving quantity in the unit specified below */
  quantity: number;
  unit: 'kg' | 'g' | '台斤' | 'L' | 'piece';
  /** Fraction lost during prep, e.g. 0.1 = 10% trim loss. Must be < 1. */
  wasteFactor: number;
}

export interface Menu {
  id: string;
  name: string;
  category: string;
  servingSize: number;
  unitPrice: number;
  nutrition?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  ingredients: BOMItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /**
   * true when this menu was imported via OCR rather than entered manually.
   * verified must be true before OCR-sourced menus enter AIContextSnapshot.
   */
  isOcr?: boolean;
  /** true only after a human has reviewed and confirmed an OCR-imported menu */
  verified?: boolean;
}

// ─── Order ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in-production'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  menuId: string;
  menuName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialRequests?: string;
}

export interface Order {
  id?: string;
  orderDate: Timestamp;
  deliveryDate: Timestamp;
  clientId: string;
  clientName: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ─── Ingredient & Inventory ───────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  category: string;
  minStockLevel: number;
  supplierIds: string[];
  /** Fraction lost during prep, e.g. 0.1 = 10% trim loss. Stored at ingredient level. */
  wasteFactor?: number;
  /** true when this ingredient record originated from OCR import */
  isOcr?: boolean;
  /** true only after human verification of an OCR-sourced ingredient */
  verified?: boolean;

  // ─── Ingredient Master Data (Feature 010) ───────────────────────────────────
  /** Lowercased, whitespace-collapsed form of `name` — used for de-duplication/search. Never trust client input; always derived server-side via normalizeIngredientName(). */
  normalizedName?: string;
  /** Smallest unit used for purchasing/inventory math in this feature. */
  baseUnit?: 'g' | 'ml' | 'pcs';
  /** Human-readable purchase unit, e.g. "箱", "包" — for display only. */
  purchaseUnit?: string;
  /** Multiplier to convert one `purchaseUnit` into `baseUnit`. Must be > 0. */
  conversionFactorToBaseUnit?: number;
  /** Default unit price used when generating purchase suggestions. */
  defaultPrice?: number;
  /** Unit that `defaultPrice` is denominated in (baseUnit or purchaseUnit). */
  defaultPriceUnit?: string;
  /** Linked supplier doc ID, or null/absent when unassigned. */
  supplierId?: string | null;
  /** Whether this ingredient is active and selectable in new BOMs/orders. Defaults to true. */
  isActive?: boolean;
  /** Free-form notes for purchasing staff. */
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
}

// ─── Ingredient Master Data (Feature 010) ─────────────────────────────────────

/** Base measurement unit for master-data conversion. */
export type IngredientBaseUnit = 'g' | 'ml' | 'pcs';

/**
 * Master-data fields for `/ingredients/{ingredientId}`, managed via the
 * 食材主檔管理 (Ingredient Master Data) feature. This is the SAME document
 * as `Ingredient` above — these fields are additive/optional so existing
 * BOM/recipe/inventory flows reading `Ingredient` continue to work.
 */
export interface IngredientMaster {
  id: string;
  name: string;
  /** Lowercased, whitespace-collapsed form of `name`, computed server-side. */
  normalizedName: string;
  category: string;
  /** Smallest unit used for stock-level conversion math. */
  baseUnit: IngredientBaseUnit;
  /** Unit used when placing purchase orders, e.g. "箱", "包", "kg". */
  purchaseUnit: string;
  /** Multiplier to convert 1 purchaseUnit into baseUnit quantity. Must be > 0. */
  conversionFactorToBaseUnit: number;
  /** Default unit price, denominated in `defaultPriceUnit`. */
  defaultPrice: number;
  /** Unit that `defaultPrice` is denominated in (e.g. purchaseUnit or baseUnit). */
  defaultPriceUnit: string;
  /** Linked supplier doc ID, or null/undefined when unassigned. */
  supplierId?: string | null;
  /** Whether this ingredient is active and selectable in new BOMs/orders. */
  isActive: boolean;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
}

// ─── Recipes (Feature 011: 配方引用食材主檔) ──────────────────────────────────

/** A single ingredient line within a Recipe, referencing /ingredients/{ingredientId}. */
export interface RecipeIngredientItem {
  ingredientId: string;
  /** Snapshot of the ingredient's name at the time of save (for display/history). */
  ingredientNameSnapshot: string;
  /** Quantity in the unit chosen by the user (baseUnit or purchaseUnit of the ingredient). */
  quantity: number;
  unit: string;
  /** Quantity converted into the ingredient's baseUnit. */
  baseQuantity: number;
  baseUnit: IngredientBaseUnit;
  notes?: string;
}

/** A recipe stored at /recipes/{recipeId}, referencing ingredient master data. */
export interface Recipe {
  id: string;
  name: string;
  recipeIngredients: RecipeIngredientItem[];
  isActive: boolean;
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy: string;
  updatedBy: string;
}

// ─── Recipe Menus (Feature 012: 菜單引用配方) ─────────────────────────────────

/** A single recipe line within a RecipeMenu, referencing /recipes/{recipeId}. */
export interface RecipeMenuItem {
  recipeId: string;
  /** Snapshot of the recipe's name at the time of save (for display/history). */
  recipeNameSnapshot: string;
  /** Number of servings for this recipe in the menu. Must be > 0. */
  servings: number;
  notes?: string;
}

/** A recipe menu stored at /recipeMenus/{menuId}, referencing /recipes. */
export interface RecipeMenu {
  id: string;
  name: string;
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  mealType: string;
  menuRecipes: RecipeMenuItem[];
  isActive: boolean;
  notes?: string;
  createdAt?: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy: string;
}

// ─── Prep Plans (Feature 013: 備料規劃引用菜單配方) ────────────────────────────

/** A single recipe's contribution to a PrepPlanItem's required quantity. */
export interface PrepPlanRecipeContribution {
  recipeId: string;
  /** Snapshot of the recipe's name at the time of save (for display/history). */
  recipeNameSnapshot: string;
  /** servings from the source recipe menu's menuRecipes item. */
  sourceServings: number;
  /** recipeIngredient.baseQuantity * sourceServings. */
  contributedBaseQuantity: number;
}

/** An aggregated ingredient requirement within a PrepPlan. */
export interface PrepPlanItem {
  ingredientId: string;
  /** Snapshot of the ingredient's name (from the source recipe's RecipeIngredientItem). */
  ingredientNameSnapshot: string;
  /** Sum of contributedBaseQuantity across recipeContributions. */
  requiredBaseQuantity: number;
  baseUnit: IngredientBaseUnit;
  recipeContributions: PrepPlanRecipeContribution[];
  notes?: string;
}

/** A prep plan stored at /prepPlans/{prepPlanId}, derived from a /recipeMenus document. */
export interface PrepPlan {
  id: string;
  name: string;
  sourceRecipeMenuId: string;
  /** Snapshot of the source recipe menu's name at the time of creation. */
  sourceRecipeMenuNameSnapshot: string;
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  prepItems: PrepPlanItem[];
  isActive: boolean;
  notes?: string;
  createdAt?: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy: string;
}

// ─── Purchase Demand Drafts (Feature 014: 採購需求草稿) ────────────────────────

export interface PrepPlanTraceability {
  prepPlanId: string;
  prepPlanNameSnapshot: string;
}

export interface PurchaseDemandDraftItem {
  ingredientId: string;
  ingredientNameSnapshot: string;
  demandQuantity: number;
  baseUnit: IngredientBaseUnit;
  sourceRequiredBaseQuantity: number;
  prepPlanTraceability: PrepPlanTraceability;
  notes?: string;
}

export type PurchaseDemandDraftStatus = 'draft' | 'archived';

export interface PurchaseDemandDraft {
  id: string;
  draftName: string;
  sourcePrepPlanId: string;
  sourcePrepPlanNameSnapshot: string;
  status: PurchaseDemandDraftStatus;
  items: PurchaseDemandDraftItem[];
  isActive: boolean;
  notes?: string;
  createdAt?: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy: string;
}

export interface InventoryDoc {
  ingredientId: string;
  ingredientName: string;
  /** Always stored in kg */
  currentStock: number;
  unit: string;
  lastUpdated: Timestamp;
}

export type TransactionType = 'restock' | 'deduct' | 'adjustment';

export interface InventoryTransaction {
  type: TransactionType;
  /** Negative value for deduct */
  quantity: number;
  referenceId: string;
  reason: string;
  performedBy: string;
  timestamp: Timestamp;
}

// ─── Meal Plan ────────────────────────────────────────────────────────────────

/** Daily meal plan — which dishes are served on a given date */
export interface MealPlan {
  /** ISO date string "YYYY-MM-DD" — also used as the Firestore document ID */
  date:       string;
  headCount:  number;
  /** IDs from the menus collection */
  menuIds:    string[];
  notes?:     string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ─── Requirement map value ────────────────────────────────────────────────────

export interface RequirementItem {
  ingredientId: string;
  ingredientName: string;
  /** Total quantity needed, always in kg */
  totalQuantityKg: number;
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export type PurchaseStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseLineItem {
  ingredientId: string;
  ingredientName: string;
  /** Snapshot of inventory.currentStock at suggestion time, in kg */
  currentStockKg: number;
  /** ingredient.minStockLevel converted to kg */
  safetyLevelKg: number;
  /** Demand from pending orders (BOM expansion), in kg */
  orderDemandKg: number;
  /** max(0, safetyLevel + orderDemand − currentStock), in kg */
  suggestedQtyKg: number;
  unitCost: number;
  estimatedCost: number;
  /** First entry of ingredient.supplierIds, null when unset */
  primarySupplierId: string | null;
  supplierIds: string[];
  /** AI confidence evaluation — present when generated by generatePurchaseSuggestion */
  confidence?: SuggestionConfidence;
}

export interface SupplierGroup {
  /** supplier doc ID, or 'unassigned' when no supplier is linked */
  supplierId: string;
  items: PurchaseLineItem[];
  subtotalCost: number;
}

/** In-memory draft before persistence — status is always 'draft' */
export interface PurchaseDraft {
  status: 'draft';
  relatedOrderIds: string[];
  generatedAt: Timestamp;
  items: PurchaseLineItem[];
  supplierGroups: SupplierGroup[];
  totalEstimatedCost: number;
  /** Optimistic-lock version copied from Firestore when re-loading an existing doc. */
  version?: number;
}

/** Persisted purchases/{id} document */
export interface Purchase extends Omit<PurchaseDraft, 'status'> {
  id?: string;
  status: PurchaseStatus;
  /** Monotonically increasing counter used for optimistic locking. */
  version: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  orderedAt?: Timestamp;
  receivedAt?: Timestamp;
}
