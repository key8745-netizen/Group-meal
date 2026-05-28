# ChatGPT 新對話上下文 — group-meal 專案

## 工作流說明

- **Gemini** = 大腦（出架構規格）
- **Claude** = 前端工程師（實作）
- **ChatGPT** = 驗證員（審查）
- **你** = 協調者

---

## 專案資訊

- **Repo:** `key8745-netizen/group-meal`
- **主線 Branch:** `claude/fervent-dirac-HJT01`
- **最新 Commit:** `85a5bd6`
- **Tech Stack:** Vite + React + TypeScript + Firebase Firestore + Netlify

---

## 已完成模組（本輪）

### 1. `src/hooks/useIntelligenceInsights.ts`

自訂 Hook，並行抓取五個資料源：

```ts
const [insightData, suggestionData, ingredientSnaps, inventorySnaps, settings] =
  await Promise.all([
    runDailyAnalysis(db),
    generatePurchaseSuggestion(db),
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'inventory')),
    configService.getSettings(TENANT_ID),
  ]);
```

- **SHORTAGE 偵測**：`suggestedQtyKg > 0`（來自 generatePurchaseSuggestion）
- **WASTE_RISK 偵測**：`isHighWaste = wasteFactor > wasteThreshold AND currentStock > safetyLevelKg`
- **TENANT_ID fallback**：`VITE_TENANT_ID ?? VITE_FIREBASE_PROJECT_ID ?? 'umas-booking-manager'`

---

### 2. `src/components/IntelligenceDashboard.tsx`

集中式 AI 決策看板，管理多卡並行狀態：

```ts
const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
const [appliedMap,  setAppliedMap]  = useState<Map<string, string>>(new Map());
```

`handleApply` 三道防禦：

```ts
if (item.type !== 'SHORTAGE') return;          // Guard 1
if (applyingIds.has(id) || appliedMap.has(id)) return; // Guard 2
if (!Number.isFinite(item.suggestedQtyKg) || item.suggestedQtyKg <= 0) return; // Guard 3
```

---

### 3. `src/components/PurchaseSuggestionCard.tsx`

Per-item 採購建議卡片，SHORTAGE 顯示採購按鈕，WASTE_RISK 僅顯示警告。

---

### 4. `src/services/purchaseOrderService.ts`

#### 介面重命名

```ts
export interface PurchaseOrderItem {
  ingredientId:    string;
  name:            string;
  purchaseQtyKg:   number;          // 原 shortageKg
  purchaseTaijin:  number;          // 原 shortageTaijin
  recommendedQtyKg?: number | null; // AI 原始建議量（DRAFT 單自動 stamp）
}
```

#### createDraftOrder（runTransaction）

```ts
const items = shortageItems
  .filter((i) => i.purchaseQtyKg > 0)
  .map((i) => ({ ...i, recommendedQtyKg: i.recommendedQtyKg ?? i.purchaseQtyKg }));

await runTransaction(db, async (t) => {
  t.set(orderRef, { status: 'DRAFT', items, notes, createdAt: serverTimestamp() });
});
```

#### completeOrder 埋點（fire-and-forget）

```ts
logOrderFulfillment(db, orderId, order.items.map((item) => ({
  ingredientId:             item.ingredientId,
  ingredientName:           item.name,
  purchasedQtyKg:           item.purchaseQtyKg,
  originalRecommendedQtyKg: item.recommendedQtyKg ?? null,
})));
```

---

### 5. `src/services/performanceService.ts`

#### logOrderFulfillment（fire-and-forget）

```ts
export function logOrderFulfillment(db, orderId, items): void {
  void (async () => {
    try {
      const col = collection(db, 'performanceLogs', TENANT_ID, 'orderFulfillments');
      await Promise.all(items.map((item) => {
        const variance =
          item.originalRecommendedQtyKg !== null
            ? r2(item.purchasedQtyKg - item.originalRecommendedQtyKg)
            : null;
        return addDoc(col, { ...item, variance, tenantId: TENANT_ID, fulfilledAt: serverTimestamp() });
      }));
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[performanceService] logOrderFulfillment failed:', err);
    }
  })();
}
```

- `r2 = Math.round(n * 100) / 100`（variance 四捨五入二位）
- DEV-only console.warn，production 不阻塞

---

### 6. `netlify.toml`

```toml
[build]
  base    = "catering-system"
  command = "npm run build"   # 含 tsc 型別檢查
  publish = "dist"
```

---

## 環境變數（Netlify Production 已設定）

| 變數 | 狀態 |
|---|---|
| VITE_FIREBASE_API_KEY | ✅ 已設定 |
| VITE_FIREBASE_AUTH_DOMAIN | ✅ 已設定 |
| VITE_FIREBASE_PROJECT_ID | ✅ `umas-booking-manager` |
| VITE_FIREBASE_STORAGE_BUCKET | ✅ 已設定 |
| VITE_FIREBASE_MESSAGING_SENDER_ID | ✅ 已設定 |
| VITE_FIREBASE_APP_ID | ✅ 已設定 |
| VITE_TENANT_ID | ⚠️ 未設定（fallback 至 PROJECT_ID，MVP 可接受） |

---

## 稽核結果（本輪全通過）

- Code Audit: ✅ Pass
- Merge: ✅ Pass（`42715b6` on `claude/fervent-dirac-HJT01`）
- Environment Variables: ✅ Pass
- npm run build: ✅ 零 type error

---

## 待辦（下輪或人工）

- [ ] 端對端驗證：建立採購單 → 確認入庫 → Firestore `performanceLogs/umas-booking-manager/orderFulfillments/` 確認寫入
- [ ] 未來多租戶：補設 `VITE_TENANT_ID`

---

## 給 ChatGPT 的驗證起點

收到 Gemini 新 Spec 後，請依照以下格式驗證：

1. 確認 branch `claude/fervent-dirac-HJT01`（非 main）
2. 確認 commit hash
3. 逐項驗證 Spec 要求
4. 回報：通過 ✅ / 不通過 ❌ / 警告 ⚠️
