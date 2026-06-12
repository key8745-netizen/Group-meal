# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 011: Recipe Ingredient Linking 菜色 / 配方引用食材主檔

---

## Current Phase

COMPLETED / READY FOR PRODUCTION MERGE

---

## Current Basis

* Feature 010: COMPLETED / DEPLOYED / VERIFIED (production PR #29 merged, 食材主檔 verified visible by ibi)
* Feature 011 Spec v1.1: PASSED
* Feature 011 Implementation Plan v1.1: PASSED WITH CONDITIONS
* Feature 011 Implementation commit: `227c3d7`
* Grok Code Review: PASS
* Gatekeeper Decision: Feature 011 Implementation PASSED

---

## Team State

* Claude: HOLD after SSOT update
* Gemini: HOLD
* Grok: HOLD / Ready for production merge review if needed
* ChatGPT: Gatekeeper
* ibi: Final authority

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED.
Feature 010 (Ingredient Master Data Management) is COMPLETED / READY FOR ARCHIVE — see Current
Basis below for evidence chain. Feature 011 is the next extension: linking 菜色/配方 (menus/dishes/
recipes) to the `/ingredients/{ingredientId}` master data created by Feature 010.

---

## Feature 011 Goal

建立「菜色 / 配方」與食材主檔的引用關係。Feature 010 已建立 `/ingredients/{ingredientId}` 食材主檔；
Feature 011 要讓菜色或配方可以選擇食材主檔，並設定用量與單位。

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009: CLOSED / ARCHIVED (see `docs/archive/feature_009_final_state.md`)
* Feature 010: Ingredient Master Data Management — COMPLETED / READY FOR ARCHIVE
  - Feature 010 Implementation commit: `c5edd62`
  - Feature 010 SSOT commit: `fd3c769`
  - Grok Code Review: PASS
* ChatGPT / ibi Decision: Continue extension into Feature 011 Planning only

---

## Required Scope (Feature 011 v1.0)

Feature 011 v1.0 只做：
1. 菜色 / 配方可以引用食材主檔
2. 每個配方項目保存 `ingredientId`
3. 顯示食材名稱可由 ingredient master 讀取
4. 設定每份用量
5. 設定用量單位
6. 使用 Feature 010 的 `conversionFactorToBaseUnit` 做基礎換算規劃
7. 保留既有菜單 / 配方資料結構，避免破壞現有流程
8. 若現有 repo 已有 recipe / menu / BOM 結構，需優先沿用

### Suggested Data Shape

請先檢查現有 repo 結構後設計，但概念上配方項目可接近：

```
recipeIngredients: [
  {
    ingredientId: string,
    ingredientNameSnapshot: string,
    quantity: number,
    unit: string,
    baseQuantity?: number,
    baseUnit?: "g" | "ml" | "pcs",
    notes?: string
  }
]
```

* `ingredientId` 是主要引用
* `ingredientNameSnapshot` 是顯示備援，不可取代 ingredientId
* `quantity` 必須 > 0
* `unit` 必須明確
* 不做庫存扣帳
* 不產生採購單

---

## Required Safety Boundaries

嚴格禁止：
* 不得做採購單生成
* 不得做庫存扣帳
* 不得做財務寫入
* 不得做 AI 自動配方
* 不得做 OCR
* 不得刪除食材主檔
* 不得改 Feature 009 archive
* 不得改 `src/core/**`
* 不得改 `src/database/**`
* 不得改 `src/production/**`
* 不得改 Netlify Functions
* 不得導入 tenant model
* 不得修改 Feature 010 已通過的 rules，除非 Spec 明確說明且 Grok / Gatekeeper 批准

---

## Required Spec Sections (for Gemini)

請輸出完整 Feature 011 Spec v1.0，至少包含：
1. 功能目標
2. 使用者入口
3. 現有 repo 結構偵測結果
4. 要接哪個現有頁面 / service / model
5. 資料模型
6. `ingredientId` reference 規則
7. `ingredientNameSnapshot` 規則
8. 用量與單位規則
9. base unit 換算規則
10. create / edit 流程
11. UI 範圍
12. 權限規則
13. Firestore rules 是否需要修改
14. 禁止事項
15. backward compatibility
16. 測試需求
17. exit criteria
18. Grok red team checklist

---

## Team State

* Claude: GO - Implement Feature 011 within approved scope only (Greenfield `/recipes/{recipeId}`, read-only references to Feature 010 `/ingredients`)
* Gemini: HOLD
* Grok: Prepare Code Review (after Claude implementation)
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Hard Implementation Conditions

1. **Firestore Rules whitelist must use actual string keys** —
   `hasOnly(['name', 'recipeIngredients', 'isActive', 'notes', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'])`,
   not placeholder bare identifiers.
2. **`baseQuantity` conversion must not guess**:
   - if recipe `unit === ingredient.baseUnit`: `baseQuantity = quantity`, `baseUnit = ingredient.baseUnit`
   - if recipe `unit === ingredient.purchaseUnit`: `baseQuantity = quantity * ingredient.conversionFactorToBaseUnit`, `baseUnit = ingredient.baseUnit`
   - otherwise: reject save with a validation error (no guessing)

---

## Next Expected Input

Claude's full implementation report (branch, commit, changed files, scope confirmations incl. the
two hard conditions, test results), then Grok's full independent Code Review body, then
ChatGPT/ibi formal verdict. Claude must stop after this single implementation pass — no additional
features.

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
