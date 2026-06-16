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

---

## Current Feature

None — Feature 020 closed out. Awaiting Feature 021 Spec Planning.

---

## Current Phase

HOLD — Ready for Feature 021 Spec Planning

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

---

## Team State

* Claude: HOLD after Feature 020 merge and runtime verification
* Gemini: HOLD
* Grok: HOLD
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

Feature 021: NOT STARTED / NOT AUTHORIZED

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010–020 are CLOSED / COMPLETED / DEPLOYED / VERIFIED, forming the current operating chain:
食材主檔 → 配方管理 → 菜單配方 → 備料快照 → 採購需求草稿（含匯出 / 列印 / 人工流程狀態）→ 製程規劃 → 產能評估 → 菜單組合建議.

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
