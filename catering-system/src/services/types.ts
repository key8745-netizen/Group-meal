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
  /** Feature 032: crop name used to match this ingredient against the MOA AMIS wholesale market price API, or null/undefined when unassigned. */
  marketCropName?: string | null;
  /** Feature 057: 安全庫存（kg）；0 或未設定 = 不追蹤低庫存警示。 */
  minStockLevel?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;

  // Feature 071: 保鮮參數（選填；見 IngredientFreshnessParams）。
  isPerishable?: boolean;
  defaultStorageType?: StorageType;
  shelfLifeDaysChilled?: number;
  shelfLifeDaysFrozen?: number;
  shelfLifeDaysAmbient?: number;
  warnThresholdDays?: number;
  criticalThresholdDays?: number;
  openedShelfLifeHours?: number;
  /** Feature 079: 加工延壽預設良率（產出kg = 耗用kg × 此係數，如 0.75）；可逐次覆蓋。 */
  processedYieldRatio?: number;
  /**
   * Feature 101: 此食材的預設切法（如馬鈴薯預設切塊）。製程任務刀工的回落來源——
   * 優先序：配方指定（RecipeIngredientItem.cutType）> 食材預設 > 類別範本。選填。
   */
  defaultCutType?: CutType;
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
  /**
   * Feature 100: 這道菜此食材的刀工切法（切絲/滾刀塊…）。跟著配方走（同食材、
   * 不同菜可不同切法）；驅動製程任務草稿的 cut 步驟，未設 = 沿用類別範本預設。
   */
  cutType?: CutType;
}

/** A recipe stored at /recipes/{recipeId}, referencing ingredient master data. */
/** Feature 089: 菜色類別，供菜單平衡檢查（主菜/主食/蔬菜/湯/其他）。 */
export type DishCategory = '主菜' | '主食' | '蔬菜' | '湯' | '其他';

export interface Recipe {
  id: string;
  name: string;
  recipeIngredients: RecipeIngredientItem[];
  isActive: boolean;
  notes?: string;
  /** Feature 089: 菜色類別（選填；未設 = 未分類）。 */
  category?: DishCategory;
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
  /** Feature 028: traceability back to the source /menuImportBatches/{batchId}/items/{itemId} this line was finalized from. */
  sourceMenuImportItemId?: string;
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
  // ── Feature 022: present only when this menu was created via manual
  // approval/conversion of a menuDraft. Absent on normal Feature 012 menus.
  sourceMenuDraftId?: string;
  sourceMenuDraftSnapshot?: RecipeMenuSourceDraftSnapshot;
  manualApprovalAcknowledgement?: boolean;
  // ── Feature 028: present only when this menu was created via batch
  // finalization of a menuImportBatch. Absent on normal Feature 012 menus.
  sourceMenuImportBatchId?: string;
  sourceMenuImportBatchSnapshot?: RecipeMenuSourceImportBatchSnapshot;
}

export interface RecipeMenuSourceImportBatchSnapshot {
  organizationName: string;
  yearMonth: string;
  mealProgram: string;
  sourceFileName: string;
}

// ── Feature 022: Draft Menu Approval to RecipeMenu ───────────────────────────

export interface RecipeMenuSourceDraftSnapshot {
  menuName: string;
  sourceRecommendationId: string;
  sourceRecommendationStatusSnapshot: MenuMixRecommendationStatus;
  items: Array<{
    recipeId: string;
    recipeNameSnapshot: string;
    servingCount: number;
    suggestedRatioSnapshot: number;
    primaryProcessTypeSnapshot?: ProcessType;
    primaryEquipmentTypeSnapshot?: EquipmentType;
  }>;
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
  /** Feature 100: 來源配方此食材指定的切法（帶下去覆蓋製程任務的刀工）。 */
  cutType?: CutType;
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
  /** Feature 048: set once when 出餐扣料 has deducted this plan's stock. */
  stockDeductedAt?: Timestamp;
  stockDeductedBy?: string;
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

/** Human-managed procurement workflow marker — independent of `status`/`isActive`. */
export type PurchaseDemandDraftWorkflowStatus =
  | 'draft'
  | 'exported'
  | 'sent'
  | 'completed'
  | 'cancelled';

export interface PurchaseDemandDraft {
  id: string;
  draftName: string;
  sourcePrepPlanId: string;
  sourcePrepPlanNameSnapshot: string;
  status: PurchaseDemandDraftStatus;
  items: PurchaseDemandDraftItem[];
  isActive: boolean;
  workflowStatus?: PurchaseDemandDraftWorkflowStatus;
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

// ─── Feature 071: 食材保鮮與生命週期（Shelf-life & Freshness）──────────────────

/** 儲存環境。決定同一食材不同批次的保存天數基準。 */
export type StorageType = 'ambient' | 'chilled' | 'frozen';

/**
 * 批次保鮮狀態（衰退狀態機；由保鮮引擎推導，非權威寫入值）。
 *  FRESH 極佳 · USE_FIRST 需優先使用 · CRITICAL 臨界腐敗（或撐不過下一個開膳日）
 *  · EXPIRED 已過期 · DEPLETED 已用罄。
 */
export type FreshnessState = 'FRESH' | 'USE_FIRST' | 'CRITICAL' | 'EXPIRED' | 'DEPLETED';

/**
 * 食材主檔的保鮮參數（將以選填欄位掛在 IngredientMaster 上；未填給保守預設）。
 * 全部選填以維持向後相容——舊食材不填即視為以 defaultStorageType 的天數計算。
 */
export interface IngredientFreshnessParams {
  /** 乾貨／罐頭 = false，跳過保鮮運算（永遠 FRESH）。預設 true。 */
  isPerishable?: boolean;
  /** 預設儲存環境。 */
  defaultStorageType?: StorageType;
  /** 各環境保存天數（至少填預設環境那一欄）。 */
  shelfLifeDaysChilled?: number;
  shelfLifeDaysFrozen?: number;
  shelfLifeDaysAmbient?: number;
  /** 剩餘 ≤ 此天數 → USE_FIRST。 */
  warnThresholdDays?: number;
  /** 剩餘 ≤ 此天數 → CRITICAL。 */
  criticalThresholdDays?: number;
  /** 開封後可用時數（選填）。 */
  openedShelfLifeHours?: number;
  /** Feature 079: 加工延壽預設良率（產出kg = 耗用kg × 此係數）。 */
  processedYieldRatio?: number;
}

/**
 * 進貨批次，儲存於 inventory/{ingredientId}/batches/{batchId}。
 * batchId 建議格式 "YYYYMMDD-NN"（人類可讀，如 "20260716-01"）。
 * 所有日期為本地 ISO "YYYY-MM-DD"；數量單位一律 kg。
 */
export interface InventoryBatch {
  id: string;
  ingredientId: string;
  storageType: StorageType;
  /** 入庫日 ISO。 */
  receivedDate: string;
  /** 效期 ISO（預設 = 入庫日 + 該環境保存天數；可被 manualExpiryOverride 覆寫）。 */
  expirationDate: string;
  qtyReceivedKg: number;
  qtyRemainingKg: number;
  /** 人工手動覆寫效期（保留稽核，不覆蓋計算來源）。 */
  manualExpiryOverride?: string | null;
  /** 開封時間 ISO datetime（選填）。 */
  openedAt?: string | null;
  /** 若此批為「加工產出的新品項」，指向來源批次（跨品項溯源）。 */
  sourceBatchId?: string | null;
  /** 來源快照（人可讀）：原料品項名＋加工日＋耗用原料量。 */
  sourceNote?: string | null;
  /** Feature 079: 加工延壽標籤（如「煮熟冷藏」），標示此批為加工延壽產出。 */
  processedLabel?: string | null;
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

// ── Feature 018: Kitchen Production Workflow Planning ─────────────────────────

export type ProcessType =
  | 'wash' | 'peel' | 'cut' | 'marinate' | 'blanch' | 'preCook'
  | 'cool' | 'portion' | 'cook' | 'hold' | 'clean';

export type CutType =
  | 'none' | 'julienne' | 'slice' | 'dice' | 'chunk' | 'rollCut'
  | 'mince' | 'section' | 'diagonal' | 'shred';

export type CookingMethod =
  | 'none' | 'panFry' | 'boil' | 'stirFry' | 'deepFry' | 'braise'
  | 'roast' | 'steam' | 'blanch' | 'mix' | 'holdWarm' | 'chill';

export type EquipmentType =
  | 'sink' | 'cuttingStation' | 'prepTable' | 'wok' | 'stoveBurner'
  | 'stockPot' | 'deepFryer' | 'oven' | 'steamer' | 'holdingCabinet'
  | 'coolingArea' | 'packingTable' | 'refrigerator' | 'none';

export type ProductionWorkflowTaskStatus = 'active' | 'archived';

export type ProductionWorkflowPlanStatus = 'draft' | 'archived';

export interface ProductionWorkflowTask {
  id: string;
  taskStatus: ProductionWorkflowTaskStatus;
  ingredientId?: string;
  ingredientNameSnapshot?: string;
  recipeId?: string;
  recipeNameSnapshot?: string;
  sourcePrepPlanItemId?: string;
  taskName: string;
  processType: ProcessType;
  cutType?: CutType;
  cookingMethod?: CookingMethod;
  equipmentType: EquipmentType;
  estimatedMinutes: number;
  staffRole?: string;
  staffCount: number;
  sequence: number;
  dependsOnTaskIds: string[];
  canRunInParallel: boolean;
  notes?: string;
}

export interface ProductionWorkflowPlan {
  id: string;
  sourcePrepPlanId: string;
  sourcePrepPlanNameSnapshot: string;
  planName: string;
  serviceDate?: string;
  status: ProductionWorkflowPlanStatus;
  isActive: boolean;
  tasks: ProductionWorkflowTask[];
  notes?: string;
  createdAt?: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
  updatedBy: string;
}

// ── Feature 019: Production Capacity Feasibility Check ────────────────────────

export type FeasibilityStatus = 'feasible' | 'risky' | 'notRecommended';
export type CapacityRiskLevel = 'low' | 'medium' | 'high';

export interface AvailableStaffInput {
  role: string;
  count: number;
}

export interface AvailableEquipmentInput {
  type: EquipmentType;
  count: number;
}

export interface CapacityResult {
  feasibilityStatus: FeasibilityStatus;
  riskLevel: CapacityRiskLevel;
  activeTaskCount: number;
  capacityWindowMinutes: number;
  estimatedTotalTaskMinutes: number;
  estimatedCriticalEquipmentMinutes: Record<string, number>;
  equipmentLoadRatios: Record<string, number>;
  staffLoadRatios: Record<string, number>;
  bottleneckEquipmentTypes: EquipmentType[];
  bottleneckStaffRoles: string[];
  lastMinuteTaskCount: number;
  parallelizableTaskCount: number;
  parallelizationRatio: number;
  dependencyEdgeCount: number;
  maxDependencyCountPerTask: number;
  sequenceRiskNotes: string[];
  manualReviewNotes: string[];
}

export interface CapacityFeasibilityCheck {
  id: string;
  sourceProductionWorkflowPlanId: string;
  sourceProductionWorkflowPlanNameSnapshot: string;
  targetServiceDateTime: Timestamp;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
  result: CapacityResult;
  createdAt?: Timestamp;
  createdBy: string;
}

// ── Feature 020: Menu Mix Recommendation ─────────────────────────────────────

export type MenuMixRecommendationStatus = 'feasible' | 'risky' | 'notRecommended';
export type MenuMixRiskLevel = 'low' | 'medium' | 'high';

export interface MenuMixConstraints {
  maxFriedRatio?: number;
  maxBakedRatio?: number;
  maxSameProcessRatio?: number;
  maxSameEquipmentRatio?: number;
  excludedRecipeIds?: string[];
  preferredRecipeIds?: string[];
  // accepted in input but unenforceable in v1 (recipe model has no such fields)
  requiredCategories?: string[];
  vegetarianRequired?: boolean;
  allergenAvoidance?: string[];
}

export interface MenuMixRecommendationItem {
  recipeId: string;
  recipeNameSnapshot: string;
  suggestedServingCount: number;
  suggestedRatio: number;
  primaryProcessType: ProcessType;
  primaryEquipmentType: EquipmentType;
  totalRecipeTaskMinutes: number;
  estimatedLoadContribution: number;
  reasoningNotes: string[];
}

export interface MenuMixRecommendation {
  id: string;
  targetServingCount: number;
  targetServiceDateTime: Timestamp;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  candidateRecipeIds: string[];
  constraints: MenuMixConstraints;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
  recommendedMixItems: MenuMixRecommendationItem[];
  recommendationStatus: MenuMixRecommendationStatus;
  riskLevel: MenuMixRiskLevel;
  estimatedProcessLoadSummary: Record<string, number>;
  estimatedEquipmentLoadRatios: Record<string, number>;
  estimatedStaffLoadRatios: Record<string, number>;
  bottleneckWarnings: string[];
  manualReviewNotes: string[];
  createdAt?: Timestamp;
  createdBy: string;
  // NO updatedAt / NO updatedBy — immutable record
}

// ── Feature 021: Menu Mix Recommendation Approval & Draft Menu Creation ──────

export type MenuDraftStatus =
  | 'draft'
  | 'reviewing'
  | 'approved_reference'
  | 'archived';

export interface DraftMenuItem {
  recipeId: string;
  recipeNameSnapshot: string;
  servingCount: number;
  suggestedRatioSnapshot: number;
  primaryProcessTypeSnapshot?: ProcessType;
  primaryEquipmentTypeSnapshot?: EquipmentType;
  sourceRecommendationItemIndex: number;
}

export interface MenuDraft {
  id: string;
  sourceRecommendationId: string;
  sourceRecommendationCreatedAtSnapshot?: Timestamp;
  sourceRecommendationStatusSnapshot: MenuMixRecommendationStatus;
  menuName: string;
  items: DraftMenuItem[];
  status: MenuDraftStatus;
  notes?: string;
  manualReviewNotesSnapshot: string[];
  createdAt: Timestamp;
  createdBy: string;
  // NO updatedAt / NO updatedBy — v1 is create/read-only
}

// ── Feature 023: Universal Monthly Menu Import Staging ──────────────────────

export type ImportStatus =
  | 'draft'
  | 'mappingApplied'
  | 'parsed'
  | 'reviewing'
  | 'finalized'
  | 'archived';

export type ReviewStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * Feature 023 baseline value is 'unmatched'. Feature 024 adds the remaining
 * lifecycle states (additive — does not change the meaning of 'unmatched').
 * See docs/features/feature-024/SSOT_RECONCILIATION_PACKAGE.md Section 7A.4.
 */
export type MatchStatus = 'unmatched' | 'mapped' | 'pending_review' | 'rejected' | 'unresolved';

/** Feature 024: how a MenuImportItem came to be matched/proposed. */
export type MatchSource = 'alias' | 'exact' | 'fuzzy' | 'manual' | 'none';

/** Feature 024: human-review status for a staging alias/candidate record. */
export type GovernanceReviewStatus = 'pending' | 'confirmed' | 'rejected';

export type DishSlot = 'staple' | 'mainDish' | 'sideDish' | 'soup' | 'snack' | 'fruit' | 'other';

export interface MenuImportBatch {
  id: string;
  sourceFileName: string;
  organizationName: string;
  /** 'YYYY-MM' */
  yearMonth: string;
  mealProgram: string;
  servingBaseline: number;
  columnMappingTemplateId?: string;
  columnMapping: Record<string, string>;
  importStatus: ImportStatus;
  rowCount: number;
  itemCount: number;
  reviewedItemCount: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
  archivedAt?: Timestamp;
  archivedBy?: string;
  notes?: string;
  /** Feature 027: SHA-256 of normalized import content, for duplicate detection. */
  contentFingerprint?: string;
  /** Feature 027: rows skipped during parse (non-fatal, e.g. malformed rows). */
  skippedRowCount?: number;
  /** Feature 027: non-fatal parse warnings (e.g. Feature 026 non-service-day skips). */
  warningCount?: number;
  /** Feature 027: distinct dates with >=1 parsed item. */
  serviceDayCount?: number;
  /** Feature 027: set only if user explicitly confirmed proceeding despite a detected duplicate risk. */
  duplicateOfBatchId?: string;
  duplicateConfirmedAt?: Timestamp;
  duplicateConfirmedBy?: string;
  /** Feature 028: set once all eligible items have been converted into operational /recipeMenus docs. */
  operationalFinalizedAt?: Timestamp;
  operationalFinalizedBy?: string;
}

export interface MenuImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  /** Write-once — no update path exists for this document. */
  rawRowSnapshot: Record<string, string>;
  /** 'YYYY-MM-DD' */
  parsedDate?: string;
  parsedMealType?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface MenuImportItem {
  id: string;
  batchId: string;
  rowId: string;
  rowIndex: number;
  columnKey: string;
  /** Immutable after create. */
  rawDishName: string;
  normalizedDishName: string;
  date: string;
  mealType: string;
  slot: DishSlot;
  reviewStatus: ReviewStatus;
  matchStatus: MatchStatus;
  notes?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  // ── Feature 024 additive matching fields (reference-only; do not trigger
  //    formal recipes/ingredients/recipeIngredients writes) ─────────────────
  /** Reference to /recipes/{recipeId} (Feature 011). Reference-only. */
  matchedRecipeId?: string;
  /** Reference to a staging ProposedRecipeCandidate. */
  candidateId?: string;
  matchConfidence?: number;
  matchSource?: MatchSource;
  matchingError?: string;
}

// ── Feature 024: 菜名比對與推定配方建立 (staging-only) ───────────────────────

/**
 * Staging-only proposed recipe inferred from an unmatched MenuImportItem.
 * `ingredients` are free-text strings, never formal ingredientId /
 * recipeIngredientId references. Confirmation is a human-review status
 * change only — it never creates formal recipes/ingredients/recipeIngredients.
 */
export interface ProposedRecipeCandidate {
  id: string;
  /** The staging MenuImportItem this candidate was inferred from. */
  sourceItemId: string;
  sourceBatchId: string;
  rawDishNameSnapshot: string;
  /** Free-text only — never a formal ingredientId/recipeIngredientId. */
  ingredients: string[];
  status: GovernanceReviewStatus;
  notes?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/**
 * Dish-name alias supporting matching against an existing /recipes/{recipeId}.
 * `recipeId` is reference-only. Confirmed aliases are immutable on their core
 * fields; rejected is final (see SSOT_RECONCILIATION_PACKAGE.md Section 6.5).
 */
export interface RecipeAlias {
  id: string;
  /** Immutable after create. */
  rawAlias: string;
  /** Immutable after create — generated consistently from rawAlias. */
  normalizedAlias: string;
  /** Reference to /recipes/{recipeId}. Reference-only. */
  recipeId: string;
  status: GovernanceReviewStatus;
  notes?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface MenuImportColumnMappingTemplate {
  id: string;
  templateName: string;
  organizationName: string;
  mealProgram: string;
  sourceFormat: 'csv';
  columnMappings: Record<string, string>;
  defaultMealType?: string;
  defaultServingBaseline?: number;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

// ── Feature 032: 果菜市場市價整合 (Wholesale Produce Market Price Integration) ──

/** A single crop's aggregated wholesale price summary for one day (from the MOA AMIS API). */
export interface MarketPriceEntry {
  cropName: string;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  totalQuantity: number;
  marketCount: number;
  sampleCropNames: string[];
}

/** Daily cache document stored at /marketPrices/{date} (doc ID = ISO date "YYYY-MM-DD"). */
export interface MarketPriceSnapshot {
  id: string;
  date: string;
  rocDate: string;
  entries: MarketPriceEntry[];
  warnings: string[];
  fetchedAt?: Timestamp;
  fetchedBy: string;
}

// ── Feature 033: 性價比菜單建議與採購成本標註 ────────────────────────────────

/** Per-recipe assessment result within a CostAwareMenuSuggestion. */
export interface CostAwareRecipeAssessmentItem {
  recipeId: string;
  recipeNameSnapshot: string;
  /** Sum over recipe ingredients of baseQuantity * pricePerBaseUnit; null if ANY ingredient line has an unresolvable price. */
  estimatedCostPerServing: number | null;
  /** Fraction (0..1) of ingredient lines with a resolvable price. */
  costCoverageRatio: number;
  marketPricedIngredientCount: number;
  defaultPricedIngredientCount: number;
  unpricedIngredientCount: number;
  /** min over ingredient lines of floor(availableBaseQty / baseQuantity); null if no line has stock data. */
  maxServingsFromStock: number | null;
  /** Fraction (0..1) of ingredient lines with stock data available. */
  stockCoverageRatio: number;
  /** The ingredient line that minimizes maxServingsFromStock, when stock data exists for at least one line. */
  limitingIngredientNameSnapshot?: string;
  /** Cheaper-per-serving + more cookable-from-stock scores higher; null when estimatedCostPerServing is null/<=0. */
  valueScore: number | null;
  reasoningNotes: string[];
}

/** Immutable create-only record stored at /costAwareMenuSuggestions/{id}. */
export interface CostAwareMenuSuggestion {
  id: string;
  targetServingCount: number;
  /** ISO date of the market price snapshot used, or null if none was cached today. */
  priceSnapshotDate: string | null;
  assessedRecipeCount: number;
  /** Sorted best valueScore first; null-score items last (sorted by name). */
  items: CostAwareRecipeAssessmentItem[];
  manualReviewNotes: string[];
  createdAt?: Timestamp;
  createdBy: string;
  // NO updatedAt / NO updatedBy — immutable record
}

// ── Feature 034: 人力與製作順序自動排程 (Production Schedule Suggestion) ─────

export interface ScheduledTaskAssignment {
  taskId: string;
  taskName: string;
  processType: ProcessType;
  equipmentType: EquipmentType;
  /** Minutes from schedule start (0 = work start). */
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  /** e.g. ["廚師#1"] — role + 1-based slot index; length === task.staffCount. */
  assignedStaffSlots: string[];
  /** e.g. "wok#2", null when equipmentType === 'none'. */
  assignedEquipmentSlot: string | null;
  dependsOnTaskIds: string[];
  /** Per-task issues (e.g. role fallback used). */
  warnings: string[];
}

export type ProductionScheduleStatus = 'fits' | 'overrun' | 'infeasible';

/** Immutable create-only record stored at /productionScheduleSuggestions/{id}. */
export interface ProductionScheduleSuggestion {
  id: string;
  sourceProductionWorkflowPlanId: string;
  sourcePlanNameSnapshot: string;
  targetServiceDateTime: Timestamp;
  capacityWindowMinutes: number;
  bufferMinutes: number;
  availableStaff: AvailableStaffInput[];
  availableEquipment: AvailableEquipmentInput[];
  /** Sorted by startOffsetMinutes, then taskName. */
  scheduledTasks: ScheduledTaskAssignment[];
  /** End of last task (0 if nothing scheduled). */
  makespanMinutes: number;
  scheduleStatus: ProductionScheduleStatus;
  unschedulableTaskIds: string[];
  /** Per role: busyMinutes / (count * (window - buffer)), 2dp. */
  staffUtilization: Record<string, number>;
  /** Per equipment type actually used. */
  equipmentUtilization: Record<string, number>;
  /** ISO datetime = targetServiceDateTime - makespan - buffer (suggested latest start). */
  workStartSuggestion: string;
  manualReviewNotes: string[];
  createdAt?: Timestamp;
  createdBy: string;
  // NO updatedAt / NO updatedBy — immutable record
}
