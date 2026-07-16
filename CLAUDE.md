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
| `mealPlans` | `YYYY-MM-DD` | Daily menu schedule (menuIds + headCount) |
| `settings` | tenantId | System thresholds (configService) |

### Service Patterns

Two patterns exist — do not mix them:

1. **Module-level `db`** — services that import `db` from `@/lib/firebase` directly:
   `purchaseOrderService`, `mealPlanService`, `dishService`, `configService`, `InventoryAudit`, `ManualPurchaseForm`

2. **`db: Firestore` parameter** — services designed for both browser and scripts:
   `inventoryService`, `purchaseService`, `performanceService`, `recipeMatchingService`

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

## Unit Conversion

Two converters exist for historical reasons:

- `src/services/unitConverter.ts` → `UnitConverter` class — handles kg / g / 台斤 / L / piece; used by order/purchase/recipe services
- `src/utils/unitConverter.ts` → `toTaijin(kg)` / `toKg(taijin)` — simple 2dp kg↔台斤; used by UI components and scripts

**1 台斤 = 0.6 kg**. All internal storage is in **kg**.

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
- Input: `POST { imageBase64: string }` (browser pre-compresses to ≤ 1200px JPEG)
- Output: `{ rows: [{ date, headCount, dishes[] }] }`

`market-price.ts` — proxies Taiwan MOA AMIS wholesale produce price open data.
- Input: `POST { date: "YYYY-MM-DD", cropNames: string[] }`
- Output: `{ date, rocDate, prices: [...], warnings: [...] }`

Both:
- Dependencies in `catering-system/package.json` — `@google/generative-ai` (runtime, ocr-menu) + `@netlify/functions` (types only, devDependency)
- Build: esbuild (configured in `netlify.toml`)

## Git Branches

- Development: `claude/admiring-feynman-8LwF5`
- Production (Netlify): `claude/fervent-dirac-HJT01`

Push to the dev branch; open a PR targeting production to trigger Netlify deployment.
