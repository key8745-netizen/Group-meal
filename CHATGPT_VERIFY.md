# ChatGPT 驗證請求 — Intelligence 採購模組

**Repo:** `key8745-netizen/group-meal`
**Branch:** `claude/blissful-fermi-3QxGP`
**最新 Commit:** `0224db8`

> 注意：請在上方指定的 branch 驗證，不要看 main。

---

## 背景

這是 Software 3.0 工作流：Gemini 出架構決策、Claude 實作、ChatGPT 驗證。
本次驗證範圍：Intelligence 採購建議模組（SHORTAGE / WASTE_RISK 偵測 + DRAFT 採購單建立）。

---

## 驗證項目 1 — configService 動態閾值整合

**位置：** `catering-system/src/hooks/useIntelligenceInsights.ts`

configService 整合在 **hook** 裡，不在 component 裡（這是正確的資料層分離）。

```ts
// 第 6 行
import { configService } from '@/services/configService';

// 第 12-15 行：TENANT_ID 優先讀 VITE_TENANT_ID
const TENANT_ID: string =
  (import.meta.env.VITE_TENANT_ID as string | undefined) ??
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ??
  'umas-booking-manager';

// 第 58-65 行：5 個 Promise 並行，含 configService.getSettings
const [insightData, suggestionData, ingredientSnaps, inventorySnaps, settings] =
  await Promise.all([
    runDailyAnalysis(db),
    generatePurchaseSuggestion(db),
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'inventory')),
    configService.getSettings(TENANT_ID),   // <-- 動態閾值來源
  ]);

// 第 67 行：fallback 至靜態常數
const wasteThreshold = settings.wasteFactorWarning ?? THRESHOLDS.highWasteFactor;
```

**驗證問題：** configService 整合是否正確？TENANT_ID fallback 鏈是否合理？

---

## 驗證項目 2 — PurchaseOrderItem 重命名

**位置：** `catering-system/src/services/purchaseOrderService.ts`

```ts
export interface PurchaseOrderItem {
  ingredientId:  string;
  name:          string;
  purchaseQtyKg: number;    // 採購量 kg（原 shortageKg）
  purchaseTaijin: number;   // 採購量台斤（原 shortageTaijin）
}

// createOrder filter（第 67 行）
const items = shortageItems.filter((i) => i.purchaseQtyKg > 0);

// createDraftOrder filter（第 134 行）
const items = shortageItems.filter((i) => i.purchaseQtyKg > 0);

// completeOrder restock（第 112 行）
await restockIngredient(db, item.ingredientId, item.name, item.purchaseQtyKg, ...);
```

**未改的檔案（語意不同，正確保留）：**
- `recipeMatchingService.ts` → `FeasibilityItem.shortageKg` = 生產缺口，非採購量
- `TodayPrep.tsx` → 本地 interface，非 PurchaseOrderItem

**驗證問題：** 重命名範圍是否完整且正確？

---

## 驗證項目 3 — WASTE_RISK 偵測條件

**位置：** `catering-system/src/hooks/useIntelligenceInsights.ts` 第 105-127 行

```ts
for (const [id, ingredient] of ingredientMap) {
  if (shortageIds.has(id)) continue;   // 已在 SHORTAGE 清單，跳過

  // isHighWaste = true 只有當 wasteFactor > wasteThreshold
  const isHighWaste = !!ingredient.wasteFactor && ingredient.wasteFactor > wasteThreshold;
  if (!isHighWaste) continue;          // 非高損耗，跳過

  const inventory = inventoryMap.get(id);
  if (!inventory) continue;

  const safetyLevelKg = UnitConverter.toKg(ingredient.minStockLevel, ingredient.unit);
  if (inventory.currentStock <= safetyLevelKg) continue;  // 庫存未超過安全水位，跳過

  result.push({ ..., type: 'WASTE_RISK' });
}
```

加入 WASTE_RISK 的條件（兩者同時成立）：
1. `wasteFactor > wasteThreshold`（高損耗）
2. `currentStock > safetyLevelKg`（庫存過剩）

**驗證問題：** WASTE_RISK 偵測邏輯是否正確？

---

## 驗證項目 4 — handleApply 三道防禦（IntelligenceDashboard）

**位置：** `catering-system/src/components/IntelligenceDashboard.tsx` 第 60-90 行

```ts
async function handleApply(item: SuggestionItem) {
  // Guard 1: 只有 SHORTAGE 可建立採購單
  if (item.type !== 'SHORTAGE') return;
  // Guard 2: 防止重複提交
  if (applyingIds.has(item.ingredientId) || appliedMap.has(item.ingredientId)) return;
  // Guard 3: 拒絕 NaN / Infinity / 非正數
  if (!Number.isFinite(item.suggestedQtyKg) || item.suggestedQtyKg <= 0) return;

  setApplyingIds((prev) => new Set(prev).add(item.ingredientId));
  try {
    const orderId = await purchaseOrderService.createDraftOrder([{
      ingredientId:   item.ingredientId,
      name:           item.ingredientName,
      purchaseQtyKg:  item.suggestedQtyKg,      // 正確命名
      purchaseTaijin: toTaijin(item.suggestedQtyKg),
    }]);
    setAppliedMap((prev) => new Map(prev).set(item.ingredientId, orderId));
  } catch (err) { ... }
  finally {
    setApplyingIds((prev) => { const next = new Set(prev); next.delete(item.ingredientId); return next; });
  }
}
```

狀態設計：
- `applyingIds: Set<string>` — 多張卡片可同時 apply，互不干擾
- `appliedMap: Map<string, string>` — ingredientId → orderId，永久鎖定已建立項目
- WASTE_RISK 卡片無 Button，handleApply Guard 1 也擋住

**驗證問題：** 三道防禦是否完整？多卡並行 apply 是否安全？

---

## 驗證項目 5 — createDraftOrder 使用 runTransaction

**位置：** `catering-system/src/services/purchaseOrderService.ts` 第 130-155 行

```ts
async createDraftOrder(shortageItems: PurchaseOrderItem[], notes = 'AI 智能建議自動產生'): Promise<string> {
  const items = shortageItems.filter((i) => i.purchaseQtyKg > 0);

  if (items.length === 0) {
    throw new Error('purchaseOrderService: no shortage items to order');
  }

  const orderRef = doc(collection(db, 'purchaseOrders'));

  await runTransaction(db, async (t) => {
    t.set(orderRef, {
      status: 'DRAFT',
      items,
      notes,
      createdAt: serverTimestamp(),
    });
  });

  return orderRef.id;
}
```

**驗證問題：** runTransaction 用法是否正確？空 items 防禦是否完整？

---

## 總結：請驗證以下 5 點

1. configService.getSettings 整合於 hook，TENANT_ID fallback 鏈正確？
2. PurchaseOrderItem 全域重命名為 purchaseQtyKg / purchaseTaijin，範圍正確？
3. WASTE_RISK 條件：wasteFactor > wasteThreshold AND currentStock > safetyLevelKg？
4. handleApply 三道防禦完整，多卡並行安全？
5. createDraftOrder 使用 runTransaction，空項目防禦正確？

請在 branch `claude/blissful-fermi-3QxGP` 直接查閱原始碼確認。
