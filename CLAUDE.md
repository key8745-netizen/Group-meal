# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Engineering Constitution

**All work in this repo follows `docs/CLAUDE_Engineering_Constitution_v1.0.md`.**
Key operating rules distilled from it:

- Read first, infer second, modify last — never assume structure/APIs/schemas;
  read the real code before changing it. Stop and ask when assumptions would
  determine correctness.
- Minimal correct change; one logical unit at a time; prefer existing patterns
  (this repo's two service patterns, per-collection create functions, pure
  planner + thin executor split) over inventing new ones.
- Before non-trivial features, state plan / scope / risks / validation.
- Security by design: Firestore access is email-allowlisted (see
  firestore.rules `isAuthenticated()`); never trust client-provided identity
  or workflow state; keep audit-trail collections create-only.
- Verify functionality + no regression (`npm run typecheck` + the affected
  `src/services/__tests__/*.test.ts` suites); state explicitly when
  verification could not be performed.
- When architecture / API / schema / rules change, update this file and
  remind the owner to redeploy `firestore.rules` to Firebase Console.
- Communicate in Traditional Chinese; separate facts, inferences, assumptions.

## Repository Layout

```
Group-meal/
├── catering-system/          # Vite + React SPA (the main app)
│   ├── src/
│   │   ├── services/         # Firebase/business logic (no React)
│   │   ├── components/       # React components
│   │   │   ├── menus/        # Menu management feature
│   │   │   ├── layout/       # AppLayout + sidebar
│   │   │   └── ui/           # shadcn/ui primitives
│   │   ├── pages/            # Route-level components
│   │   ├── utils/            # Standalone utilities
│   │   ├── constants/        # Static seed data
│   │   └── hooks/            # use-toast
│   ├── netlify/
│   │   └── functions/        # Netlify serverless functions (see below)
│   └── scripts/              # One-off Node scripts (run with tsx)
└── netlify.toml              # Build: base=catering-system, functions=netlify/functions
```

**Important:** `netlify.toml` sets `base = "catering-system"`, which makes
`functions.directory` resolve **relative to that base**, not the repo root.
The functions directory therefore lives at `catering-system/netlify/functions/`
(not a top-level `netlify/` folder) — this was fixed after a real deploy
failure where a repo-root `netlify/functions/` silently deployed zero
functions. Function runtime dependencies (e.g. `@google/generative-ai`)
belong in `catering-system/package.json`, not the repo-root one.

## Commands

All commands run from `catering-system/`:

```bash
npm run dev        # Vite dev server (localhost:5173)
npm run build      # tsc + vite build → dist/
npm run typecheck  # tsc --noEmit (no emit, fast type check)
npm run preview    # Preview production build
```

Scripts (require Firebase env vars — see `.env`):
```bash
npx tsx scripts/seedIngredients.ts          # Seed 10 core ingredients (idempotent)
npx tsx scripts/generateAutomatedOrder.ts   # Auto-detect shortages → DRAFT purchase order
npx tsx scripts/generateAutomatedOrder.ts <recipeId> <headCount>
npx tsx scripts/seedPreservationYields.ts             # Feature 082: 加工延壽良率種子（dry-run 預設）
npx tsx scripts/seedPreservationYields.ts --execute   # 寫入（merge-only、不臆測、乾貨略過）
npx tsx scripts/seedInitialBatches.ts                 # Feature 087: 從 currentStock 建初始批次（dry-run 預設）
npx tsx scripts/seedInitialBatches.ts --execute       # 寫入（讓保鮮系統看見既有庫存；merge-only、無保存天數略過）
npx tsx scripts/seedDishCategories.ts                 # Feature 091: 依菜名猜菜色類別（dry-run 預設）
npx tsx scripts/seedDishCategories.ts --execute       # 寫入 Recipe.category（merge-only、猜不出略過；供 089/090）
```

Correctness gates (also run in CI — see `.github/workflows/ci.yml`):
```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc && vite build
npm run test:ci     # runs all src/services/__tests__/*.test.ts via tsx (excludes *.emulator.test.ts)
```
Tests are standalone `tsx` scripts (custom `check()` asserts, throw + non-zero exit on failure);
`scripts/ci-test.mjs` runs each and fails the build if any suite fails. `*.emulator.test.ts` need the
Firebase emulator and are excluded from CI. Run one suite directly with
`npx tsx src/services/__tests__/<name>.test.ts`.

## Environment Variables

`.env` in `catering-system/` (all prefixed `VITE_` for Vite):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID          # umas-booking-manager
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Netlify function env var (set in Netlify dashboard only, never in code):
```
GEMINI_API_KEY    # Google AI Studio key for ocr-menu function
```

## Firebase Architecture

- **Project**: `umas-booking-manager`
- **Named database**: `group-meal` (not the default database — `getFirestore(app, 'group-meal')`)
- **Auth**: Email/Password + Google Sign-In via `signInWithPopup`

### Firestore Collections

| Collection | Doc ID | Purpose |
|---|---|---|
| `menus` | auto | Dish recipes with BOM (`ingredients: BOMItem[]`) |
| `ingredients` | slug | Master ingredient data (name, unit, cost, wasteFactor) |
| `inventory` | same as ingredientId | Live stock in kg (`currentStock`) |
| `inventory/{id}/transactions` | auto | Audit trail (restock / deduct / adjustment) |
| `orders` | auto | Customer orders |
| `purchaseOrders` | auto | Purchase orders (DRAFT → PENDING → RECEIVED / CANCELLED) |
| `mealPlans` | `YYYY-MM-DD` | Daily menu schedule (menuIds + headCount) — ⚠️ **not actually reached**, see note below |
| `publicOrderShares` | share token | Feature 107: supplier-visible snapshot behind `/share/:shareToken` |
| `settings` | tenantId | System thresholds (configService) |

### Service Patterns

Two patterns exist — do not mix them:

1. **Module-level `db`** — services that import `db` from `@/lib/firebase` directly:
   `purchaseOrderService`, `dishService`, `configService`, `InventoryAudit`, `ManualPurchaseForm`
   (`mealPlanService` also follows this pattern but is unreferenced — see 死碼 below)

2. **`db: Firestore` parameter** — services designed for both browser and scripts:
   `inventoryService`, `purchaseService`, `performanceService`, `recipeMatchingService`

### 死碼：未接線的 service（2026-08 體檢）

**47 個 service 檔（13,030 / 33,341 行，約 39%）在 production 完全沒有被 import，只有測試在跑**，
而 121 個測試套件裡有 64 個（53%）是在測這些東西。找法：

```bash
# 列出零 production 引用的 service
cd catering-system/src/services && for f in *.ts; do n="${f%.ts}"; \
  c=$(grep -rl "services/$n\b\|from '\./$n'\|from '\.\./$n'" ../../src ../../scripts ../../netlify 2>/dev/null \
      | grep -v __tests__ | grep -v "/$f$" | wc -l); [ "$c" -eq 0 ] && echo "$n"; done
```

主要成分是 `docs/FEATURE_003~006_*` 那批「AI 模型設定套用」子系統
（`modelConfig*` / `realModelConfigApply*` / `canary*` / `prediction*`），四個 phase 全部建完、
測試齊備，但一行都沒接進 App。另外還有 `mealPlanService`（連帶使 `mealPlans` collection 實際上
沒有任何讀寫路徑——`'mealPlans'` 字串只出現在 `mealPlanService.ts:9`）、`capacityFeasibilityService`、
`concurrencyManager`、`securityAudit`、`receivingTransactionPlanService`。

**在動這些檔案前先確認它到底有沒有被接線**，不要假設「有測試 = 有在用」。要嘛接進 App，要嘛刪掉；
現況是 CI 有一半時間在驗證從未出貨的程式碼。

### Inventory Write Rules

- **Deduct stock**: always via `inventoryService.deductStock()` — uses `runTransaction` with pre-validation
- **Restock**: always via `inventoryService.restockIngredient()` — called by `purchaseOrderService.completeOrder()`
- **Manual adjustment**: `InventoryAudit` uses its own `runTransaction` writing `type: 'adjustment'` transactions
- **加工延壽 (Feature 079)**: `preservationService.recordPreservation()` — one `runTransaction` that
  reduces the source batch's `qtyRemainingKg`, creates a processed batch under the **same** ingredient
  (`storageType` change + reset expiry + `sourceBatchId`/`sourceNote`/`processedLabel`), adjusts
  `currentStock` by the cooking loss only, and writes an `adjustment` audit record. The plan is computed
  by the pure `preservationPlanner.planPreservation()`. Same-ingredient design keeps the processed batch
  visible to recipe suggestions + freshness alerts (惜食 loop stays intact).
- **FEFO batch sync (Feature 083)**: after `deductStock` authoritatively reduces `currentStock`,
  `deductPrepPlanStock` calls `inventoryBatchService.applyFefoBatchDeduction()` per ingredient
  (best-effort, try/catch) to reduce batch `qtyRemainingKg` in FEFO order (`planFefoDeduction`),
  so freshness alerts don't show phantom (already-cooked) batches. `currentStock` stays authoritative;
  batch writes are additive/best-effort per the coexistence model.
- Never update `inventory/{id}.currentStock` directly outside a transaction

Freshness/preservation schema fields (Feature 071/079): `IngredientMaster.processedYieldRatio?`
(default cook yield); `InventoryBatch.processedLabel?` (e.g. 「煮熟冷藏」). The `batches` subcollection
rule is permissive (no field whitelist), so new batch fields need no rules change; `ingredientAllowedFields()`
in `firestore.rules` **does** whitelist ingredient fields — `processedYieldRatio` was added there.

Menu balance (Feature 089): `Recipe.category?: DishCategory` (主菜/主食/蔬菜/湯/其他) drives the
`menuBalancePlanner.summarizeMenuBalance()` readout shown in DayStart + RecipeMenuForm. The recipe
rules whitelist (`validRecipeCreate`/`validRecipeUpdate` in `firestore.rules`) added `'category'` +
an enum value check — **redeploy rules** after this change.

Per-dish knife work (Feature 100): `RecipeIngredientItem.cutType?: CutType` (跟著配方走——同食材、
不同菜可不同切法) is edited in `RecipeForm` (切法 dropdown per row) and flows through
`prepPlanService` into `PrepPlanRecipeContribution.cutType`. `workflowTaskDraftService` reads the
distinct recipe-specified cuts per aggregated ingredient: exactly one → overrides that category
template's `cut` step (cutType + label + guidance); conflicting cuts across dishes → keep the
template default and emit a 「跨菜有不同指定切法…請人工分切」 generation note. **No rules change**:
the recipe rules whitelist only top-level `Recipe` fields; `recipeIngredients[]` item fields are not
validated in `firestore.rules` (see comment there), so nested `cutType` needs no redeploy. Distinguish
the two levels: 前處理 (清洗/去皮/去蒂頭) is ingredient-intrinsic and lives in the category templates;
刀工 (切段/切絲/…) is dish-dependent and lives on the recipe line.

Per-ingredient default cut (Feature 101): `IngredientMaster.defaultCutType?: CutType` is a fallback the
`workflowTaskDraftService` cut-override precedence uses — **recipe-specified (single) > ingredient
`defaultCutType` > category template**. Edited via a 預設切法 dropdown in `IngredientMasterForm`;
persisted form-authoritatively (choosing 「不指定」 clears it). Guidance text distinguishes the source
(依配方指定切法 vs 依食材預設切法). Ingredient fields **are** whitelisted, so `'defaultCutType'` was added
to `ingredientAllowedFields()` in `firestore.rules` — **redeploy rules** after this change.

Per-ingredient prep note (Feature 102): `IngredientMaster.prepNote?: string` (前處理，食材固有——如
「去蒂頭、切頭去尾、削皮」) is edited via a 前處理備註 input in `IngredientMasterForm` and appended by
`workflowTaskDraftService` to the **first** prep step's guidance (`…｜前處理：<note>`) for that ingredient.
Persisted form-authoritatively (clearing removes it). `'prepNote'` was added to `ingredientAllowedFields()`
in `firestore.rules` — **redeploy rules**. This is the 前處理 (食材固有) counterpart to the 刀工 (隨菜/食材
預設) cut fields above.

Prep cut summary (Feature 103): `prepCutSummaryPlanner.summarizePrepCuts(prepPlan, ingredientsById)` is a
pure, read-only readout shown in `PrepPlanForm` (edit mode) — it groups a prep plan's ingredients by the
**resolved** cut so 備料 can batch identical knife work across dishes, and lists per-ingredient 前處理
備註. `resolveItemCut()` mirrors `workflowTaskDraftService`'s precedence (配方指定單一 > 食材 `defaultCutType`
> 未指定; cross-dish cut conflict → 未指定). `PrepPlanPage` loads the ingredient master (best-effort) for the
`ingredientsById` map; without it the summary degrades to recipe-specified cuts only. **No schema/rules
change** — pure display over existing fields.

Attended vs unattended time (Feature 104): `ProductionWorkflowTask.attentionMinutes?` (hands-on 分鐘;
省略 = 全程要顧 = `estimatedMinutes`). `productionScheduleService` occupies **staff** only for
`[start, start+attention)` but **equipment + completion** for the full `estimatedMinutes` — so a 40-min
braise with `attentionMinutes: 5` frees the cook after 5 min and the scheduler places other dishes' active
work in the passive window (this is the 「利用燉煮空檔做別的」 mechanic). Clamped to `[1, estimatedMinutes]`;
staff utilization counts attention only. `workflowTaskDraftService` sets marinate steps to mostly-unattended
(`attentionMinutes` on the template step, emitted only when `< minutes`); editable per task via the 要顧時間
input in `ProductionWorkflowTaskList` and surfaced in the task table (「顧N」). `ScheduledTaskAssignment`
gained a required `attentionMinutes` output (the scheduler always sets it). **No rules change** —
`productionWorkflowPlans.tasks[]` / `productionScheduleSuggestions.scheduledTasks[]` item fields are not
whitelisted.

Schedule Gantt + start-time anchoring (Features 105–106): the visual Gantt that 104 flagged as a
follow-up **is built** — `ProductionScheduleResult.tsx` renders the schedule as bars so 並行 and
燉煮空檔 are readable at a glance, and Feature 106 adds an 開工時間 control on top of it: the user
enters the real clock start (defaulting to the suggested latest start), and 餘裕分鐘 + 來得及/趕不上
plus every Gantt/task time re-anchors live. Both are **pure UI over the existing schedule output** —
no schema and no rules change.

Public order share links (Feature 107): `/share/:shareToken` reads `publicOrderShares/{shareToken}`,
a minimal snapshot (`orderId` / `status` / `items` / `orderCreatedAt` / `sharedAt` / `sharedBy`)
written by `purchaseOrderService.createShareLink()`; `revokeShareLink()` deletes it. **The token is the
doc id, not a field** — Firestore rules cannot inspect query parameters on a `get`, so a `shareToken`
field on `purchaseOrders` could never gate an unauthenticated read; putting it in the path is the only
formulation that works. `purchaseOrders` therefore stays fully behind the email allowlist, and a leaked
link exposes strictly less than the order doc. Rules: `allow get: if true` but **`list: if false`**
(no enumeration), writes allowlisted + field-validated. `PurchaseOrder.shareToken?` remembers the token
so re-sharing reuses it (and refreshes a snapshot gone stale after an edit). **Redeploy `firestore.rules`.**

## Unit Conversion

Two converters exist for historical reasons:

- `src/services/unitConverter.ts` → `UnitConverter` class — handles kg / g / 台斤 / L / piece; used by order/purchase/recipe services
- `src/utils/unitConverter.ts` → `toTaijin(kg)` / `toKg(taijin)` — simple 2dp kg↔台斤; used by UI components and scripts

**1 台斤 = 0.6 kg**; **1 磅 = 0.453592 kg**. All internal storage is in **kg**.

Display-unit toggle (Feature 093): `WeightUnitProvider` (`src/contexts/WeightUnitContext.tsx`) wraps
the app; the top-bar `WeightUnitToggle` switches kg / 台斤 / 磅 (localStorage-persisted). Weight
**displays** use `formatWeight(kg, unit)` from `src/utils/unitConverter.ts` — internal values stay kg,
only display changes. `inputToKg(value, unit)` converts unit-aware inputs back to kg.

## BOM / Recipe Matching

`recipeMatchingService.ts` expands a recipe for N servings:

```
requiredKg = (qtyPerServingKg × headCount) × (1 + wasteFactor)
```

- `wasteFactor` from `ingredients/{id}` takes precedence over the BOM-level value
- `menus/{id}.ingredients[]` is the BOM — each item has `ingredientId`, `quantity`, `unit`, `wasteFactor`
- `inventory/{id}.currentStock` is always in kg

## Routing

`App.tsx` — `BrowserRouter`. `/share/:orderId` is public (`ShareOrderPage`);
everything else is auth-protected inside `AppLayout`.

The home page `/` is `DayStartPage` (Feature 044「今日開工」) — a wizard that
picks dishes (manual or cost/inventory-ranked via
`calculateCostAwareMenuSuggestion`) and runs `dayStartService.runDayStart()`,
which sequences the whole chain through the existing create functions:
菜單(`/recipe-menus`) → 備料快照(`/prep-plans`) → 採購需求草稿
(`/purchase-demand-drafts`) → 製程規劃+任務草稿(`/production-workflows`) →
排程建議(`/production-schedules`).

Sidebar (AppLayout) shows three primary groups — 每天用這裡（`/`、
`/daily-ops`、`/week-plan`）、菜與食材（`/recipes`、`/ingredients-master`、
`/menu-import`）、買與存（`/purchase`、`/inventory`、`/market-prices`）—
plus a collapsed 進階功能 group holding the chain detail pages
(`/dashboard`, `/recipe-menus`, `/menu-drafts`, `/menu-suggestions`,
`/prep-plans`, `/purchase-demand-drafts`, `/production-workflows`,
`/production-schedules`, `/analytics`)，另有 `/kitchen-settings`
（設定群組，Feature 049 排程參數）。

## Netlify Functions

Located at `catering-system/netlify/functions/` (see Repository Layout note above on why this isn't a repo-root `netlify/` folder).

`ocr-menu.ts` — proxies photo uploads to Gemini Vision (`gemini-2.0-flash`).
- Input: `POST { imageBase64: string }` (raw base64, no `data:` prefix; browser pre-compresses to ≤ 1200px JPEG)
- Output: `{ rows: [{ date, headCount, dishes[] }] }`
- **Unauthenticated and billable.** Netlify Functions are public by default, so every
  accepted request spends `GEMINI_API_KEY` quota. Guards: `MAX_BASE64_CHARS = 4_000_000`
  (~3 MB decoded → 413), base64 format check (→ 400), and upstream errors are logged
  server-side but returned as a bare `502` so Gemini/quota internals don't leak. There is
  **no rate limit** — a stateless function has nowhere to keep per-caller state; if abuse
  shows up in Gemini billing, Netlify Edge or an external store is the next lever.
- ⚠️ **Currently has no caller** — nothing in `src/` fetches `/.netlify/functions/ocr-menu`
  (only `market-price` is wired up). It is deployed and reachable regardless, which is why
  it is hardened rather than left alone; decide whether to wire it into the menu-import flow
  or delete it.

`market-price.ts` — proxies Taiwan MOA AMIS wholesale produce price open data.
- Input: `POST { date: "YYYY-MM-DD", cropNames: string[] }`
- Output: `{ date, rocDate, prices: [...], warnings: [...] }`

Both:
- Dependencies in `catering-system/package.json` — `@google/generative-ai` (runtime, ocr-menu) + `@netlify/functions` (types only, devDependency)
- Build: esbuild (configured in `netlify.toml`)

## Git Branches

- Production (Netlify): `claude/fervent-dirac-HJT01` — the only long-lived branch.
- Development: a per-task `claude/<name>` branch, currently
  `claude/kitchen-mgmt-system-dev-kbo4ac`. The name churns, so **don't hard-code it**
  anywhere. (`claude/admiring-feynman-8LwF5` was listed here for a long time after it
  went stale — it is now 112 commits behind production; `.github/workflows/ci.yml` had
  the same stale name in its push trigger, so pushes to the real dev branch never ran
  push-CI. Both are fixed: the workflow's push trigger now lists production only, and
  `on: pull_request` — which has no branch filter — covers every feature branch.)

Push to a dev branch; open a PR targeting production to trigger Netlify deployment.
