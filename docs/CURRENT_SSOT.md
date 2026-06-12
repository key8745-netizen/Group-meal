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

Planning / Spec Design - Revision Required (Spec v1.1 HOLD, awaiting v1.2)

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
* Gemini: GO - Produce Feature 010 Spec v1.2 (revision of v1.1, addressing Gatekeeper blocking issue below)
* Grok: Standby - review Spec v1.2 after full text is submitted
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Spec v1.1 Gatekeeper Review Result

**Spec v1.1: HOLD / Revision Required.** Spec v1.1 is NOT approved. No Implementation Planning may
begin until v1.2 passes through the full evidence chain again.

### Blocking issue for v1.2: Firestore Rules write bypass

v1.1's Firestore Rules included a broad `allow read, write: if request.auth != null &&
request.auth.token.tenantId == tenantId;` alongside separate `allow create` / `allow update`
rules. In Firestore Rules, any matching `allow` grants access — so the broad `allow write` bypasses
the create/update validation entirely (empty `name`, `conversionFactorToBaseUnit <= 0`, wrong-typed
`isActive`, missing `createdBy`/`updatedBy`, or a changed `tenantId` could all be written).

### v1.2 must explicitly include

1. No `allow read, write` — read / create / update / delete must be separate rules.
2. `allow delete: if false;` — deactivation is via `isActive=false`, never document deletion.
3. `create` validation must require:
   - `tenantId == path tenantId`
   - `name` non-empty string
   - `normalizedName` non-empty string
   - `baseUnit` in `g | ml | pcs`
   - `conversionFactorToBaseUnit > 0`
   - `isActive` is boolean
   - `createdAt`, `createdBy`, `updatedAt`, `updatedBy` present
4. `update` validation must require:
   - existing doc `tenantId == path tenantId`
   - new doc `tenantId == path tenantId`
   - `tenantId` field immutable (`request.resource.data.tenantId == resource.data.tenantId`)
   - `updatedAt`, `updatedBy` updated
   - `conversionFactorToBaseUnit > 0`
   - `isActive` is boolean
5. Allowed-keys list must be explicit; forbid unknown fields such as `aiGenerated`,
   `inventoryQty`, `purchaseOrderId`, `productionWrite`.
6. `supplierId` remains optional/nullable.
7. Spec status should read `DRAFT (Full Text - Revision for Rules Bypass)`, not "Revision Required".
8. Claude remains HOLD; v1.2 submission triggers fresh Grok review.

---

## Next Expected Input

Gemini's full Feature 010 Spec v1.2 body (addressing the Firestore Rules write-bypass blocking
issue above), then Grok's full independent Spec Review body of v1.2, then ChatGPT/ibi formal
verdict + new SSOT authorizing implementation. Claude will not transition to Implementation until
all three appear as substantive bodies in-conversation. Spec v1.0/v1.1 and any prior Grok PASS do
not satisfy this requirement.

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
