# Feature 009 Phase 1: Model Config Apply Transaction — Pure Logic & Validation

## Overview

Phase 1 implements the pure contract types and synchronous validation services for the real model config apply transaction executor. No Firestore reads or writes occur in Phase 1.

## Hard Rules

- No Firestore reads or writes
- No firebase-admin import
- No @google-cloud/firestore import
- No runTransaction call
- No settings mutation
- No settingsHistory write
- No real approval/apply/rollback records
- No UI, Netlify Functions, Cloud Functions
- All contract outputs: `executable: false`, `aiCanExecute: false`

## New Files

### Types
- `catering-system/src/types/realModelConfigApplyTransaction.ts` — All Phase 1 contract types

### Services
- `catering-system/src/services/realModelConfigApplyVerifiedCallerService.ts` — Verified human caller context validator
- `catering-system/src/services/realModelConfigApplyApprovalValidationService.ts` — Persisted approval validator
- `catering-system/src/services/realModelConfigApplyIdempotencyService.ts` — Idempotency lock lifecycle validator
- `catering-system/src/services/realModelConfigApplyTransactionContractService.ts` — Transaction read/write set contract builder
- `catering-system/src/services/realModelConfigApplyAbortContractService.ts` — Abort contract builder
- `catering-system/src/services/realModelConfigApplyAuditPayloadService.ts` — Audit event payload builder

### Tests
- `catering-system/src/services/__tests__/realModelConfigApplyPhase1.test.ts` — 99 assertions

### Scripts
- `scripts/check-feature009-forbidden-patterns.js` — Static guard / CI

## New BlockedReasons (aiBoundary.ts)

### Verified Caller
- `F009_CALLER_NOT_HUMAN`
- `F009_CALLER_SERVICE_ACCOUNT_BLOCKED`
- `F009_CALLER_ADMIN_SDK_BLOCKED`
- `F009_CALLER_MISSING_USER_ID`
- `F009_CALLER_MISSING_TENANT_ID`
- `F009_CALLER_TENANT_MISMATCH`
- `F009_CALLER_VERIFICATION_UNTRUSTED`
- `F009_CALLER_VERIFICATION_NOT_VERIFIED`

### Approval
- `F009_APPROVAL_MISSING`
- `F009_APPROVAL_NOT_APPROVED`
- `F009_APPROVAL_EXPIRED`
- `F009_APPROVAL_TENANT_MISMATCH`
- `F009_APPROVAL_APPROVED_BY_MISMATCH`
- `F009_APPROVAL_SOURCE_REC_MISMATCH`
- `F009_APPROVAL_AUDIT_TRAIL_MISMATCH`
- `F009_APPROVAL_MISSING_VERSION`
- `F009_APPROVAL_MISSING_HASH_FIELDS`
- `F009_APPROVAL_MISSING_APPLY_TOKEN`
- `F009_APPROVAL_ALREADY_CONSUMED`

### Idempotency Lock
- `F009_LOCK_ALREADY_CONSUMED`
- `F009_LOCK_PAYLOAD_MISMATCH`
- `F009_LOCK_APPROVALID_TOKEN_CONFLICT`
- `F009_LOCK_STALE_VERSION`
- `F009_LOCK_PENDING_CONFLICT`

### Abort Contract
- `F009_ABORT_REQUIRED`
- `F009_ABORT_LOCK_TRANSITION_REQUIRED`

## Test Coverage Summary

| Section | Assertions |
|---|---|
| Verified Caller Context | 18 |
| Persisted Approval | 20 |
| Idempotency Lock Lifecycle | 22 |
| Transaction Contract | 18 |
| Abort Contract | 10 |
| Audit Payload | 11 |
| Static Guard / CI | 5 |
| Boundary | 5 |
| **Total** | **99** |

## Phase 2 Notes

Phase 2 will add real Firestore reads inside `runTransaction`, using these contracts as the structural blueprint.
