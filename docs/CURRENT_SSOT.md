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

Planning / Spec Design - Revision Required (Spec v1.0 HOLD, awaiting v1.1)

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
* Gemini: GO - Produce Feature 010 Spec v1.1 (revision of v1.0, addressing Gatekeeper blocking issues below)
* Grok: Standby - review Spec v1.1 after full text is submitted
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Spec v1.0 Gatekeeper Review Result

**Spec v1.0: HOLD / Revision Required.** Grok's PASS on v1.0 is noted but does not override the
Gatekeeper's blocking findings below. Spec v1.0 is NOT approved. No Implementation Planning may
begin until v1.1 passes through the full evidence chain again.

### Blocking issues for v1.1

1. **"Zero Real Write" framing is contradictory** — Feature 010 is CRUD (create/edit/deactivate
   ingredients), which inherently requires writes. Replace "Zero Real Write / read-only" framing
   with explicit boundaries:
   - No production rollout until Gatekeeper approval
   - No cross-tenant write
   - No AI-generated ingredient write
   - No inventory write
   - No purchase order write
   - No OCR write
   - No financial write
   - Ingredient CRUD write is allowed only inside `tenants/{tenantId}/ingredients/{ingredientId}`
     after Gatekeeper approves implementation

2. **Firestore Rules too simplified** — `allow read, write: if request.auth.token.tenantId == tenantId;`
   is insufficient. v1.1 must specify at least:
   - `request.auth != null`
   - `request.auth.token.tenantId == tenantId` (path tenantId)
   - create: `request.resource.data.tenantId == tenantId`
   - update: `resource.data.tenantId == tenantId`, and `tenantId` field is immutable on update
   - create requires `createdAt`, `createdBy`
   - update requires `updatedAt`, `updatedBy`
   - `name` non-empty; `normalizedName` derived from `name`
   - `isActive` must be boolean
   - `conversionFactorToBaseUnit` must be > 0
   - no cross-tenant read/write

3. **`supplierId` must be explicitly optional** — Feature 010 does not implement supplier CRUD.
   `supplierId` is optional/nullable; missing supplier must not block ingredient creation; supplier
   validation is deferred to a future feature.

4. **Unit/conversion model needs generalizing** — replace `gramsPerPurchaseUnit` with:
   ```
   baseUnit: g | ml | pcs
   purchaseUnit: 台斤 | 公斤 | 公克 | 公升 | 毫升 | 顆 | 包 | 箱 | 其他
   conversionFactorToBaseUnit: number
   ```
   Examples: 高麗菜 baseUnit=g, purchaseUnit=台斤, conversionFactorToBaseUnit=600;
   牛奶 baseUnit=ml, purchaseUnit=公升, conversionFactorToBaseUnit=1000;
   雞蛋 baseUnit=pcs, purchaseUnit=盒, conversionFactorToBaseUnit=10.

5. **UI scope must be explicit** — v1.1 must list in-scope UI (食材列表 / 新增食材表單 / 編輯食材表單 /
   停用•啟用切換 / 預設隱藏 inactive，可切換顯示) and explicitly exclude: 採購單, 庫存, AI, OCR, 供應商管理,
   價格歷史, 匯入匯出.

6. **Exit Criteria for v1.1** must include:
   - Spec v1.1 full text submitted
   - Grok Spec Review PASS (on v1.1, full body)
   - Gatekeeper approval
   - SSOT updated to "Spec Approved / Implementation Planning only"
   - Claude remains HOLD until implementation plan is separately approved

---

## Next Expected Input

Gemini's full Feature 010 Spec v1.1 body (addressing all blocking issues above), then Grok's full
independent Spec Review body of v1.1, then ChatGPT/ibi formal verdict + new SSOT authorizing
implementation. Claude will not transition to Implementation until all three appear as substantive
bodies in-conversation. Spec v1.0 and its Grok PASS do not satisfy this requirement.

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
