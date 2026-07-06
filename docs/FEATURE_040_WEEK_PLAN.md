# Feature 040: 週間規劃與多日彙總採購 (Week Planning View + Multi-Day Purchase Aggregation)

## Purpose

A read-only page (`/week-plan`) giving a Mon–Sun week view of the operating
chain (menus / 備料快照 / 製程規劃 status per day) with week navigation, plus a
multi-day purchase demand aggregation panel that sums 備料快照 requirements
across an arbitrary date range for reference purchasing — without creating
any purchase demand draft.

## Linking heuristics (mirrors Feature 038 `dailyOpsService`)

- `RecipeMenu.date === date && isActive` selects a day's menus.
- `PrepPlan.date === date && isActive`, **or** `sourceRecipeMenuId` is one
  of that day's menu ids, links a prep plan to the day.
- A `ProductionWorkflowPlan` counts as "has workflow tasks" for a day when
  active with ≥1 active task, and either `serviceDate === date` **or**
  `sourcePrepPlanId` is one of that day's linked prep plan ids (each pair
  OR'd — same tolerant style as the daily ops cockpit).

## Multi-day demand aggregation

`aggregateRangeDemand(startDate, endDate, prepPlans, ingredients, snapshot)`
sums `prepItems[].requiredBaseQuantity` across all **active** prep plans
whose `date` falls within `[startDate, endDate]` (inclusive), grouped by
`${ingredientId}__${baseUnit}`. Source plan names dedupe, capped at 5 per
line (`sourcePlanCount` reflects the true total).

Pricing is **entirely reused** from Feature 033
(`costAwareMenuSuggestionService.resolveIngredientPrice`) — no new pricing
logic. A missing `IngredientMaster` resolves to `priceSource: 'none'` and a
null `estimatedCost`. Lines sort by `estimatedCost` descending, unpriced
last (by name).

CSV export (`rangeDemandToCsv`) follows the same escaping convention as the
Feature 016 draft export (`src/utils/purchaseDemandDraftExport.ts`); the
page reuses that module's `downloadCsv`/`sanitizeFilename` helpers directly
for the download itself (BOM prefix applied there, not in the CSV string).

## Read-only guarantee

No writes, no new Firestore collection/index, no `firestore.rules` change —
only existing `list*`/`get*` reads (`recipeMenus`, `prepPlans`,
`productionWorkflowPlans`, `ingredients`, `marketPrices`) via
`loadWeekPlanData`, each independently try/catch-wrapped and degrading to
an empty/null fallback on failure (same pattern as
`dailyOpsService.loadDailyOpsOverview`). The page renders links and a
reference table only.

One small exception: `DailyOpsPage` now also reads an initial `date`
query-string param (`useSearchParams`) so week-grid cells can deep-link to
`/daily-ops?date=YYYY-MM-DD`.

## Out of scope

- No purchase demand draft created from the aggregation (reference + CSV
  export only).
- No cross-week templates or recurring week plans.
- No supplier splitting or purchase-order generation from aggregated lines.
