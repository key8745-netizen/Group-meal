# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Completed Features

* Feature 010: Ingredient Master Data Management 食材主檔管理 — COMPLETED / DEPLOYED / VERIFIED
  - Implementation commit: `c5edd62`
  - Production PR #29 merged; 食材主檔 verified visible by ibi

* Feature 011: Recipe Ingredient Linking 菜色 / 配方引用食材主檔 — COMPLETED / DEPLOYED / VERIFIED
  - Implementation commit: `227c3d7`
  - Cherry-pick commit: `1f4416a`
  - SSOT commit: `a63fd04`
  - Production PR #31 merged, merge commit `2081c496091f0c41e017fa1be00999ce5c865306`
  - 配方管理 verified visible and usable by ibi

* Feature 012: Menu Recipe Linking 菜單引用配方 — COMPLETED / DEPLOYED / VERIFIED
  - Implementation commit: `f53be0d`
  - Cherry-pick commit: `ba90ad3`
  - SSOT docs-only commit: `8291590`
  - Production PR #33 merged, merge commit `39a54c8be62ea8d552dc261f60e140f3c3ed724e`
  - Actual collection path: `/recipeMenus/{menuId}`
  - Actual route: `/recipe-menus`
  - Actual nav label: `菜單配方`
  - 菜單配方 verified visible and usable by ibi

* Feature 013: Prep Planning from Recipe Menus 備料規劃引用菜單配方 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.0: PASSED
  - Implementation Plan v1.1: PASSED
  - Implementation commit: `e983259`
  - Cherry-pick commit: `00df560`
  - SSOT docs-only commit: `aa43ae5`
  - Production PR #35 merged, merge commit `b36922fa47024254df182bdaddb48f602ba77e3c`
  - Actual collection path: `/prepPlans/{prepPlanId}`
  - Actual route: `/prep-plans`
  - Actual nav label: `備料快照`
  - 備料快照 verified visible and usable by ibi

* Feature 014: Purchase Demand Draft from Prep Plans 備料快照產生採購需求草稿 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.0: PASSED
  - Implementation Plan v1.1: PASSED
  - Implementation commit: `06459b3`
  - SSOT docs-only commit: `a335922`
  - Cherry-pick commit: `71cdd0a`
  - Production PR #36 merged, merge commit `6d18d906b3f9b2fa3d9977c3861cb04c9602678f`
  - Actual collection path: `/purchaseDemandDrafts/{draftId}`
  - Actual route: `/purchase-demand-drafts`
  - Actual nav label: `採購需求草稿`
  - Source dependency: `/prepPlans/{prepPlanId}` read-only
  - No PO creation, no procurement automation, no inventory write/deduction
  - 採購需求草稿 verified visible and usable by ibi

* Feature 015: Navigation Information Architecture Cleanup 左側選單資訊架構整理 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.1: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `19ceef4`
  - Cherry-pick commit: `b9ea36a`
  - SSOT commit: `7b58109`
  - Production PR #38 merged, merge commit `17ddefb27c3829855bc62d1a9c641bde50326f54`
  - Sidebar nav grouped into 7 sections
  - All existing routes preserved
  - Navigation grouping verified visible and usable by ibi

* Feature 016: Purchase Demand Draft Export / Print View 採購需求草稿匯出 / 列印檢視 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.1: PASSED
  - Implementation Plan v1.0: CONDITIONAL PASS
  - Implementation commit: `3366bfcc62c7857de2ae739c496e921c8be98351`
  - Production PR #40 merged, merge commit `d452ede37e0b2d4c04d6ccf863cc6916e183a268`
  - Added per-draft CSV export and print view for purchase demand drafts only
  - No Firestore rules, service, data model, PO, procurement automation, or inventory changes
  - Runtime verification PASSED

* Feature 017: Purchase Demand Draft Workflow Status 採購需求草稿人工流程狀態 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.2: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `755002c089a60a2a40d807d4dce1199a9209b10f`
  - Proposal commit: `b3bf2de04829bf1860afd3ec345778f9455e9825`
  - Production PR #41 merged, merge commit `9c3fbd1e9fe1d1749f65f9cabbbf20b5c015d234`
  - Adds independent `workflowStatus` to `purchaseDemandDrafts`
  - Existing archive semantics unchanged
  - No PO creation, no procurement automation, no inventory write/deduction
  - Runtime verification PASSED

* Feature 018: Kitchen Production Workflow Planning 廚房製程與產能資料地基 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.4: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `3edad4b0cacf2f0353d349c33e88abff0de3faee`
  - Patch commit: `40f1d981db5cd1beaf5fa028a7249fa710f81534`
  - Production PR #42 merged, merge commit `1b12dcb2db5496ce05a7f815164ecaa5b9a792d0`
  - Actual collection path: `/productionWorkflowPlans/{planId}`
  - Actual route: `/production-workflows`
  - Actual nav label: `製程規劃`
  - Saved tasks cannot be hard deleted; `taskStatus: 'archived'` is the only delete semantic
  - No AI, no auto scheduling, no timeline conflict detection, no gantt chart
  - No inventory, procurement, supplier, cost, PO
  - 製程規劃 verified visible and usable by ibi

* Feature 019: Production Capacity Feasibility Check 產能可行性評估 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.4: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `03df7bda88a76d715c77cd56b0a9b4e8b5194958`
  - Proposal commit: `f00c9ad928b0df739d621c78c86c732af1cab070`
  - Production PR #43 merged, merge commit `ee824be06519ba620fb2ebcc5094a0772780894b`
  - Final SSOT commit after verification: `090460ac70bf386e0beeac828a66f536996e05ee`
  - Actual route: `/capacity-feasibility`
  - Actual nav label: `產能評估`
  - Actual collection path: `/capacityFeasibilityChecks/{checkId}`
  - Create/read-only immutable assessment records
  - Uses `productionWorkflowPlans` active tasks only
  - No inventory, procurement, supplier, cost, PO, AI, auto scheduling, gantt, or precise timeline conflict detection
  - Runtime verification PASSED by ibi

* Feature 020: Menu Mix Recommendation 菜單組合建議 / 菜色比例建議 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.6: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `41c0bfb`
  - Patch commit: `934fc26`
  - Proposal branch: `feature020-only-proposal`
  - Production PR #45 merged, merge commit `630c827ee74c5d85b5625a08509265671a60cc52`
  - Actual route: `/menu-mix-recommendations`
  - Actual collection path: `/menuMixRecommendations/{recommendationId}`
  - Adds deterministic heuristic menu mix recommendation for manual reference only
  - Uses `ProductionWorkflowTask.recipeId` relation when available; missing metadata excludes recipes with `manualReviewNotes`
  - `maxFriedRatio` / `maxBakedRatio` are unenforceable warnings in v1 because current workflow metadata cannot reliably identify fried/baked semantics
  - Records are create/read-only; no update/delete behavior
  - No automatic order acceptance, no automatic menu creation, no recipeMenu write, no order write, no prepPlan write, no productionWorkflowPlan write
  - No inventory write/deduction, procurement automation, supplier automation, cost optimization, PO, AI recommendation, AI auto scheduling, gantt chart, precise timeline conflict detection, PDF/export/print, Netlify Functions, hard delete, or Feature 021
  - Runtime verification PASSED by ibi (`OK了`)

* Feature 021: Menu Mix Recommendation Approval & Draft Menu Creation 菜單組合建議審核與草稿菜單建立 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.4: PASSED
  - Implementation Plan v1.1: PASSED
  - Implementation commit: `d8c521f`
  - Patch commit: `8b97c39`
  - Proposal branch: `feature021-only-proposal`
  - Production PR #46 merged, merge commit `d508505acd5e7516f7de89bee58cb48419766bce`
  - Actual route: `/menu-drafts`
  - Actual nav label: `草稿菜單`
  - Actual collection path: `/menuDrafts/{draftId}`
  - Adds manual-only draft menu creation from `/menuMixRecommendations/{recommendationId}`
  - `createMenuDraftFromRecommendation` re-reads the source recommendation by `recommendationId` before writing the draft; UI preview data is not trusted as write source
  - Drafts are create/read-only; Firestore rules deny update/delete
  - Draft snapshots include source recommendation status, manual review notes, recipe name, serving count, ratio, process, and equipment
  - No recipeMenu write, order write, prepPlan write, productionWorkflowPlan write, purchaseDemandDraft write, inventory write/deduction, procurement automation, supplier automation, cost optimization, PO, AI recommendation, AI auto scheduling, gantt chart, precise timeline conflict detection, PDF/export/print, Netlify Functions, hard delete, or Feature 022
  - Runtime verification PASSED by ibi (`OK了`)

* Feature 022: Draft Menu Approval to RecipeMenu 草稿菜單審核與轉正式菜單 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.1: PASSED
  - Implementation Plan v1.1: PASSED
  - Implementation commit: `3aa5a86`
  - Proposal branch: `feature022-only-proposal`
  - Production PR #47 merged, merge commit `49968feb6cc76e5aaa7fbe9db0671f563233b8e1`
  - Actual route: `/menu-drafts`
  - Source collection path: `/menuDrafts/{draftId}`
  - Target collection path: `/recipeMenus/{draftId}` deterministic document ID
  - Adds manual-only approval flow from draft menu to official recipe menu
  - `createMenuFromApprovedDraft` re-reads the source draft by `draftId` before writing the recipe menu; UI state is not trusted as write source
  - Maps `DraftMenuItem.servingCount` to `RecipeMenuItem.servings`
  - Reuses active recipe validation before creating the recipe menu
  - `menuDrafts` remain immutable; no menuDraft update/delete is introduced
  - Firestore rules whitelist conversion fields and lock updates for recipeMenus created from `sourceMenuDraftId`
  - No order write, prepPlan write, productionWorkflowPlan write, purchaseDemandDraft write, inventory write/deduction, procurement automation, supplier automation, cost optimization, PO, AI recommendation, AI auto scheduling, gantt chart, precise timeline conflict detection, PDF/export/print, Netlify Functions, hard delete, or Feature 023
  - Runtime verification PASSED by ibi (`OK了`)

* Feature 023: Universal Monthly Menu Import Staging 通用月菜單匯入暫存與欄位對應 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.2: CONDITIONAL PASS
  - Implementation Plan v1.1: PASSED
  - Implementation commit: `4e2eeb812028b0f62281ba02c1207eb365e2e7e9`
  - Proposal branch: `feature023-only-proposal`
  - Production PR #49 merged, merge commit `d13ee86514cc14ef2c0532954dfacd869935820a`
  - Actual route: `/menu-import`
  - Actual nav label: `月菜單匯入`
  - Actual collection paths: `/menuImportBatches/{batchId}`, `/menuImportBatches/{batchId}/rows/{rowId}`, `/menuImportBatches/{batchId}/items/{itemId}`, `/menuImportColumnMappingTemplates/{templateId}`
  - Adds CSV-first monthly menu import staging layer only; XLS/XLSX parser is out of scope and no new dependency was introduced
  - Stores raw CSV row snapshots and parsed menu items in staging collections for manual review
  - Rows are write-once; `rawRowSnapshot` is immutable; `rawDishName` is immutable
  - `MatchStatus` is `unmatched` only; no confidence scoring, no `recipeId`, no dish matching, no AI
  - Finalized and archived batches lock rows/items and allow only defined status/audit transitions
  - No recipes, ingredients, recipeIngredients, recipeMenus, prepPlans, purchaseDemandDrafts, productionWorkflowPlans, orders, inventory, procurement, supplier, cost, PO, market price, export/print/PDF, Netlify Functions, or Feature 024/025 writes
  - Runtime verification PASSED by ibi (`OK了`)

* Feature 024: Dish-Name Matching and Proposed Recipe Inference 菜名比對與推定配方建立 — COMPLETED / DEPLOYED / VERIFIED
  - Reconciliation package: `docs/features/feature-024/SSOT_RECONCILIATION_PACKAGE.md` (docs-only reconciliation commit `86f861f`, Reality Alignment Addendum commit `6da9a37`)
  - Implementation commit: `b569be0`
  - Implementation branch: `claude/awesome-hawking-1mu479`
  - Production PR #51 merged into `claude/fervent-dirac-HJT01`
  - Reality Alignment Addendum (Section 7A) governs: no fake multi-tenant security, no `request.auth.token.orgId` (no such claim exists in this app), `organizationName` treated as metadata only, gating reuses existing `isPurchasingStaff()` role check
  - Preserves Feature 023 schema: uses `matchStatus` (extended additively: `unmatched | mapped | pending_review | rejected | unresolved`), uses `rawDishName` (immutable), does not require `rawQuantity`
  - Adds additive-only `MenuImportItem` fields: `matchedRecipeId`, `candidateId`, `matchConfidence`, `matchSource`, `matchingError`
  - New staging-only collections: `/proposedRecipeCandidates/{candidateId}`, `/recipeAliases/{aliasId}`
  - `ProposedRecipeCandidate.ingredients` is staging-only `string[]`; never a formal `ingredientId`/`recipeIngredientId`
  - No writes to formal `recipes` / `ingredients` / `recipeIngredients`; `recipeId` references are read-only lookups; candidate/alias confirmation is a human-review status change only
  - New services: `recipeAliasService.ts`, `proposedRecipeCandidateService.ts`, `dishNameMatchingService.ts`
  - `npm run typecheck` passed clean
  - Runtime verification PASSED by ibi

* Feature 025: Dish Matching Review Workbench 菜名比對審核工作台 — COMPLETED / DEPLOYED / VERIFIED
  - Production PR #52 merged into `claude/fervent-dirac-HJT01`, merge commit `544a1ae9d540af8321b518d934a48d163ad8e6e7`
  - Adds `MatchReviewWorkbench`, `MatchItemDetailPanel`, `MatchStatusFilterBar`, `AliasReviewPanel`, `RecipePicker` UI components for human review of Feature 024 dish-name matching output
  - Operates entirely on existing Feature 023/024 staging collections (`menuImportBatches/{batchId}/items`, `proposedRecipeCandidates`, `recipeAliases`); no new collections, no formal `recipes`/`ingredients`/`recipeIngredients` writes
  - Production smoke test PASSED by ibi: workbench/staging display verified visible and usable; no automatic recipe/ingredient creation observed
  - Note: `matchStatus` defaults to `unmatched` is N/A in production UI (UI surfaces confirmed/pending review status instead); `matchStatus` filter functionality was not tested in the production smoke test

* Feature 026: Wide Monthly Menu Template Import Support 支援橫向月菜單版型匯入 — COMPLETED / DEPLOYED / VERIFIED
  - Implementation commit: `482bcc6`
  - Bugfix commit (real-file verification): `a6678cd`
  - Production PR #53 merged into `claude/fervent-dirac-HJT01`, merge commit `e8f77ac9a2fcefb9a11d47884c39445adfb8964f`
  - New file: `src/services/wideMenuTemplateParser.ts` — detects and converts horizontal/wide monthly menu `.xls`/`.xlsx` templates (ROC year/month title row, day-only date column, dish-slot columns) into synthetic CSV text consumed unmodified by the existing Feature 023 `parseCsvText` pipeline
  - `CsvUploadStep.tsx` branches `.xls`/`.xlsx` uploads to the new parser via `xlsx` (already a repo dependency); standard CSV/pasted-text behavior unchanged
  - No new Firestore collections, no schema changes, no formal `recipes`/`ingredients`/`recipeIngredients` writes
  - Real-file verification (required by Gatekeeper before PR authorization) against actual production sample `115年7月菜單-成人.xls` surfaced and fixed two parser bugs invisible to synthetic fixtures: nutrition/summary column leakage (`(份)`, `熱量` headers) and fragmented non-service banner text (服務準備周不供餐) scattered across dish-slot cells of 7/28–7/31 rows
  - Production smoke test PASSED by ibi: ROC 115年7月 → 2026-07 conversion correct; 19 service days parsed; 129 `MenuImportItem` records generated; 7/28–7/31 rows correctly skipped; `rawDishName` preserved; Feature 025 staging/review list displays imported items; no automatic recipes/ingredients/recipeIngredients creation observed (ingredient master list unchanged at 7 original entries; 配方管理 shows 尚無配方資料)

---

## Implemented — Pending Production Verification

> The following features were implemented on branch `claude/kitchen-mgmt-system-dev-kbo4ac` (PR #61) at ibi's direct instruction (2026-07-06 session). They are NOT yet deployed or production-verified. Note: Features 027–031 were merged earlier on this branch but are not yet reflected in this file.

* Feature 032: 果菜市場市價整合 Market Price Integration — IMPLEMENTED / PENDING VERIFICATION
  - Netlify function `netlify/functions/market-price.ts` proxying MOA AMIS open data API (`AgriProductsTransType`, ROC dates, NT$/kg)
  - New service `marketPriceService.ts`; daily cache collection `/marketPrices/{YYYY-MM-DD}` (read/create/update: authenticated; delete: false)
  - Additive optional ingredient field `marketCropName` (types, service write payloads, `ingredientAllowedFields()` in rules, master form UI)
  - New route `/market-prices`, nav label `市場行情`
  - Upstream API unreachable from the dev sandbox (network policy) — runtime verification must happen on deployed Netlify
  - Doc: `docs/FEATURE_032_MARKET_PRICE_INTEGRATION.md`

* Feature 033: 性價比菜單建議與採購成本標註 Cost/Inventory-Aware Menu Suggestions — IMPLEMENTED / PENDING VERIFICATION
  - New service `costAwareMenuSuggestionService.ts`: pure ranking of active recipes by estimated cost per serving (market price first, `defaultPrice` fallback) × stock feasibility (`inventory` kg → baseUnit; `pcs` has no stock mapping)
  - Immutable create-only collection `/costAwareMenuSuggestions/{id}` (create: isPurchasingStaff, mirroring `menuMixRecommendations`)
  - New route `/cost-menu-suggestions`, nav label `性價比菜單建議`
  - Purchase demand draft view now shows display-only 預估單價/預估金額/價格來源 badges and ≥15%-over-baseline warnings; no draft schema or write-path changes
  - Doc: `docs/FEATURE_033_COST_AWARE_MENU_SUGGESTIONS.md`

* Feature 034: 人力與製作順序自動排程建議 Production Schedule Suggestion — IMPLEMENTED / PENDING VERIFICATION
  - New service `productionScheduleService.ts`: deterministic list scheduler over a `productionWorkflowPlan`'s active tasks (Kahn cycle detection, critical-path priority, event-driven staff-slot/equipment-slot placement, per-recipe exclusivity for `canRunInParallel: false`)
  - Suggestion-only: never writes to `productionWorkflowPlans`; immutable create-only collection `/productionScheduleSuggestions/{id}` (create: isPurchasingStaff, mirroring `capacityFeasibilityChecks`)
  - New route `/production-schedules`, nav label `生產排程`
  - Doc: `docs/FEATURE_034_PRODUCTION_SCHEDULE_SUGGESTION.md`

* Feature 035: 每日市價自動更新與儀表板智慧卡片 Auto Daily Price Refresh + Dashboard Cards — IMPLEMENTED / PENDING VERIFICATION
  - `ensureTodayMarketPrices` / `shouldRefreshSnapshot` in `marketPriceService.ts`: first visit of the day auto-fetches missing crops (best-effort, never throws); manual 更新市價 unchanged
  - Dashboard adds three read-only cards: 今日市場行情 (movers vs 基準價), 性價比菜單 Top 3, 最新生產排程 status
  - No new collections, no rules changes, no scheduled/server-side cron (client-triggered refresh only)
  - Doc: `docs/FEATURE_035_AUTO_PRICE_REFRESH_DASHBOARD.md`

* Feature 036: 製程任務自動草稿 Workflow Task Auto-Draft — IMPLEMENTED / PENDING VERIFICATION
  - New pure generator `workflowTaskDraftService.ts`: category-keyword templates (蔬菜 wash→cut, 肉類 cut→marinate, 乾貨 portion, fallback wash→cut with note), kg-scaled minutes, one cook task per recipe depending on the last prep step of each of its ingredients
  - UI: 自動產生任務草稿 button in 製程規劃 task editor appends drafts to unsaved local state with explicit 儲存/捨棄; saving goes through the existing `updateProductionWorkflowPlan` human-approval path
  - Pure client-side generation: no new collections, no rules changes, no service write-path changes, no auto-save
  - Doc: `docs/FEATURE_036_WORKFLOW_TASK_AUTO_DRAFT.md`

Features 032–036 shipped in PR #61 (merged 2026-07-06, merge commit `8c0ec57`); AMIS market price integration runtime-verified by ibi on the deploy preview (市價已更新 with live prices). PR #61 also carried two deploy fixes: Netlify functions relocated to `catering-system/netlify/functions/` (base-relative resolution) and function deps moved to `catering-system/package.json`.

* Feature 037: 市價趨勢與採購時機建議 Market Price Trends + Buy Signal — IMPLEMENTED / PENDING VERIFICATION
  - New `marketPriceTrendService.ts`: pure `buildCropTrends` over accumulated `/marketPrices/*` daily snapshots — 30-day series, 7-day average, period min/max, change %, buy signal (≤−10% goodBuy / ≥+10% wait)
  - 市場行情 page gains a 市價趨勢（近 30 天）section with per-crop recharts line cards; independent load, never blocks the price table
  - No new collections, no rules changes
  - Doc: `docs/FEATURE_037_MARKET_PRICE_TRENDS.md`

* Feature 038: 每日工作總覽 Daily Ops Cockpit — IMPLEMENTED / PENDING VERIFICATION
  - New `dailyOpsService.ts`: pure `buildDailyOpsOverview` + read-only loader — per-date status of the 6-step chain 菜單 → 備料快照 → 採購需求草稿 → 製程規劃 → 排程建議 → 市場行情 with done/partial/missing/na semantics and next-action hints
  - New route `/daily-ops`, nav label `每日工作總覽` (first item of 日常作業)
  - 100% read-only aggregation; no writes, no new collections, no rules changes; schedule-suggestion reads bounded to 5 plans
  - Doc: `docs/FEATURE_038_DAILY_OPS_COCKPIT.md`

Verification gate: `npm run typecheck` clean; hand-rolled tsx test suites pass (marketPriceService 19, marketPriceAutoRefresh 8, marketPriceTrendService 26, costAwareMenuSuggestionService 40, productionScheduleService 35, workflowTaskDraftService 38, dailyOpsService 32 — 198 total).

---

## Current Feature

Features 032–036 merged (PR #61); Features 037–038 implemented on the dev branch, pending ibi production verification. Feature 027 (Import Batch Management & Duplicate Protection 匯入批次管理與重複匯入防護) remains HOLD pending Spec Planning authorization.

---

## Current Phase

Features 032–036: MERGED / DEPLOYED (PR #61). Features 037–038: IMPLEMENTED / AWAITING DEPLOY + RUNTIME VERIFICATION by ibi.

---

## Current Basis

* Feature 010: COMPLETED / DEPLOYED / VERIFIED
* Feature 011: COMPLETED / DEPLOYED / VERIFIED
* Feature 012: COMPLETED / DEPLOYED / VERIFIED
* Feature 013: COMPLETED / DEPLOYED / VERIFIED
* Feature 014: COMPLETED / DEPLOYED / VERIFIED
* Feature 015: COMPLETED / DEPLOYED / VERIFIED
* Feature 016: COMPLETED / DEPLOYED / VERIFIED
* Feature 017: COMPLETED / DEPLOYED / VERIFIED
* Feature 018: COMPLETED / DEPLOYED / VERIFIED
* Feature 019: COMPLETED / DEPLOYED / VERIFIED
* Feature 020: COMPLETED / DEPLOYED / VERIFIED
* Feature 021: COMPLETED / DEPLOYED / VERIFIED
* Feature 022: COMPLETED / DEPLOYED / VERIFIED
* Feature 023: COMPLETED / DEPLOYED / VERIFIED
* Feature 024: COMPLETED / DEPLOYED / VERIFIED
* Feature 025: COMPLETED / DEPLOYED / VERIFIED
* Feature 026: COMPLETED / DEPLOYED / VERIFIED

---

## Team State

* Claude: HOLD after Feature 025 / Feature 026 production verification and docs-only close-out
* Gemini: HOLD
* Grok: HOLD
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

Feature 027: NOT STARTED / NOT AUTHORIZED (Import Batch Management & Duplicate Protection 匯入批次管理與重複匯入防護 — proposed next, Spec Planning HOLD)

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010–026 are CLOSED / COMPLETED / DEPLOYED / VERIFIED, forming the current operating chain:
食材主檔 → 配方管理 → 菜單配方 → 備料快照 → 採購需求草稿（含匯出 / 列印 / 人工流程狀態）→ 製程規劃 → 產能評估 → 菜單組合建議 → 草稿菜單 → 正式菜單 → 月菜單匯入暫存 → 菜名比對與推定配方建立 → 菜名比對審核工作台 → 橫向月菜單版型匯入.

Feature 027 (Import Batch Management & Duplicate Protection 匯入批次管理與重複匯入防護) is proposed as the next feature, motivated directly by real-world Feature 026 production use: duplicate-upload handling, batch rollback/archival, and import-source/summary traceability for the 129-item `115年7月菜單-成人.xls` import. Feature 027 is not authorized until ibi and Gatekeeper explicitly start Spec Planning.

---

## Tech Debt Review

* Tech Debt: legacy `seedIngredients` compatibility with `ingredientAllowedFields`
  - Final status: CLOSED AS STALE / NOT FOUND
  - Reason: repo audit found no `seedIngredients` file/function and no `ingredientAllowedFields` function in current codebase
  - Impact: no active production data risk
  - Implementation: not required

---

## SSOT Update Rule

After each phase is reviewed and approved, ChatGPT will generate the next version of this file.
Claude should update this file only when explicitly instructed by ibi or ChatGPT.
If the latest ChatGPT-generated SSOT in chat differs from this file, the chat SSOT is considered newer and this file must be updated.

---

## Agent Reading Rule

Before starting implementation or review, every agent must read this file and follow only this current state.
Old conversations, previous specs, and previous phases are historical context only.
They are not active instructions unless reflected in this file.
