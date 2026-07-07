# Feature 042: 配方草稿自動建立

## Purpose

After importing a monthly menu (Feature 023) and seeding common ingredients
(Feature 041), the owner has dish names but zero recipes and doesn't want to
type them by hand. This feature generates rough-but-editable recipe drafts
from dish names — curated templates first, name-based ingredient inference
as fallback. 先求有 — the owner fine-tunes afterwards.

## Matching pipeline

For each distinct dish name (normalized, deduped), in priority order:

1. **Template match** — exact match against a curated template's `dishName`
   or one of its `aliases` (`src/constants/recipeSeedTemplates.ts`). Each
   BOM line is resolved against the ingredient master by normalized name;
   an unresolvable line (e.g. the ingredient was deactivated or renamed) is
   dropped with a note. If *every* line drops, the dish is demoted to step 2.
2. **Inference** — scans the dish name for ingredient mentions: candidate
   keywords are every ingredient master name plus every key of
   `DISH_NAME_INGREDIENT_ALIASES`. Matching is longest-keyword-first with
   each matched span consumed, so e.g. 洋蔥 consumes 蔥 and 紅蘿蔔 maps to
   胡蘿蔔 rather than partially matching 蘿蔔/白蘿蔔. Matches are deduped, in
   order of first appearance.
3. **Unmatched** — no template hit and no ingredient keyword found anywhere
   in the dish name.

Dishes whose normalized name already matches an existing recipe are skipped
before any matching runs.

## Grams-by-category (inference only; templates specify their own grams)

| Category | Grams/serving |
|---|---|
| 葉菜類 | 100 |
| 根莖類 | 80 |
| 瓜果類 | 80 |
| 豆菜類 | 60 |
| 辛香類 | 5 |
| 菇蕈類 | 30 |
| 水果類 | 150 |
| 肉類 | 70 for the first matched meat in a dish, 40 for each additional one |
| 蛋豆製品 | 60, except 雞蛋 which is 50 |
| 米麵乾貨 | 100 |
| (unknown category) | 50 |

## Draft semantics

- Created recipes always have `isActive: true` and a `notes` field starting
  with `自動產生配方草稿（範本 / 菜名推定），請人工確認食材與份量` — clearly
  marking them as unreviewed drafts.
- Never overwrites an existing recipe — a dish with a same-named recipe is
  reported under `skippedExisting`, not recreated.
- Creation goes strictly through `recipeService.createRecipe()`, one write
  per dish, sequential — so every draft passes the same security-rule
  validation and gets the same audit fields as a manually entered recipe.

## Read-only wrt menu import staging

Only reads `menuImportBatches` (via `menuImportService.listBatches`/`listItems`,
wrapped as `listImportBatchesLite`/`listBatchDishNames`); never writes to it.

## Out of scope

- No AI/LLM calls — matching is deterministic string/keyword logic only.
- No automatic linking of generated recipes back into `recipeMenus` — the
  owner still builds/finalizes menus separately.
- No nutrition data, cost estimation, or supplier assignment on drafts.
