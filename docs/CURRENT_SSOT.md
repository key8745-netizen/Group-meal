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
  - Actual collection path: `/recipeMenus/{menuId}` (renamed from `/menus` to avoid collision
    with the existing legacy `menus` collection used by ProductionPlanner,
    recipeMatchingService, orderService, mealPlanService, aiContextService, etc.)
  - Actual route: `/recipe-menus`
  - Actual nav label: `菜單配方`
  - 菜單配方 verified visible and usable by ibi (runtime verification PASSED)
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
  - Calculation: `recipeIngredient.baseQuantity * menuRecipe.servings`
  - Aggregation: `ingredientId + baseUnit`
  - 備料快照 verified visible and usable by ibi (runtime verification PASSED)
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
  - Calculation: `demandQuantity = prepItem.requiredBaseQuantity`, `baseUnit = prepItem.baseUnit`
  - `prepPlanTraceability` included in each item
  - `status` / `isActive` synchronized by service; UI has no independent `isActive` toggle
  - Immutable item fields reconstructed from existing document on update (service reconstruction +
    UI payload restriction); Firestore rules protect document-level audit/source fields only
  - 採購需求草稿 verified visible and usable by ibi (runtime verification PASSED)

資料鏈已完成：食材主檔 → 配方管理 → 菜單配方 → 備料快照 → 採購需求草稿

* Feature 015: Navigation Information Architecture Cleanup 左側選單資訊架構整理 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.1: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `19ceef4`
  - Cherry-pick commit: `b9ea36a`
  - SSOT commit: `7b58109`
  - Production PR #38 merged, merge commit `17ddefb27c3829855bc62d1a9c641bde50326f54`
  - Actual changed file: `catering-system/src/components/layout/AppLayout.tsx` (only)
  - Sidebar nav grouped into 7 sections: 總覽 / 日常作業 / 基礎資料 / 菜單與配方 / 作業規劃 / 營運管理 / 分析
  - All 12 routes preserved (including `/ingredients-master`); `/share/:orderId` untouched
  - `App.tsx`, `firestore.rules`, services, pages, and business logic unchanged
  - No procurement / inventory / purchase order / AI / OCR / tenant / Netlify Functions changes
  - Navigation grouping verified visible and usable by ibi (runtime verification PASSED)

* Feature 016: Purchase Demand Draft Export / Print View 採購需求草稿匯出 / 列印檢視 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.1: PASSED
  - Implementation Plan v1.0: CONDITIONAL PASS
  - Implementation commit: `3366bfcc62c7857de2ae739c496e921c8be98351`
  - Production PR #40 merged, merge commit `d452ede37e0b2d4c04d6ccf863cc6916e183a268`
  - Actual changed files: `catering-system/src/pages/PurchaseDemandDraftPage.tsx`,
    `catering-system/src/components/purchaseDemandDrafts/PurchaseDemandDraftList.tsx`,
    `catering-system/src/components/purchaseDemandDrafts/PurchaseDemandDraftPrintView.tsx`,
    `catering-system/src/utils/purchaseDemandDraftExport.ts`
  - Added per-draft CSV export (frontend Blob download) and per-draft print view
    (`print:hidden` / `print:block`), reusing existing loaded `purchaseDemandDrafts` data
  - No `App.tsx`, Firestore rules, service, or data model changes
  - Governance note: Production advanced via PR #40 before feature-only proposal gate;
    post-merge verification completed; runtime verification passed; final status accepted
    by Gatekeeper
  - 採購需求草稿匯出 / 列印 verified visible and usable by ibi (runtime verification PASSED)

* Feature 017: Purchase Demand Draft Workflow Status 採購需求草稿人工流程狀態 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.2: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `755002c089a60a2a40d807d4dce1199a9209b10f`
  - Proposal commit: `b3bf2de04829bf1860afd3ec345778f9455e9825`
  - Production PR #41 merged, merge commit `9c3fbd1e9fe1d1749f65f9cabbbf20b5c015d234`
  - Adds independent `workflowStatus: 'draft' | 'exported' | 'sent' | 'completed' | 'cancelled'`
    to `purchaseDemandDrafts` (optional field, existing drafts default to `'draft'`)
  - Existing archive semantics unchanged: `status: 'draft' | 'archived'`, `isActive: boolean`,
    `status <=> isActive` archive invariant preserved
  - `updateDraftWorkflowStatus()` only updates `workflowStatus`/`updatedAt`/`updatedBy`; does not
    touch `status`, `isActive`, `items`, or source/traceability fields
  - Firestore rules: `workflowStatus` added to whitelist with restricted allowed values only;
    `status`/`isActive`/`items`/source-field protections unchanged
  - No PO creation, no procurement automation, no inventory write/deduction, no supplier
    automation, no cost calculation, no AI/OCR, no tenant model, no Netlify Functions
  - Governance note: Production advanced via PR #41 before Gatekeeper merge decision;
    post-merge verification completed; runtime verification passed; final status accepted
    by Gatekeeper
  - 採購流程狀態 verified visible and usable by ibi (runtime verification PASSED)

* Feature 018: Kitchen Production Workflow Planning 廚房製程與產能資料地基 — COMPLETED / DEPLOYED / VERIFIED
  - Spec v1.4: PASSED
  - Implementation Plan v1.0: PASSED
  - Implementation commit: `3edad4b0cacf2f0353d349c33e88abff0de3faee`
  - Patch commit: `40f1d981db5cd1beaf5fa028a7249fa710f81534`
  - Production PR #42 merged, merge commit `1b12dcb2db5496ce05a7f815164ecaa5b9a792d0`
  - Actual collection path: `/productionWorkflowPlans/{planId}`
  - Actual route: `/production-workflows`
  - Actual nav label: `製程規劃` (under `作業規劃` section)
  - Source dependency: `/prepPlans/{prepPlanId}` read-only at plan creation time
  - `productionWorkflowPlans` are planning documents only; not formal production orders;
    do not replace `prepPlans`
  - Saved tasks cannot be hard deleted; `taskStatus: 'archived'` is the only delete semantic;
    `updateProductionWorkflowPlan` throws if any existing task ID is missing from update payload
  - `dependsOnTaskIds` UI added in patch commit `40f1d98`: checkbox group of active tasks,
    dependency count + hover tooltip in task table
  - No AI, no auto scheduling, no timeline conflict detection, no gantt chart
  - No inventory, procurement, supplier, cost, PO, Feature 019, or Feature 020 implementation
  - Governance note: PR #42 advanced production via full dev-branch merge
    (`claude/busy-heisenberg-HcwYg` → `claude/fervent-dirac-HJT01`) rather than authorized
    feature-only proposal. Post-merge review accepted this as a governance anomaly because
    net new behavior was Feature 018 only; prior Feature 016/017 changes were already deployed
    via PR #40 and PR #41 respectively.
  - 製程規劃 verified visible and usable by ibi (runtime verification PASSED)

---

## Current Feature

None — Feature 018 closed out. Awaiting Feature 019 Spec Planning.

---

## Current Phase

HOLD — Ready for Feature 019 Spec Planning

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

---

## Team State

* Claude: HOLD after SSOT update
* Gemini: HOLD
* Grok: HOLD
* ChatGPT: Gatekeeper
* ibi: Final authority

Feature 019: NOT STARTED

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010, 011, 012, 013, 014, 015, 016, 017, and 018 are CLOSED / COMPLETED / DEPLOYED / VERIFIED,
forming the data chain 食材主檔 → 配方管理 → 菜單配方 → 備料快照 → 採購需求草稿 (含匯出 / 列印 / 人工流程狀態)
→ 製程規劃.

---

## Tech Debt Review

* Tech Debt: legacy `seedIngredients` compatibility with `ingredientAllowedFields`
  - Final status: CLOSED AS STALE / NOT FOUND
  - Reason: repo audit found no `seedIngredients` file/function and no `ingredientAllowedFields`
    function in current codebase
  - Impact: no active production data risk; no impact to Feature 010–015
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
