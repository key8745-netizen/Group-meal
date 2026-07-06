# Feature 041: 常用食材一鍵建檔

## Purpose

New tenants start with an empty `ingredients` master collection and would
otherwise have to type ~70 common catering ingredients by hand before any
other feature (menus, inventory, purchasing) becomes usable. This feature
adds a single button on 食材主檔 (`/ingredients`) that seeds a curated set of
common ingredients in one click.

## Dataset provenance

The template set lives in `src/constants/ingredientSeedTemplates.ts` and is
curated in-repo, not fetched from any API. Each entry follows AMIS (農業部
農產品交易行情站) naming conventions for its `marketCropName` (e.g. 高麗菜 →
甘藍, 地瓜葉 → 甘藷葉) so that Feature 032's 市場行情 lookup can match it by
substring against upstream AMIS crop names. `defaultPrice` is a rough NT$/kg
reference price, not a live quote.

Correctness of the AMIS mapping is **not** guaranteed a priori — it is
verified live, per item, by running 市場行情 → 更新市價 after import. Any item
that comes back with no market data has an incorrect or unmapped
`marketCropName` and should be corrected individually on 食材主檔 (editing the
ingredient's 市場作物名稱 field). Meat, staples, and egg/soy products are
intentionally excluded from market mapping (`marketCropName` omitted) since
they fall outside AMIS's wholesale produce price scope.

## Duplicate / skip semantics

`ingredientSeedService.planSeedImport(existing, templates)` is a pure
function that decides, for each template, whether to create it or skip it:

- Skipped if its normalized name (`normalizeIngredientName()` — the same
  helper `ingredientMasterService.createIngredient()` uses to compute
  `normalizedName`) matches an already-existing ingredient's normalized name.
- Skipped if it duplicates an earlier template in the same template list
  (defensive; the shipped dataset has none, verified by a test).
- Otherwise added to `toCreate`, in template order (deterministic).

Nothing is ever updated or overwritten — a name match always means "skip",
never "merge" or "replace".

## Sequential create-through-service guarantee

`ingredientSeedService.runSeedImport(db, plan, uid, onProgress)` creates each
planned template **one at a time**, via the existing
`ingredientMasterService.createIngredient()` — the same function the manual
"新增食材" form calls. This means:

- Every imported ingredient passes the exact same Firestore rules validation
  as a manually entered one (no rule changes were needed or made).
- Every imported ingredient gets the same audit fields
  (`createdAt`/`createdBy`/`updatedAt`/`updatedBy`, `normalizedName`) computed
  the same way.
- No direct batch writes to Firestore are used. A failure on one item is
  caught and recorded in `SeedImportResult.failed`; the loop continues to the
  next item rather than aborting the whole run.

## UI flow

On 食材主檔, a `匯入常用食材範本` button opens `SeedImportDialog`, which:

1. Runs `planSeedImport` against the page's already-loaded ingredient list.
2. Shows a preview: 將新增 N 筆 / 已存在略過 M 筆, grouped by category, each
   item showing its 基準價 and either an AMIS 對應 badge or a 無市價對應 note.
3. On `開始匯入`, runs `runSeedImport` with progress reporting (`n/total`).
4. Shows a result summary: 成功 X・略過 M・失敗 Z with failure reasons.
5. Refreshes the page's ingredient list on close after a successful run.

If every template already exists, the dialog shows 範本食材皆已存在，無需匯入
and disables the confirm button.

## Out of scope

- No update/overwrite of existing ingredients — a name match is always a
  skip, never a merge.
- No price sync into `defaultPrice` after import — that stays a static
  reference value until manually edited or until a future feature wires it to
  market price refresh.
- No market-crop mapping for meat, staples, or egg/soy products — those
  categories are outside AMIS's wholesale produce price scope by design.
