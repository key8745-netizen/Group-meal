# Feature 024 — Consolidated SSOT Reconciliation Package

Status: SSOT RECONCILIATION PACKAGE
Scope: Documentation-only reconciliation
Feature: 024 — Dish-name matching and proposed recipe inference
Project: Group-meal
Repo: key8745-netizen/Group-meal
Production branch reference: claude/fervent-dirac-HJT01

## 1. Purpose

This document reconciles the repository SSOT with the external governance trail for Feature 024.

The repository previously showed Feature 024 as:

* NOT STARTED
* NOT AUTHORIZED
* Ready for Spec Planning

However, later governance discussions outside the repository advanced Feature 024 through Spec review and Implementation Plan review. The accepted full-text artifacts were not found inside the repository.

This package does not claim that the original Gemini / Claude full texts were found. They were not found in repo. This document is a consolidated Gatekeeper-authored reconciliation package to restore repo-level SSOT integrity before any implementation work resumes.

## 2. Current Reconciliation Decision

Current phase:

```text
SSOT RECONCILIATION AUTHORIZED — DOCS ONLY
```

Implementation remains paused until this reconciliation package is committed and reviewed.

Allowed now:

* Documentation-only branch
* Add this reconciliation package
* Update `docs/CURRENT_SSOT.md`
* Docs-only commit

Not authorized now:

* Feature 024 coding
* Firestore rules implementation
* Service implementation
* Test implementation
* PR creation
* Merge
* Deployment
* Production Firestore changes
* Scope expansion

## 3. Feature 023 Baseline

Feature 023 remains the baseline for Feature 024.

Feature 023 status:

```text
COMPLETED / DEPLOYED / VERIFIED
```

Known Feature 023 references:

* PR #49 merged
* Merge commit: `d13ee86514cc14ef2c0532954dfacd869935820a`
* Runtime verification: OK
* SSOT close-out commit: `bd7db9cfbe7fcd1882f9067dfb5a24ab10f8f01d`

Feature 024 must not modify Feature 010–023 completed boundaries except where explicitly required by the accepted Feature 024 scope and reviewed before implementation.

PR #50 remains excluded:

```text
PR #50 was an incorrect bundled dev branch.
Do not use PR #50 or any content from that bundled branch.
```

## 4. Feature 024 Target

Feature 024:

```text
菜名比對與推定配方建立
Dish-name matching and proposed recipe inference
```

Core goal:

* Match imported menu item names against existing recipes.
* If no safe match exists, create staging-only proposed recipe candidates for human review.
* Maintain strict separation between staging data and formal recipe / ingredient data.

## 5. Core Boundary Principles

Feature 024 must obey:

1. Staging-first.
2. Human review before formal adoption.
3. `recipeId` is reference-only.
4. Existing `recipes` may be read only within approved scope.
5. No write to formal `recipes`.
6. No write to formal `ingredients`.
7. No write to formal `recipeIngredients`.
8. `ProposedRecipeCandidate.ingredients` is staging-only `string[]`.
9. No automatic creation of formal recipes.
10. No automatic creation of formal ingredients.
11. No automatic creation of formal recipeIngredients.
12. No global / catch-all read in Firestore rules.
13. All staging reads/writes must be organization-scoped.
14. Raw import fields remain immutable.

## 6. Accepted Spec Consolidation

The external governance trail accepted the final Spec boundary as:

```text
Feature 024 Spec v1.6 Final Micro Patch — ACCEPTED
```

Because the original accepted full text was not found in repo, this section consolidates the accepted requirements.

### 6.1 Firestore Rules Boundary

Rules must be code-reviewable and must not use broad global read rules.

Required:

* No `match /{collection=**}/{doc}` catch-all read for general access.
* No broad `allow read: if request.auth != null`.
* Read rules must be defined per collection path.
* Staging collections must be organization-scoped.
* Missing `request.auth.token.orgId` must deny access.
* Cross-organization references must deny access.

Formal collections:

```text
recipes: read only under approved organization scope; write false
ingredients: write false
recipeIngredients: write false
```

If recipes are implemented as organization-scoped data, recipe reads must require matching organization scope.

Feature 024 must not introduce a global recipe library unless separately specified and reviewed.

### 6.2 MenuImportItem Matching Fields

Feature 024 may update only matching-related fields on staging menu import items.

Allowed update fields:

* `matchingStatus`
* `matchedRecipeId`
* `candidateId`
* `matchConfidence`
* `matchSource`
* `matchingError`
* `updatedAt`

Raw import fields must remain immutable, including:

* `rawMenuName`
* `rawDate`
* `rawMealType`
* `rawQuantity`
* `importBatchId`
* source file metadata

Allowed field constraints:

```text
matchingStatus: enum
matchedRecipeId: optional reference string
candidateId: optional reference string
matchConfidence: number from 0 to 1
matchSource: enum, e.g. alias / exact / fuzzy / manual / none
matchingError: optional structured object or string
updatedAt: server timestamp expectation
```

Feature 024 must not rewrite source import data.

### 6.3 Matching Status Lifecycle

Required statuses:

* `unmatched`
* `mapped`
* `pending_review`
* `rejected`
* `unresolved`

Required lifecycle principles:

| Current          | Next             | Actor                    | Rule                                                                                                                      |
| ---------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `unmatched`      | `mapped`         | system or human reviewer | Allowed when a valid same-org `recipeId` reference exists.                                                                |
| `unmatched`      | `pending_review` | system                   | Allowed when no confident match exists and a staging candidate is created or required.                                    |
| `unmatched`      | `unresolved`     | system                   | Allowed when candidate creation fails or required reference data is missing.                                              |
| `pending_review` | `mapped`         | human reviewer           | Allowed when reviewer confirms a valid same-org recipe reference.                                                         |
| `pending_review` | `rejected`       | human reviewer           | Allowed when reviewer rejects the proposed candidate.                                                                     |
| `pending_review` | `unresolved`     | system or human reviewer | Allowed when conflict or missing reference cannot be safely resolved.                                                     |
| `unresolved`     | `pending_review` | human reviewer           | Allowed when reviewer reopens the case for review.                                                                        |
| `unresolved`     | `mapped`         | human reviewer           | Allowed only with valid same-org recipe reference and field-level validation.                                             |
| `mapped`         | `mapped`         | system                   | Metadata-only update allowed for safe refresh fields such as `updatedAt`; no recipe remapping unless explicitly reviewed. |
| `mapped`         | `unmatched`      | none                     | Forbidden.                                                                                                                |
| `mapped`         | `pending_review` | none                     | Forbidden.                                                                                                                |
| `rejected`       | any              | none                     | Rejected is final unless a future feature explicitly authorizes reopening.                                                |

Failure behavior:

* Candidate creation failure must not mutate raw import fields.
* Cross-org `recipeId` or `candidateId` mismatch must deny.
* Multiple candidates must result in safe review state, not automatic mapping.
* `matchingError` must persist enough information for review.
* Partial writes must be avoided.

### 6.4 ProposedRecipeCandidate Governance

`ProposedRecipeCandidate` is staging-only.

Required constraints:

* Organization scoped.
* Connected to a staging `MenuImportItem`.
* Ingredients are `string[]`.
* Each ingredient string must be trimmed and non-empty.
* Ingredient strings must not be formal `ingredientId`.
* Ingredient strings must not be formal `recipeIngredientId`.
* Candidate confirmation must not create a formal recipe.
* Candidate confirmation must not create formal ingredients.
* Candidate confirmation must not create formal recipeIngredients.
* Delete should be false unless a future reviewed feature changes this.

Suggested status values:

* `pending`
* `confirmed`
* `rejected`

Confirmation means human review status only. It does not promote to formal recipe data.

### 6.5 RecipeAlias Governance

RecipeAlias supports dish-name alias matching.

Required status values:

* `pending`
* `confirmed`
* `rejected`

Required governance:

* Organization scoped.
* `rawAlias` must be trim non-empty.
* `normalizedAlias` must be generated consistently.
* `recipeId` is reference-only.
* `confirmed` aliases have immutable core fields.
* `rejected` is final.
* Delete false.
* Duplicate conflict handling required.
* High-concurrency duplicate creation must be handled by transaction or equivalent safe mechanism.

Duplicate handling:

| Case                                                 | Required behavior                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Same org + same normalizedAlias + same recipeId      | Treat as idempotent or safe duplicate; must not create conflicting duplicate. |
| Same org + same normalizedAlias + different recipeId | Reject / conflict; must not silently overwrite.                               |
| Different org + same normalizedAlias                 | Allowed if organization scope is respected.                                   |

Uniqueness mitigation must use reviewed design, such as:

* organization-scoped path key strategy
* application-level transaction
* composite index for lookup / review

## 7. Accepted Implementation Plan Consolidation

The external governance trail accepted the implementation planning direction as:

```text
Claude Implementation Plan v1.0 + v1.0.1 Addendum — ACCEPTED
```

Because the original accepted full text was not found in repo, this section consolidates the accepted planning constraints.

### 7.1 Implementation Strategy

Implementation must be limited and additive.

Expected implementation areas may include:

* Type definitions
* Matching service
* Candidate staging service
* RecipeAlias governance helper
* Firestore rules
* Verification tests / manual verification matrix
* Documentation updates

Actual file paths must be confirmed against current repo structure before coding.

### 7.2 Recipes Read Scope

Accepted choice:

```text
recipes are organization-scoped read
```

Rules:

* Recipes may be read only within matching organization scope.
* `recipes` write is false.
* `ingredients` write is false.
* `recipeIngredients` write is false.
* `recipeId` is reference-only and must not trigger formal writes.

### 7.3 Actor-Level Lifecycle Controls

Actors:

* system
* human reviewer

System may:

* attempt matching
* set safe automatic status transitions
* create staging-only candidate records when allowed
* write `matchingError` on safe failures
* perform metadata-only refresh for already mapped items when allowed

Human reviewer may:

* confirm pending review to mapped with valid same-org recipe reference
* reject pending review
* reopen unresolved to pending review
* resolve unresolved to mapped with valid same-org recipe reference

Forbidden:

* system cannot force unsafe cross-org mapping
* human reviewer cannot mutate raw import fields
* mapped cannot revert to unmatched
* mapped cannot revert to pending_review
* rejected cannot reopen in Feature 024

### 7.4 Verification Requirements

Verification must cover:

* Cross-org read denial.
* Cross-org write denial.
* Missing `orgId` token denial.
* Formal collection writes denied:
  * recipes
  * ingredients
  * recipeIngredients
* Extra fields denied.
* Missing required fields denied.
* Invalid status enum denied.
* Invalid lifecycle transition denied.
* Invalid actor transition denied.
* Raw import fields immutable.
* Candidate creation failure preserves safe prior state.
* Multiple candidate conflict behavior.
* `matchingError` persistence.
* High-concurrency duplicate alias conflict.
* Confirmed alias mutation denied.
* Rejected alias reopen denied.
* Same-org duplicate normalizedAlias conflict denied.
* Different-org same normalizedAlias allowed.
* Candidate confirmed does not create formal recipe / ingredients / recipeIngredients.
* Cross-org recipeId / candidateId mismatch denied.
* Batch failure does not pollute raw import fields.

## 8. Current Authorization After Reconciliation Package

After this document is added and `docs/CURRENT_SSOT.md` is updated, implementation is still not automatically authorized.

Required next step:

```text
Grok / Gatekeeper review of documentation-only reconciliation commit
```

Only after review passes may Gatekeeper re-authorize limited coding.

## 9. Current Status To Write Into CURRENT_SSOT

```text
Feature 024: SSOT RECONCILIATION IN PROGRESS

Spec status:
External governance trail indicates Spec v1.6 Final Micro Patch was accepted, but original full text was not found in repo. This consolidated package captures the accepted boundary for repo reconciliation.

Implementation Plan status:
External governance trail indicates Plan v1.0 + v1.0.1 Addendum was accepted, but original full text was not found in repo. This consolidated package captures the accepted implementation planning boundary for repo reconciliation.

Execution:
Implementation coding remains paused until this docs-only reconciliation is reviewed.

Authorization:
Docs-only reconciliation authorized.
Feature implementation coding not authorized until Gatekeeper explicitly re-authorizes after reconciliation review.
```

## 10. Non-Negotiable Prohibitions

Until Gatekeeper explicitly re-authorizes limited coding after reconciliation review, do not:

* implement Feature 024 code
* create Feature 024 service logic
* modify Firestore rules for implementation
* add tests for implementation
* create implementation branch
* create PR
* merge
* deploy
* modify production Firestore data
* expand Feature 024 scope
* use PR #50 or bundled branch content

## 11. Next Required Action

1. Commit this document as documentation-only reconciliation.
2. Update `docs/CURRENT_SSOT.md` to reflect SSOT RECONCILIATION IN PROGRESS.
3. Stop.
4. Report:
   * branch name
   * commit hash
   * changed files
   * confirmation that no implementation code was changed
5. Wait for Grok / Gatekeeper review.
