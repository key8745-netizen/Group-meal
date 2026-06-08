# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Feature 009 Phase 5G: Production Readiness Final Boundary Planning

---

## Current Phase

Planning / Spec Design

---

## Current Basis

* Feature 001–008: CLOSED
* Feature 009 contract-readiness version: CLOSED
* Feature 009 Phase 5A: PASSED
* Feature 009 Phase 5A Post-Emulator Monitoring: PASSED
* Feature 009 Phase 5B Implementation: PASSED
* Feature 009 Phase 5B Post-Monitoring: PASSED
* Feature 009 Phase 5C Implementation: PASSED
* Feature 009 Phase 5C Post-Monitoring: PASSED
* Feature 009 Phase 5D Implementation: PASSED
* Feature 009 Phase 5D Post-Monitoring: PASSED
* Feature 009 Phase 5E Implementation: PASSED
* Feature 009 Phase 5E Post-Monitoring: PASSED
* Feature 009 Phase 5F Implementation: PASSED
* Feature 009 Phase 5F Implementation Commit: `54d2d87`
* Feature 009 Phase 5F Post-Monitoring: PASSED
* Feature 009 Phase 5F Post-Monitoring Commit: `ef821be`
* Feature 009 Phase 5F Grok Monitoring Review: PASS
* ChatGPT Decision: Phase 5F Monitoring PASSED; begin Phase 5G Planning / Spec Design only

---

## Current Branch

`claude/busy-heisenberg-HcwYg`

---

## Current Commit

`ef821be`

---

## Phase 5F Final Status

Phase 5F has completed the full cycle:
```
Spec → Grok Review → Gatekeeper GO → Implementation → Grok Code Review → Monitoring → Grok Monitoring Review
```

Confirmed:
* Zero Real Write maintained
* Readiness-only boundary maintained
* no production canary write
* no broad rollout
* no production mutation
* TracingInterceptor isolation maintained
* runtime validator default-deny maintained
* malformed / missing / stale token / flag BLOCKED
* Tenant Lock non-write / audit-only maintained
* ambiguous tenant lock state BLOCKED / DENY
* Dry-run audit difference > 0 BLOCKED
* Emergency Disable remains highest priority
* Feature Flag isolation maintained
* SOC / audit payload complete
* Static Guard 0 violations
* no UI / Netlify Function / Cloud Function
* no rollback / cleanup
* AI cannot apply / reset / approve reset / modify gate
* old Phase 5A–5E no regression
* tests / typecheck / build / static guard passed

---

## Phase 5G Goal

Plan the next step after Phase 5F readiness verification.
Phase 5G must decide whether the project should remain:
1. readiness-only,
2. staging-only,
3. extended dry-run readiness,
4. production-gated canary planning only,
5. limited production-gated canary proposal,
6. or no rollout.

No implementation is allowed until Gemini produces a full Phase 5G Spec, Grok reviews it, and ChatGPT / ibi explicitly approve Claude to proceed.

---

## Phase 5G Required Carry-over Topics

Gemini Phase 5G Spec must explicitly address:

### 1. P99 / HALT Runtime Validation
* P99 `<50ms` remains partly contract / staging modeled
* Phase 5G must define whether runtime validation is required
* Phase 5G must define whether this stays staging-only or moves to emulator / production-gated verification

### 2. Tenant Lock Future Production Re-validation
* Tenant Lock remained non-write / audit-only in Phase 5F
* Phase 5G must define whether any real tenant lock state mutation is in scope
* If any mutation is proposed, it must be treated as high-risk and require separate approval
* Default remains BLOCKED / DENY

### 3. Production Canary Boundary
* Phase 5F did not allow production canary write
* Phase 5G must explicitly decide whether production canary remains out-of-scope
* If limited production-gated canary is proposed, it must define gates, allowlists, manual approvals, emergency disable, audit, rollback boundary, kill criteria, and monitoring

### 4. Zero Real Write Boundary
* Phase 5G must explicitly decide whether Zero Real Write continues
* If any exception is proposed, it requires a new high-risk Spec and explicit Gatekeeper approval

---

## Allowed in this phase

* Gemini produces Phase 5G Spec
* Grok prepares Phase 5G Spec Review
* requirements discussion
* docs / SSOT update
* risk analysis
* acceptance criteria design
* monitoring / alerting design
* rollout boundary design
* canary boundary design
* kill criteria design
* Claude remains HOLD

---

## Forbidden in this phase

* Do not let Claude implement Phase 5G
* Do not enable real production write
* Do not enable production canary write
* Do not enable broad production rollout
* Do not add UI
* Do not add Netlify Functions
* Do not add Cloud Functions
* Do not implement rollback
* Do not implement cleanup job
* Do not allow AI to apply config
* Do not allow AI to reset kill switch
* Do not allow AI to approve reset
* Do not allow AI to modify production gate
* Do not bypass deployment gate
* Do not bypass tenant allowlist
* Do not bypass operator allowlist
* Do not bypass operator confirmation
* Do not bypass kill switch
* Do not bypass emergency disable
* Do not modify Feature 001–008 core flow
* Do not modify Feature 009 Phase 5A / 5B / 5C / 5D / 5E / 5F implementation behavior

---

## Required Phase 5G Spec Topics

Gemini must explicitly define:
1. Phase 5G goal
2. Phase 5G scope decision
3. relationship to Phase 5F
4. whether any production write is allowed
5. whether any production canary write is allowed
6. whether broad rollout remains forbidden
7. whether Zero Real Write continues
8. P99 / HALT runtime validation strategy
9. high-load / concurrency validation strategy
10. Tenant Lock future production re-validation
11. token / flag schema runtime boundary
12. dry-run audit threshold strategy
13. emergency disable priority
14. feature flag isolation
15. monitoring and alerting
16. rollout kill criteria
17. rollback boundary
18. cleanup boundary
19. UI boundary
20. Claude implementation scope, if any
21. allowed files, if any
22. forbidden files
23. required tests
24. exit criteria
25. blocker criteria
26. Grok red team checklist

---

## Team State

* Claude: HOLD
* Gemini: GO - Produce Feature 009 Phase 5G Spec
* Grok: GO - Prepare Phase 5G Spec Review
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Gemini Feature 009 Phase 5G Spec.
Spec must include Phase 5F known limitations as explicit acceptance criteria or explicit out-of-scope decisions.

Claude will remain HOLD and will not transition to Implementation until all three of the following appear in-conversation as substantive bodies (per the established three-artifact rule): (1) Gemini's full Phase 5G Spec body, (2) Grok's full independent itemized Spec Review body, (3) ChatGPT/ibi's formal Gatekeeper verdict + new SSOT content explicitly authorizing the transition.

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
