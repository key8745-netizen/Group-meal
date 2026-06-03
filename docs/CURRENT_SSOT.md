# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Production Deployment: Feature 001 + Feature 002 + Feature 003

---

## Current Phase

Production Deployment

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* System Release Gate: PASSED
* Merge: COMPLETED
* Production Deployment Checklist: PASSED
* Current Branch: `claude/fervent-dirac-HJT01`
* Current Commit: `fbf6593`
* Full Test Suite: 1026/1026 pass
* Typecheck: PASS
* Build: PASS
* Production Readiness Checklist: PASS
* Grok Final Production Readiness Review: 96/100
* Production Deployment Recommendation: READY_FOR_PRODUCTION_DEPLOYMENT
* ChatGPT Decision: Claude GO - Production Deployment only

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`fbf6593`

---

## Allowed in this phase

* Production deployment
* Deployment verification
* Environment variable confirmation
* Firebase / Netlify deployment checks
* Post-deployment smoke tests
* Post-release monitoring checklist
* Release completion report
* SSOT update

---

## Forbidden in this phase

* Do not start Feature 004
* Do not introduce new business logic
* Do not add UI
* Do not add Netlify Functions
* Do not modify Feature 001 core flow
* Do not modify Feature 002 inventory mutation logic
* Do not modify Feature 003 prediction logic
* Do not modify settings behavior
* Do not add new Firestore write paths
* Do not bypass backend guards
* Do not bypass idempotency locks
* Do not write performanceLogs / finalizedPerformanceLogs / operationalReports
* Do not allow AI approval, AI submit, AI receiving, or AI rule mutation
* Do not allow prediction output to become executable purchase action

---

## Required Guard Rails

* Feature 001 human-in-the-loop purchase boundary must remain intact.
* Feature 002 receiving and inventory update must remain transaction-only.
* Feature 003 prediction engine must remain pure computation.
* AI cannot approve, submit, receive, mutate inventory, write settings, or apply model config.
* Prediction output must remain dry-run and non-executable.
* Audit trail must remain traceable across snapshot, suggestion, prediction, purchase order, receiving, and inventory transaction.
* Duplicate receiving must remain blocked.
* Retry must not duplicate inventory updates.
* ai_performance_metrics must remain isolated from operational performance logs.
* Production deployment must not introduce new unreviewed write paths.

---

## Team State

* Claude: GO - Production Deployment only
* Gemini: HOLD
* Grok: Prepare post-release quick check after deployment
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

Claude Production Deployment report:
* deployed branch
* deployed commit
* deployment target
* deployment status
* smoke test result
* production environment check result
* whether tests/typecheck/build remain passing
* whether no new business logic was added
* whether Feature 004 was not started
* known deployment limitations
* final recommendation: DEPLOYMENT_COMPLETE / BLOCKED

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
