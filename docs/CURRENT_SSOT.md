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

資料鏈已完成：食材主檔 → 配方管理 → 菜單配方 → 備料快照

---

## Current Feature

Feature 014: Purchase Demand Draft from Prep Plans 備料快照產生採購需求草稿

---

## Current Phase

Feature 014: COMPLETED / READY FOR PRODUCTION MERGE

---

## Current Basis

* Feature 010: COMPLETED / DEPLOYED / VERIFIED
* Feature 011: COMPLETED / DEPLOYED / VERIFIED
* Feature 012: COMPLETED / DEPLOYED / VERIFIED
* Feature 013: COMPLETED / DEPLOYED / VERIFIED
* Feature 014 Spec v1.0: PASSED
* Feature 014 Implementation Plan v1.1: PASSED
* Feature 014 Implementation commit: `06459b3`
* Grok Code Review: PASS
* Gatekeeper Decision: Feature 014 Implementation PASSED
* Actual collection path: `/purchaseDemandDrafts/{draftId}`
* Actual route: `/purchase-demand-drafts`
* Actual nav label: `採購需求草稿`
* Source dependency: `/prepPlans/{prepPlanId}` read-only
* Calculation: `demandQuantity = prepItem.requiredBaseQuantity`
* Unit: `baseUnit = prepItem.baseUnit`
* `prepPlanTraceability` (`prepPlanId`, `prepPlanNameSnapshot`) included in each item
* `status` / `isActive` synchronized by service (`'draft'`<->`true`, `'archived'`<->`false`)
* UI has no independent `isActive` toggle — only 封存/取消封存
* Immutable item fields (ingredientId, ingredientNameSnapshot, baseUnit, sourceRequiredBaseQuantity,
  prepPlanTraceability, status, isActive, createdAt/createdBy) are reconstructed from the existing
  document on update — client may only edit draftName, notes, items[].demandQuantity, items[].notes
* Firestore rules protect document-level audit/source fields (createdAt, createdBy, sourcePrepPlanId,
  sourcePrepPlanNameSnapshot) via exact whitelist + `allow delete: if false`; no broad `allow write`
* IMPORTANT BOUNDARY: Item-level immutability is enforced by service reconstruction and UI payload
  restriction. Firestore rules protect document-level audit/source fields, but do not deeply validate
  each items[] immutable subfield. This is an accepted, documented boundary — not a gap to be silently
  assumed closed by rules alone.
* Snapshot only: no inventory write, no formal purchase order, no procurement automation, no purchase
  suggestion, no supplier selection, no AI/OCR/cost automation

---

## Team State

* Claude: HOLD after SSOT update
* Gemini: HOLD
* Grok: HOLD / Ready for production merge review
* ChatGPT: Gatekeeper
* ibi: Final authority

Feature 015: NOT STARTED

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010, 011, 012, and 013 are CLOSED / COMPLETED / DEPLOYED / VERIFIED.
Feature 014 is COMPLETED / READY FOR PRODUCTION MERGE (not yet deployed to production).

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
