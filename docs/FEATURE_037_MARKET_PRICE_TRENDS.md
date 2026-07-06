# Feature 037: 市價趨勢與採購時機建議

## Purpose

Turns the daily `/marketPrices/{date}` cache (Feature 032/035) into a
30-day price trend per tracked crop and a simple buy-timing signal, so
staff can see at a glance whether today's price is unusually low (good
time to buy) or unusually high (worth waiting) without eyeballing the raw
table history.

## Data Source

No new collection, no new Firestore rules. Reads the existing
`marketPrices/{date}` docs (doc ID = ISO date, each with `entries:
MarketPriceEntry[]`) that already accumulate one per day as
`MarketPricePage` auto-refreshes. `listRecentMarketPriceSnapshots(db,
days)` queries `where('date', '>=', cutoff) orderBy('date', 'asc')` — a
single-field where+orderBy on `date`, so no composite index is needed.
`days` is capped at 60; the UI requests 30.

## Trend & Signal Math (`buildCropTrends`, pure)

Per crop, independently: sort all snapshots ascending by date, collect one
`{ date, avgPrice }` point per day with a non-null `avgPrice` for that crop
(missing/null days skipped, not zeroed). `periodMin`/`periodMax` cover all
collected points. `sevenDayAvg` is the mean of points strictly after
`latestDate − 7 days` (string date math via `Date`) — the trailing week
ending on the latest day, inclusive; older points still count toward
`periodMin`/`periodMax`/`points` but not `sevenDayAvg`. `changePct =
round1((latest − sevenDayAvg) / sevenDayAvg × 100)`, null if no
`sevenDayAvg` or it's `0`. **Signal:** `noData` if <2 points or no
`changePct`; `goodBuy` if `changePct <= -10`; `wait` if `changePct >= +10`
(both inclusive); else `normal`. `signalNote` is a zh-TW sentence with the
actual numbers. Money rounds to 2dp, percentages to 1dp. Output order
follows the input `cropNames` order regardless of snapshot order.

## UI (`MarketPricePage.tsx` + `CropTrendCard.tsx`)

Below the existing today's-price table, a `市價趨勢（近 30 天）` section
loads `listRecentMarketPriceSnapshots(db, 30)` once on mount, independent
of the page's today-snapshot state, with its own try/catch (failure shows
a small "載入趨勢失敗" note, never blocks the rest of the page). One
`CropTrendCard` (`src/components/marketPrices/CropTrendCard.tsx`) per
tracked crop: a small recharts `LineChart` of `avgPrice` over `date`
(minimal/hidden axes, same `ResponsiveContainer`/`Tooltip` conventions as
`Analytics.tsx`), a stats line (最新 / 近7日均 / 區間), and a signal badge
(goodBuy=green 適合採購, wait=amber 建議觀望, normal=neutral 價格平穩,
noData=muted 資料不足) plus `signalNote`. If fewer than 2 total cached
days exist, shows one explanatory line instead of degenerate charts.

## Out of Scope

No forecasting/predictive modeling (same-range latest-vs-trailing-7-day
comparison only); no auto-purchasing or purchase-order integration; no
historical backfill of AMIS data — trends only grow as `MarketPricePage`
is opened day over day and new `marketPrices/{date}` docs accumulate.
