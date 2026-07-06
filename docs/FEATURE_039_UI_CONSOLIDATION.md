# Feature 039: 介面整併與舊管線退役 (UI Consolidation & Legacy Pipeline Retirement)

Owner-approved 2026-07-06 (ibi). UI-surface work only — no Firestore schema,
security rule, or service-layer changes.

## What was removed

**Legacy pages (Part A, unused old menus/orders pipeline):**
- `/orders` — `OrderEntry.tsx` (nav 訂單管理)
- `/share/:orderId` — `share/ShareOrderPage.tsx` (public share page, read `purchaseOrders`)
- `/menus` — `MenusPage.tsx` (nav 菜單管理; tabs 今日備料/每月計畫/菜色管理/匯入菜單/菜名比對審核)
- `/plan` — `PlanPage.tsx` (nav 備料規劃)
- Page-exclusive components removed with them: `components/menus/*` (4 files),
  `components/menuMatching/*` (5 files), `ProductionPlanner.tsx`,
  `PurchaseSuggestionCard.tsx`.
- `日常作業` nav section now holds only `每日工作總覽` (kept per spec).

**產能評估 (Part B, superseded by 生產排程):**
- `/capacity-feasibility` — `CapacityFeasibilityPage.tsx` + its 3 exclusive
  `components/capacityFeasibility/*` components.
- `ProductionSchedulePage.tsx` now notes the merge under its header.
- `capacityFeasibilityService.ts` and its types/tests are **untouched** —
  historical `capacityFeasibilityChecks` records remain readable.

**Menu suggestion pages merged (Part C):**
- `/menu-mix-recommendations` (`MenuMixRecommendationPage.tsx`) and
  `/cost-menu-suggestions` (`CostAwareMenuSuggestionPage.tsx`) → single
  `/menu-suggestions` (`MenuSuggestionsPage.tsx`), nav label `菜單建議`.
- Content moved unchanged into `components/menuSuggestions/MenuMixTab.tsx`
  and `CostAwareTab.tsx` (only each page's own title header was stripped).

## Data preservation guarantee

Firestore collections, documents, and security rules are untouched. `orders`,
`menus` (dish/menu docs), `mealPlans`, `purchaseOrders`, and all suggestion
collections (`capacityFeasibilityChecks`, `menuMixRecommendations`,
`costAwareMenuSuggestions`) keep their existing data — only the UI routes
that surfaced them were removed or merged. `orderService.ts` and the
`ocr-menu` Netlify function are now **dormant** (no UI caller) but kept, since
they guard data/API surface.

## Redirect table

| Old path | New path |
|---|---|
| `/menu-mix-recommendations` | `/menu-suggestions` |
| `/cost-menu-suggestions` | `/menu-suggestions?tab=cost` |
| `/orders`, `/share/:orderId`, `/menus`, `/plan`, `/capacity-feasibility` | removed, no redirect (owner-confirmed unused) |

## Known follow-up (not in scope, flagged for owner)

- `PurchaseOrderList.tsx`'s "分享" button (inside kept `/purchase` page)
  still builds a link to `/share/:orderId`, which no longer resolves.
- `Dashboard.tsx` quick actions still `navigate('/orders')` / `navigate('/plan')`.
  Both pages were explicitly out of scope ("keep untouched") for this feature.

## Rollback

`git revert` the consolidation commit restores all removed pages, nav items,
and routes; no data migration is involved either direction.
