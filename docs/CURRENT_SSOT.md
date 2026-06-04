# CURRENT SSOT — Group-meal

> This file is the single source of truth for the current development state.
> All AI agents must read this file before starting work or reviewing reports.
> Historical discussions are not instructions unless reflected in this file.

---

## Project

Group-meal 團膳管理系統

---

## Current Feature

Production Release Completed: Feature 001 + Feature 002 + Feature 003

---

## Current Phase

Post-Release Monitoring

---

## Current Basis

* Feature 001: CLOSED
* Feature 002: CLOSED
* Feature 003: CLOSED
* System Release Gate: PASSED
* Merge: COMPLETED
* Production Deployment Checklist: PASSED
* Production Deployment: COMPLETED
* Post-Release Quick Check: PASSED
* Deployed Branch: `claude/fervent-dirac-HJT01`
* Deployed Commit: `ffbabe8`
* Deployment Target: Netlify auto-deploy
* Full Test Suite: 1026/1026 pass
* Smoke Tests: 9 critical gates pass
* Typecheck: PASS
* Build: PASS
* Grok Post-Release Quick Check: 96/100
* Final Recommendation: DEPLOYMENT_COMPLETE
* ChatGPT Decision: Production Release Completed; begin Post-Release Monitoring before Feature 004

---

## Current Branch

`claude/fervent-dirac-HJT01`

---

## Current Commit

`ffbabe8`

---

## Allowed in this phase

* Post-release monitoring
* Production smoke verification
* Monitoring AI suggestion accuracy
* Monitoring receiving success rate
* Monitoring audit trail completeness
* Monitoring production error rate
* Monitoring duplicate receiving / retry behavior
* Monitoring prediction dry-run safety
* Monitoring ai_performance_metrics isolation
* Documentation updates
* Release notes updates
* SSOT update
* Feature 004 planning only after monitoring baseline is reviewed

---

## Forbidden in this phase

* Do not start Feature 004 implementation yet
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
* Post-release monitoring must not introduce new behavior.

---

## Post-Release Monitoring Focus

Monitor for the first production week:
* AI suggestion accuracy
* Prediction preview reasonableness
* Human override frequency
* Draft purchase suggestion creation success
* DRAFT → PENDING submit success
* PENDING → RECEIVED receiving success
* Duplicate receiving blocked count
* Retry safety
* Audit trail completeness
* ai_performance_metrics isolation
* Production runtime errors
* Firebase / Netlify deployment stability

---

## Known Accepted Risks

* PredictionInputSummary real construction layer remains future work.
* Per-item prediction bridging remains future work.
* Vite chunk size warning is pre-existing and not introduced by this release.

---

## Team State

* Claude: HOLD / Post-release monitoring support only
* Gemini: HOLD / Feature 004 planning later
* Grok: HOLD / Prepare post-release monitoring review if requested
* ChatGPT: Gatekeeper + SSOT maintainer
* ibi: Final authority

---

## Next Expected Input

ibi decision:
1. Start first-week post-release monitoring review
2. Prepare Feature 004 planning after monitoring baseline
3. Pause development and observe production

Recommended next input:
Claude post-release monitoring report after first observation window.

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
