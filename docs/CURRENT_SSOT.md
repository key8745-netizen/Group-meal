# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 010: Ingredient Master Data Management 食材主檔管理

---

## Current Phase

Planning / Spec Design

---

## Background

Feature 009 (Real Model Config Apply Transaction Implementation) is CLOSED / ARCHIVED.
See `docs/archive/feature_009_final_state.md` and `docs/legacy/feature_009_safe_architecture.md`
for the archived record. Feature 010 is a brand-new, unrelated product feature — do not return
to Feature 009 implementation state or governance scaffolding.

### Product Problem

The system already has an "ingredient" concept (`ingredients` collection, used by BOM / recipe
matching / inventory), but there is no UI entry point for a tenant to create their own ingredient
master data. Feature 010 builds a tenant-scoped Ingredient Master Data Management feature so a
tenant can create, edit, and deactivate their own ingredients.

---

## Feature 010 Goal

Build a tenant-scoped ingredient master data management feature. V1 is basic CRUD only:
* No AI involvement
* No automated purchasing
* No inventory deduction logic

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009: CLOSED / ARCHIVED (see `docs/archive/feature_009_final_state.md`)
* Feature 010: NEW — Planning / Spec Design
* ibi Decision: Begin Feature 010 Planning / Spec Design

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Required Spec Scope (for Gemini)

Feature 010 Spec v1.0 must include at least:
1. 功能目標 (feature goal)
2. 使用者入口位置 (UI entry point)
3. 食材資料模型 (data model)
4. Firestore collection path
5. tenant 隔離規則 (tenant isolation rules)
6. 新增食材流程 (create flow)
7. 編輯食材流程 (edit flow)
8. 停用食材流程 (deactivate flow)
9. 欄位驗證 (field validation)
10. 單位與換算規則 (unit conversion rules)
11. 台斤 / 公克換算規則 (jin/gram conversion rules)
12. 權限規則 (permission rules)
13. audit 欄位 (audit fields)
14. UI 頁面範圍 (UI page scope)
15. 禁止事項 (forbidden items)
16. 測試需求 (test requirements)
17. exit criteria
18. Grok red team checklist

### Recommended Firestore Path
```
tenants/{tenantId}/ingredients/{ingredientId}
```

### Suggested Fields
```
tenantId
name
normalizedName
category
baseUnit
purchaseUnit
gramsPerPurchaseUnit
defaultPrice
defaultPriceUnit
supplierId
isActive
notes
createdAt
updatedAt
createdBy
updatedBy
```

---

## Required Safety Boundaries

* Do not use a global `ingredients` collection — must be tenant-scoped
* Do not allow cross-tenant read/write
* Do not let AI auto-create ingredients
* Do not implement automated purchase order generation
* Do not implement inventory deduction logic
* Do not implement OCR ingredient recognition
* Do not modify the Feature 009 archived state (`docs/archive/`, `docs/legacy/`)
* Claude remains HOLD until Spec is reviewed and approved

---

## Allowed in this phase

* Gemini produces Feature 010 Spec v1.0
* Grok prepares Spec Review
* requirements discussion
* docs / SSOT update
* Claude remains HOLD

---

## Forbidden in this phase

* Do not let Claude implement Feature 010 yet
* Do not modify Feature 001–009 core flow or archived state
* Do not modify `docs/archive/` or `docs/legacy/`

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 010 Spec v1.0
* Grok: GO - Prepare Spec Review (after Gemini submits)
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini's full Feature 010 Spec v1.0 body, then Grok's full independent Spec Review body, then
ChatGPT/ibi formal verdict + new SSOT authorizing implementation. Claude will not transition to
Implementation until all three appear as substantive bodies in-conversation.

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
