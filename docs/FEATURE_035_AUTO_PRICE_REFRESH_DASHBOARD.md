# Feature 035: 每日市價自動更新與儀表板智慧卡片

## Purpose

Removes the manual step of clicking "更新市價" before seeing today's
wholesale prices, and surfaces the three most recent cross-feature
intelligence artifacts (market prices, cost-aware menu suggestions,
production schedule suggestions) on the Dashboard as read-only cards.

## Staleness Rule (`shouldRefreshSnapshot`, pure)

A cached `/marketPrices/{date}` snapshot is stale when there is at least
one tracked crop name (`ingredients[].marketCropName`) that the snapshot's
`entries[]` does not cover. Compared as sets — extra cached entries for
crops no longer tracked are fine, and order doesn't matter. An empty crop
list is never stale (nothing to fetch). A `null` snapshot is always stale
when there is something to track.

## Auto-Refresh (`ensureTodayMarketPrices`)

Derives "today" from local (browser) time via `todayLocalIsoDate` — kept
in `marketPriceService.ts` so both the manual "更新市價" button and the
auto-refresh path key the cache under the same date string. Reads the
existing snapshot; if `shouldRefreshSnapshot` says it's current, returns it
as-is; otherwise calls `fetchAndCacheMarketPrices`.

**Best-effort, never throws.** Any read or fetch failure (network,
Netlify function error, permissions) falls back to whatever snapshot
(possibly `null`) was already available — callers render partial/stale
data rather than breaking. `MarketPricePage` calls this on mount (showing
"自動更新今日市價中…" while it runs) and still exposes the manual button,
which continues to call `fetchAndCacheMarketPrices` directly to force a
refresh regardless of staleness.

## Dashboard Cards (`src/components/dashboard/`)

All three are read-only, each wrapped in its own `try/catch` so one
failure (e.g. a missing Firestore index) shows "載入失敗：<message>"
without blanking the rest of the dashboard:

- **MarketPriceCard** (今日市場行情, → `/market-prices`) — reuses the
  ingredient docs Dashboard already loads (cast to `IngredientMaster`, no
  extra query), calls `ensureTodayMarketPrices`, shows tracked/priced
  counts and up to 3 biggest movers vs `pricePerKgFromDefault`. Empty
  state: 尚未設定市場作物對應.
- **CostAwareMenuCard** (性價比菜單 Top 3, → `/cost-menu-suggestions`) —
  `listCostAwareMenuSuggestions(db)`, takes the first (newest) record, shows
  its top 3 items (already best-first by `valueScore`). Empty state:
  尚無建議紀錄.
- **ProductionScheduleCard** (最新生產排程, → `/production-schedules`) —
  `listProductionScheduleSuggestions(db, planId)` is scoped to one plan, so
  this card queries `productionScheduleSuggestions` directly
  (`orderBy('createdAt','desc'), limit(1)`) instead — the existing service
  file is untouched. Shows plan name, status badge (fits=可完成 /
  overrun=超時 / infeasible=無法排入), makespan, created time. Empty state:
  尚無排程建議.

## Out of Scope

- No scheduled/server-side cron job — refresh is client-triggered on first
  page visit (Dashboard or MarketPricePage) each day, not on a timer.
- No new Firestore collections or security rules; all reads use existing
  collections and existing rules.
- No write path changes — every card and the auto-refresh helper are
  read-only against already-immutable/cache collections.
