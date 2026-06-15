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

---

## Current Feature

None — Feature 015 closed out. Awaiting Feature 016 Spec Planning.

---

## Current Phase

HOLD — Ready for Feature 016 Spec Planning

---

## Current Basis

* Feature 010: COMPLETED / DEPLOYED / VERIFIED
* Feature 011: COMPLETED / DEPLOYED / VERIFIED
* Feature 012: COMPLETED / DEPLOYED / VERIFIED
* Feature 013: COMPLETED / DEPLOYED / VERIFIED
* Feature 014: COMPLETED / DEPLOYED / VERIFIED
* Feature 015: COMPLETED / DEPLOYED / VERIFIED

---

## Team State

* Claude: HOLD after SSOT update
* Gemini: HOLD
* Grok: HOLD / Ready for next
* ChatGPT: Gatekeeper
* ibi: Final authority

Feature 016: NOT STARTED

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010, 011, 012, 013, 014, and 015 are CLOSED / COMPLETED / DEPLOYED / VERIFIED, forming the
data chain 食材主檔 → 配方管理 → 菜單配方 → 備料快照 → 採購需求草稿.

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
