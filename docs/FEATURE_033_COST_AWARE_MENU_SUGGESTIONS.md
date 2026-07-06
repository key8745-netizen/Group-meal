# Feature 033: 性價比菜單建議與採購成本標註

## Purpose

Part A ranks active recipes by estimated cost-per-serving and servings
cookable from current inventory, so staff can pick cost-effective dishes for
a target headcount. Part B annotates each 採購需求草稿 line with an estimated
unit price/amount to spot expensive items before ordering. Both are
read-only aids — nothing here creates menus, purchases, or writes to
recipes/inventory/drafts.

## Score Formula (`calculateCostAwareMenuSuggestion`, pure)

```
feasibleServings = maxServingsFromStock == null ? 0 : min(maxServingsFromStock, targetServingCount)
stockFactor      = targetServingCount > 0 ? feasibleServings / targetServingCount : 0
valueScore       = estimatedCostPerServing > 0
                     ? round2((1 + stockFactor) / estimatedCostPerServing * 100)
                     : null   // also null when cost is null (any unpriced ingredient)
```

Cheaper per serving scores higher; fully cookable from stock up to the target
doubles the score. `maxServingsFromStock` = min, across lines with stock
data, of `floor(availableBaseQty / baseQuantity)` — the scarcest ingredient
becomes `limitingIngredientNameSnapshot`. Null-`valueScore` recipes sort last
(by name); zero-ingredient recipes are skipped (with a review note).

## Price Resolution (`resolveIngredientPrice`, shared by Part A & B)

1. `baseUnit === 'pcs'`: market pricing not applicable. Only usable when
   `defaultPriceUnit === purchaseUnit` and `conversionFactorToBaseUnit > 0` →
   `defaultPrice / conversionFactorToBaseUnit` (source `'default'`), else
   unresolvable (`'none'`).
2. `baseUnit` 'g'/'ml': if `marketCropName` is linked and today's
   `marketPrices/{date}` cache has a priced entry → source `'market'`,
   `pricePerKg` = cached `avgPrice`. Else `pricePerKgFromDefault()` (Feature
   032) → `'default'`. Else `'none'`. `pricePerBaseUnit = pricePerKg / 1000`
   — 'ml' assumes 1g ≈ 1ml (same as Feature 032).
3. Rounding: 4dp per-base-unit, 2dp per-kg.

## Data Sources & Unit Assumptions

- `recipes` supply `recipeIngredients[].baseQuantity`/`baseUnit` (already per-serving).
- `inventory/{ingredientId}.currentStock` is kg; ×1000 for 'g'/'ml'. `'pcs'`
  has no reliable stock mapping — excluded from stock calc entirely.
- A line with no `inventory` doc = no stock data (excluded from the
  `maxServingsFromStock` minimum).

## Collection Schema & Rules

`/costAwareMenuSuggestions/{id}` — immutable, create-only (mirrors
`menuMixRecommendations`): `targetServingCount`, `priceSnapshotDate`,
`assessedRecipeCount`, `items[]`, `manualReviewNotes[]`, `createdAt`,
`createdBy`. `read`: `isAuthenticated()`; `create`: `isPurchasingStaff()` +
field allow-list; `update`/`delete`: always `false`.

## Part B: Purchase Demand Draft Cost Annotation (display-only)

`PurchaseDemandDraftForm.tsx` (edit mode) loads ingredients + today's market
snapshot once, then shows per item: 預估單價 (市價/基準/無價 badge), 預估金額
(`demandQuantity × pricePerBaseUnit`), a grand total, and an unpriced-line
count. Red ⚠ when price source is `'market'` and `pricePerKg ≥ 1.15 ×
pricePerKgFromDefault(ingredient)`. No new Firestore field, no change to
`purchaseDemandDraftService.ts` write paths, no rules change for this part.

## Out of Scope

- No automatic menu creation or purchase-order generation.
- No writes to `recipes`, `ingredients`, `inventory`, or
  `purchaseDemandDrafts` — Part A only creates a `costAwareMenuSuggestions`
  record; Part B is a UI annotation only.
- No price history/trend — only today's snapshot; no cross-date fallback.

## Runtime Verification Pending

Unit tests cover pure logic only. Before production use, verify against a
live `group-meal` database: (1) 性價比菜單建議 rankings against real
recipes/inventory, (2) the 尚無今日市價快取 hint around a 市場行情 refresh,
(3) 採購需求草稿 cost annotations and ⚠ badge against real ingredient data.
