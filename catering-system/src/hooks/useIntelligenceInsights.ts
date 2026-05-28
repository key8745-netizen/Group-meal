import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { runDailyAnalysis, THRESHOLDS, type Insight } from '@/services/intelligenceAgent';
import { generatePurchaseSuggestion } from '@/services/purchaseService';
import { configService } from '@/services/configService';
import { UnitConverter } from '@/services/unitConverter';
import type { Ingredient, InventoryDoc } from '@/services/types';

// VITE_TENANT_ID identifies the tenant in Firestore settings/{tenantId}.
// Falls back to project ID for single-tenant deploys; set explicitly for multi-tenant.
const TENANT_ID: string =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ??
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
  'umas-booking-manager';

// ─── Public types ─────────────────────────────────────────────────────────────

export type SuggestionType = 'SHORTAGE' | 'WASTE_RISK';

export interface SuggestionItem {
  ingredientId:   string;
  ingredientName: string;
  currentStockKg: number;
  safetyLevelKg:  number;
  orderDemandKg:  number;
  /** > 0 for SHORTAGE; 0 for WASTE_RISK */
  suggestedQtyKg: number;
  estimatedCost:  number;
  wasteFactor:    number;
  type:           SuggestionType;
}

export interface UseIntelligenceInsightsResult {
  items:    SuggestionItem[];
  insights: Insight[];
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

// ─── useIntelligenceInsights ──────────────────────────────────────────────────

export function useIntelligenceInsights(): UseIntelligenceInsightsResult {
  const [items,    setItems]    = useState<SuggestionItem[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [insightData, suggestionData, ingredientSnaps, inventorySnaps, settings] =
          await Promise.all([
            runDailyAnalysis(db),
            generatePurchaseSuggestion(db),
            getDocs(collection(db, 'ingredients')),
            getDocs(collection(db, 'inventory')),
            configService.getSettings(TENANT_ID),
          ]);

        const wasteThreshold = settings.wasteFactorWarning ?? THRESHOLDS.highWasteFactor;

        if (cancelled) return;

        const ingredientMap = new Map<string, Ingredient>();
        ingredientSnaps.forEach((snap) => {
          if (snap.exists()) {
            ingredientMap.set(snap.id, { id: snap.id, ...snap.data() } as Ingredient);
          }
        });

        const inventoryMap = new Map<string, InventoryDoc>();
        inventorySnaps.forEach((snap) => {
          if (snap.exists()) {
            inventoryMap.set(snap.id, snap.data() as InventoryDoc);
          }
        });

        const result: SuggestionItem[] = [];

        // ── 1. SHORTAGE: items from purchase suggestion (suggestedQtyKg > 0) ─
        const shortageIds = new Set<string>();
        for (const lineItem of suggestionData.items) {
          shortageIds.add(lineItem.ingredientId);
          result.push({
            ingredientId:   lineItem.ingredientId,
            ingredientName: lineItem.ingredientName,
            currentStockKg: lineItem.currentStockKg,
            safetyLevelKg:  lineItem.safetyLevelKg,
            orderDemandKg:  lineItem.orderDemandKg,
            suggestedQtyKg: lineItem.suggestedQtyKg,
            estimatedCost:  lineItem.estimatedCost,
            wasteFactor:    ingredientMap.get(lineItem.ingredientId)?.wasteFactor ?? 0,
            type:           'SHORTAGE',
          });
        }

        // ── 2. WASTE_RISK: high wasteFactor + stock above safety level ────────
        for (const [id, ingredient] of ingredientMap) {
          if (shortageIds.has(id)) continue;
          const isHighWaste = !!ingredient.wasteFactor && ingredient.wasteFactor > wasteThreshold;
          if (!isHighWaste) continue;

          const inventory = inventoryMap.get(id);
          if (!inventory) continue;

          const safetyLevelKg = UnitConverter.toKg(ingredient.minStockLevel, ingredient.unit);
          if (inventory.currentStock <= safetyLevelKg) continue;

          result.push({
            ingredientId:   id,
            ingredientName: ingredient.name,
            currentStockKg: inventory.currentStock,
            safetyLevelKg,
            orderDemandKg:  0,
            suggestedQtyKg: 0,
            estimatedCost:  0,
            wasteFactor:    ingredient.wasteFactor ?? 0,
            type:           'WASTE_RISK',
          });
        }

        // HIGH first, then WASTE_RISK after SHORTAGE
        result.sort((a, b) => {
          if (a.type === b.type) return b.suggestedQtyKg - a.suggestedQtyKg;
          return a.type === 'SHORTAGE' ? -1 : 1;
        });

        setItems(result);
        setInsights(insightData);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { items, insights, loading, error, refresh };
}
