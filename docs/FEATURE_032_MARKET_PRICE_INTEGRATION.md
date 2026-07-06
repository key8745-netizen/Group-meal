# Feature 032: 果菜市場市價整合 (Wholesale Produce Market Price Integration)

## Purpose

Lets purchasing staff compare an ingredient's 基準價 (baseline price, derived
from its `defaultPrice`) against today's actual wholesale market price from
Taiwan's MOA AMIS open-data API, to spot ingredients that are unusually
expensive/cheap on a given day. Manual/on-demand only — no automation.

## Collection Schema

`/marketPrices/{date}` — doc ID = ISO date `"YYYY-MM-DD"`. One shared cache
document per day, refreshed on demand by any authenticated staff member.

```ts
interface MarketPriceEntry {
  cropName: string;             // as queried (matches ingredient.marketCropName)
  avgPrice: number | null;      // quantity-weighted avg NT$/kg; null = no data
  minPrice: number | null;
  maxPrice: number | null;
  totalQuantity: number;
  marketCount: number;          // number of market rows aggregated
  sampleCropNames: string[];    // up to 5 distinct upstream CropName matches
}

interface MarketPriceSnapshot {
  id: string;
  date: string;
  rocDate: string;
  entries: MarketPriceEntry[];
  warnings: string[];           // crop names that failed to fetch upstream
  fetchedAt?: Timestamp;
  fetchedBy: string;
}
```

`ingredients/{id}` gains one additive optional field: `marketCropName?: string
| null` — the crop name used to match against AMIS (substring match upstream).

## Function Contract — `netlify/functions/market-price.ts`

`POST { date: "YYYY-MM-DD", cropNames: string[] }` (max 30, non-empty strings).

- Converts date to ROC (`YYY.MM.DD`), fetches
  `https://data.moa.gov.tw/api/v1/AgriProductsTransType/` per crop, chunked to
  5 concurrent requests, 10s timeout each (`AbortController`).
- Aggregates rows with `Avg_Price > 0` only (no-trade days report 0/null):
  quantity-weighted mean of `Avg_Price` (fallback to simple mean if all
  quantities are 0/missing), plus min/max/totalQuantity/marketCount.
- `200 { date, rocDate, prices: MarketPriceEntry[], warnings: string[] }` —
  `warnings` lists crop names whose upstream fetch failed (network error,
  timeout, non-"OK" `RS`, or malformed body); those crops are omitted from
  `prices` rather than included with `avgPrice: null`.
- `502` (plain text) only when **every** crop's upstream fetch failed.
- `400` (plain text) on invalid input; `405` on non-POST.
- Zero new npm dependencies; uses the Node 18+ global `fetch`.

## Upstream API Note

`data.moa.gov.tw` is **network-blocked from this cloud dev environment**, so
the upstream call was never live-tested here — only the parsing/aggregation
logic (`aggregateAmisRows` in `src/services/marketPriceService.ts`, mirrored
by a duplicate implementation inside the Netlify function since functions
cannot import from `src/`) is unit-tested, with hand-constructed row fixtures
covering weighted averages, the zero-quantity fallback, and `Avg_Price <= 0`
filtering.

## Security Rules Decision

`marketPrices/{date}`: `read`/`create`/`update` all require only
`isAuthenticated()` (no `isPurchasingStaff()` gate) — this is a shared,
non-sensitive daily price cache that any staff member may legitimately
refresh before a purchasing decision, not a system-of-record. `delete` is
always `false`. `date`/`rocDate` are immutable on update (cache-key
invariant); `fetchedBy` must equal `request.auth.uid`.

`ingredients/{id}`: `marketCropName` was added to `ingredientAllowedFields()`
and to `validIngredientCommon()` (optional string/null, same pattern as
`supplierId`) — write access remains gated by `isPurchasingStaff()`, unchanged
from the rest of the ingredient master-data fields.

## Out of Scope

- No automatic purchasing decisions or purchase-order generation from price
  deltas.
- No price history charts/trends — only today's snapshot is shown.
- No writes to `ingredients` beyond the new optional `marketCropName` field.
- No changes to existing unit-conversion (`unitConverter.ts`) logic — market
  prices are compared purely in NT$/kg via the new `pricePerKgFromDefault()`
  helper.

## Runtime Verification Pending

The upstream AMIS API call in `netlify/functions/market-price.ts` can only be
exercised once deployed to Netlify (`claude/fervent-dirac-HJT01` production
branch or a Netlify deploy preview) — this dev environment cannot reach
`data.moa.gov.tw`. Before relying on this in production, manually verify:
1. A real `POST /.netlify/functions/market-price` call with a known crop name
   (e.g. `甘藍`) for a recent date returns non-null prices.
2. The 10s per-request timeout and 5-way chunking behave reasonably under a
   30-crop request.
3. The `市場行情` page's 更新市價 button round-trips correctly against a live
   Firestore `group-meal` database.
