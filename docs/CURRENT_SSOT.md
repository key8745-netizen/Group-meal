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

資料鏈已完成：食材主檔 → 配方管理 → 菜單配方

---

## Current Feature

Feature 013: Prep Planning from Recipe Menus 備料規劃引用菜單配方

---

## Current Phase

Implementation Authorized — Greenfield `/prepPlans/{prepPlanId}`, read-only references to
Feature 012 `/recipeMenus/{menuId}` and Feature 011 `/recipes/{recipeId}`. No naming collision
found (repo grep for prepPlan/PrepPlan/prep_plan returned no results).

---

## Current Basis

* Feature 013 Spec v1.0: PASSED
* Grok Spec Review: PASS
* Feature 013 Implementation Plan v1.1: PASSED
* Grok Pre-Implementation Review: PASS
* Gatekeeper Decision: Claude GO - Feature 013 Implementation only

---

## Team State

* Claude: GO - implement Feature 013 within approved scope only
* Gemini: HOLD
* Grok: Prepare Code Review
* ChatGPT: Gatekeeper
* ibi: Final authority

Feature 014: NOT STARTED

* Claude: HOLD after SSOT update
* Gemini: HOLD
* Grok: HOLD / Ready for next feature review
* ChatGPT: Gatekeeper
* ibi: Final authority

Feature 013: NOT STARTED

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED — see
`docs/archive/feature_009_final_state.md`.

Features 010, 011, and 012 (above) are CLOSED / COMPLETED / DEPLOYED / VERIFIED, forming the
data chain 食材主檔 → 配方管理 → 菜單配方.

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
