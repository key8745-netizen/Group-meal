import { Timestamp } from 'firebase/firestore';

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
