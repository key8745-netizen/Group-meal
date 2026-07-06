# Feature 036: 製程任務自動草稿（備料快照 → 製程規劃）

## Purpose

Closes the gap between 備料快照 (`prepPlans`) and 製程規劃
(`productionWorkflowPlans`): clicking **自動產生任務草稿** generates a
first-pass task list from the plan's source prep plan for human review
before saving. This is a **draft generator only**, not a final labor plan.

## Template Table (`workflowTaskDraftService.ts`)

Matched by keyword `includes` on `IngredientMaster.category`. All minutes
are **editable heuristic defaults for human adjustment**, not authoritative:

| Category keywords | Steps (equipment, base + per-kg min, role) |
|---|---|
| 蔬/菜/葉 | wash (sink, 5+2/kg, 助手) → cut·slice (cuttingStation, 5+4/kg, 助手) |
| 肉/雞/豬/牛/魚/海鮮 | cut·slice (cuttingStation, 5+5/kg, 廚師) → marinate (prepTable, 10+2/kg, 廚師) |
| 乾貨/調味/米/麵 | portion (prepTable, 3+1/kg, 助手) |
| unknown/missing category, or ingredient not in master data | fallback: same as 蔬/菜/葉 chain, + a note naming the ingredient |

One **cook task** per distinct recipe in `recipeContributions`:
`烹調：{recipeName}`, `cook`/`stirFry`(placeholder, flagged for
verification)/`wok`, minutes = `max(15, round(15 + 0.05 × sourceServings))`.

## Generation Rules

- `quantityKg = requiredBaseQuantity / 1000` for `baseUnit` `g`/`ml` (ml
  approximated as 1ml≈1g, noted); `0` for `pcs` (fixed minutes only, noted).
- `estimatedMinutes = max(1, round(baseMinutes + minutesPerKg × quantityKg))`.
- Steps within one ingredient chain are sequential (`dependsOnTaskIds` of
  step N = `[step N-1's id]`); a recipe's cook task depends on the **last
  step of every ingredient chain** contributing to it (deduplicated).
- Deterministic order: prep-plan item order, then step order; all prep
  tasks precede cook tasks; cook tasks ordered by `recipeNameSnapshot`
  (`localeCompare('zh-TW')`).
- Ids are `draft-{n}` (skips collisions with `existingTaskIds` and
  already-generated ids) — chosen over the manual editor's
  `crypto.randomUUID()` to keep the generator pure/reproducible for tests;
  task ids are opaque strings with no format validation, so this has no
  user-visible effect.
- `sequence` continues from `existingTaskIds.length` (the function has no
  visibility into existing tasks' real `sequence` values — assumes
  contiguous 1..N numbering, matching normal editor usage).
- `sourcePrepPlanItemId = ${ingredientId}__${baseUnit}`, matching
  `prepPlanService`'s internal aggregation key.
- Every task: `taskStatus: 'active'`, `staffCount: 1`,
  `notes: '自動產生草稿，請人工確認'`; prep steps `canRunInParallel: true`,
  cook tasks `false`.
- `generationNotes` opens with `"{n} 食材 → {m} 任務"` and closes with
  `"自動產生僅為草稿，工時與製程請人工確認後儲存。"`.

## Pure / No-Schema-Change Guarantee

`generateTaskDraftsFromPrepPlan` is pure — zero Firestore access. The UI
(`ProductionWorkflowTaskList`) loads the prep plan (`getPrepPlan`) and
ingredients (`listIngredients`), runs the generator, and **appends** the
result into the editor's local unsaved `pendingTasks` state — it never
calls `updateProductionWorkflowPlan` itself. The user reviews the tasks
(marked "未儲存草稿") and notes panel, then presses **儲存草稿任務**
(reuses the plan's existing `onSaveTasks` save path) or **捨棄草稿**. No
new Firestore collection, no rules change, no change to
`productionWorkflowService.ts` write paths.

## Out of Scope

- No auto-save — nothing persists without an explicit human save action.
- No AI/ML estimation — minutes are a fixed linear heuristic, not learned.
- No per-tenant template customization UI — templates are code constants.
