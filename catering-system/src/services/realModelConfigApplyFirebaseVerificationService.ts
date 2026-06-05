/**
 * realModelConfigApplyFirebaseVerificationService.ts
 *
 * Feature 009 Phase 2: Firebase Token Verification Contract
 *
 * Pure validator for Firebase token parse result alignment with middleware
 * verified caller context. Models the three-way consistency check:
 * token ↔ caller ↔ middleware.
 *
 * HARD RULES:
 *  - No firebase-admin import
 *  - No @google-cloud/firestore import
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason } from '../types/aiBoundary';
import type { F009ValidationResult } from '../types/realModelConfigApplyTransaction';

// ─── Firebase token simulation types ─────────────────────────────────────────

export type FirebaseTokenVerificationSource =
  | 'FIREBASE_ADMIN_SDK'
  | 'MIDDLEWARE_SERVER'
  | 'CLIENT_SUPPLIED'
  | 'UNKNOWN';

export type FirebaseTokenVerificationStatus =
  | 'verified'
  | 'unverified'
  | 'forged'
  | string;

export type FirebaseTokenSignInProvider =
  | 'google.com'
  | 'password'
  | 'phone'
  | 'anonymous'
  | 'service-account'
  | 'iam'
  | 'admin-sdk'
  | 'custom'
  | string;

/**
 * Simulates the result of parsing/verifying a Firebase ID token.
 * In production this would come from firebase-admin verifyIdToken().
 * Phase 2: pure simulation — no actual Firebase SDK call.
 */
export interface SimulatedFirebaseTokenParseResult {
  readonly _kind: 'simulated_firebase_token_parse_result';
  uid: string;
  tenantId: string;
  signInProvider: FirebaseTokenSignInProvider;
  verificationStatus: FirebaseTokenVerificationStatus;
  tokenVerificationSource: FirebaseTokenVerificationSource;
  isServiceAccount: boolean;
}

/**
 * Full input for Firebase token verification cross-validation.
 * Checks consistency between: token ↔ caller request ↔ middleware verified context.
 */
export interface FirebaseVerificationInput {
  tokenParseResult: SimulatedFirebaseTokenParseResult | null | undefined;
  middlewareVerifiedUserId: string;
  middlewareVerifiedTenantId: string;
  middlewareVerifiedProvider: string | undefined;
  callerUserId: string;
  requestTenantId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_ACCOUNT_PROVIDERS = new Set<string>([
  'service-account',
  'iam',
  'admin-sdk',
  'custom',
]);

const TRUSTED_SOURCES = new Set<FirebaseTokenVerificationSource>([
  'FIREBASE_ADMIN_SDK',
  'MIDDLEWARE_SERVER',
]);

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validates a simulated Firebase token parse result for consistency with
 * caller context and middleware-verified identity.
 *
 * Checks are independent and all failures are collected (not early-exit).
 * Returns { valid, blockedReasons }.
 */
export function validateFirebaseTokenForApply(
  input: FirebaseVerificationInput,
): F009ValidationResult {
  const blockedReasons: BlockedReason[] = [];
  const { tokenParseResult, middlewareVerifiedUserId, middlewareVerifiedTenantId,
          middlewareVerifiedProvider, callerUserId, requestTenantId } = input;

  // 1. tokenParseResult null/undefined
  if (tokenParseResult == null) {
    blockedReasons.push('F009_FIREBASE_TOKEN_MISSING');
    return { valid: false, blockedReasons };
  }

  // 2. wrong _kind
  if (tokenParseResult._kind !== 'simulated_firebase_token_parse_result') {
    blockedReasons.push('F009_FIREBASE_TOKEN_MISSING');
    return { valid: false, blockedReasons };
  }

  const token = tokenParseResult;

  // 3. uid missing/empty
  if (!token.uid || token.uid.trim() === '') {
    blockedReasons.push('F009_FIREBASE_TOKEN_UID_MISSING');
  }

  // 4. tenantId missing/empty
  if (!token.tenantId || token.tenantId.trim() === '') {
    blockedReasons.push('F009_FIREBASE_TOKEN_TENANT_MISSING');
  }

  // 5. signInProvider missing/empty
  if (!token.signInProvider || token.signInProvider.trim() === '') {
    blockedReasons.push('F009_FIREBASE_TOKEN_PROVIDER_MISSING');
  }

  // 6. source untrusted
  if (!TRUSTED_SOURCES.has(token.tokenVerificationSource)) {
    blockedReasons.push('F009_FIREBASE_TOKEN_SOURCE_UNTRUSTED');
  }

  // 7. not verified
  if (token.verificationStatus !== 'verified') {
    blockedReasons.push('F009_FIREBASE_TOKEN_NOT_VERIFIED');
  }

  // 8. isServiceAccount flag
  if (token.isServiceAccount === true) {
    blockedReasons.push('F009_FIREBASE_TOKEN_SERVICE_ACCOUNT');
  }

  // 9. service-account-like provider
  if (SERVICE_ACCOUNT_PROVIDERS.has(token.signInProvider)) {
    blockedReasons.push('F009_FIREBASE_TOKEN_ADMIN_SDK');
  }

  // 10. uid ≠ callerUserId
  if (token.uid && token.uid !== callerUserId) {
    blockedReasons.push('F009_FIREBASE_TOKEN_UID_CALLER_MISMATCH');
  }

  // 11. tenantId ≠ requestTenantId
  if (token.tenantId && token.tenantId !== requestTenantId) {
    blockedReasons.push('F009_FIREBASE_TOKEN_TENANT_REQUEST_MISMATCH');
  }

  // 12. uid ≠ middlewareVerifiedUserId
  if (token.uid && token.uid !== middlewareVerifiedUserId) {
    blockedReasons.push('F009_FIREBASE_TOKEN_UID_MIDDLEWARE_MISMATCH');
  }

  // 13. tenantId ≠ middlewareVerifiedTenantId
  if (token.tenantId && token.tenantId !== middlewareVerifiedTenantId) {
    blockedReasons.push('F009_FIREBASE_TOKEN_TENANT_MIDDLEWARE_MISMATCH');
  }

  // 14. provider mismatch with middleware (only when middleware provides a value)
  if (
    middlewareVerifiedProvider !== undefined &&
    token.signInProvider &&
    token.signInProvider !== middlewareVerifiedProvider
  ) {
    blockedReasons.push('F009_FIREBASE_TOKEN_PROVIDER_MIDDLEWARE_MISMATCH');
  }

  return { valid: blockedReasons.length === 0, blockedReasons };
}
