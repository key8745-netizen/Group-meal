# Feature 038: 每日工作總覽 (Daily Ops Cockpit)

## Purpose

A single read-only page (`/daily-ops`) that shows, for a chosen date, the
status of the whole operating chain:

菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市場行情

Each step surfaces a status, short detail lines, and (when incomplete) a
next-action hint linking into the relevant feature page. It aggregates
existing collections — it does not introduce any new data.

## Status semantics

| Step | `na` when | `missing` when | `partial` when | `done` when |
|---|---|---|---|---|
| 當日菜單 (`menu`) | — | 0 menus for the date | — | ≥1 menu for the date |
| 備料快照 (`prepPlan`) | no menu | 0 prep plans for the date | — | ≥1 prep plan for the date |
| 採購需求草稿 (`purchaseDraft`) | no prep plan | 0 linked drafts | linked drafts exist but all `workflowStatus === 'cancelled'` | ≥1 linked, non-all-cancelled draft |
| 製程規劃 (`workflowPlan`) | no prep plan | 0 linked plans | linked plan(s) exist but none has ≥1 active task | ≥1 linked plan with ≥1 active task |
| 排程建議 (`scheduleSuggestion`) | no workflow plan with active tasks | 0 suggestions for those plans | — | ≥1 suggestion found |
| 市場行情 (`marketPrice`) | never (informational) | snapshot is null or has 0 entries | — | snapshot has ≥1 entry |

`nextActionHint` is non-null only for `missing`/`partial` statuses.

## Linking heuristics

- `RecipeMenu.date === date` selects the day's menus.
- `PrepPlan.date === date` selects the day's prep plans (the caller already
  filters by date; `sourceRecipeMenuId` traceability is inherited from
  Feature 013 but not re-validated here).
- `PurchaseDemandDraft.sourcePrepPlanId ∈ {day's PrepPlan ids}` links drafts.
- `ProductionWorkflowPlan.sourcePrepPlanId ∈ {day's PrepPlan ids}` OR
  `ProductionWorkflowPlan.serviceDate === date` links workflow plans (either
  condition is sufficient, since some plans may predate `serviceDate` being
  set).
- `ProductionScheduleSuggestion.sourceProductionWorkflowPlanId ∈ {linked
  workflow plans with ≥1 active task}`; only the latest suggestion per plan
  (via `listProductionScheduleSuggestions()[0]`, already ordered
  newest-first) is used.
- `MarketPriceSnapshot` is looked up directly by doc id `date` — no linkage
  needed, it is a daily cache keyed by date.

## Read-only guarantee

This feature performs **no writes**. It defines no new Firestore
collection and requires no `firestore.rules` changes — it only reads
existing collections (`recipeMenus`, `prepPlans`, `purchaseDemandDrafts`,
`productionWorkflowPlans`, `productionScheduleSuggestions`, `marketPrices`)
via their existing `list*`/`get*` functions. The page renders links, not
action buttons.

## Bounded reads

`loadDailyOpsOverview` calls each collection's existing `list*` function
once (no new indexes/queries), filtering in memory. Schedule-suggestion
reads are the one per-record fan-out (`listProductionScheduleSuggestions`
per matched plan) and are capped at 5 plans (`MAX_SCHEDULE_PLAN_READS`) to
bound the number of reads. Each source load is wrapped in try/catch — a
failure degrades that source to empty/null and appends a `載入失敗：…`
detail line instead of throwing the whole page down.

## Out of scope

- No cross-day range view (single date only, no calendar/week rollup).
- No notifications or alerting.
- No auto-fixing / auto-creating of missing steps — hints only link to the
  existing feature pages where a human takes the next action.
