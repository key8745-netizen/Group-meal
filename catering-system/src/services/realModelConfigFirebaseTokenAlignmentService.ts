/**
 * realModelConfigFirebaseTokenAlignmentService.ts
 *
 * Feature 008 Phase 4: Production-like Upstream Verification Alignment
 *
 * Validates that the upstream middleware-injected verified context is
 * consistent with the simulated Firebase Admin token parse result.
 * Phase 4 does NOT call Firebase Admin SDK; callers supply both objects
 * as plain inputs.  Phase 5+ will replace the token parse result with
 * the real output of `admin.auth().verifyIdToken()`.
 *
 * Three-way consistency check:
 *  A. Middleware verified context (injected by upstream server)
 *  B. Simulated Firebase token parse result (uid, tenantId, signInProvider)
 *  C. Request-level callerUserId + requestTenantId
 *
 * Any two-way mismatch → BLOCKED.
 *
 * HARD RULES:
 *  - No Firestore reads, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { TokenVerificationSource } from '../types/realApplyTransactionExecution';

// ─── Input types ─────────────────────────────────────────────────────────────

/**
 * Middleware-injected verified context — represents what an upstream
 * server middleware extracted and injected into the request context
 * after verifying the token.
 */
export interface MiddlewareVerifiedContext {
  readonly _kind: 'middleware_verified_context';
  /** User id extracted and verified by the middleware */
  verifiedUserId: string;
  /** Tenant id extracted and verified by the middleware */
  verifiedTenantId: TenantId;
  /** Sign-in provider extracted and verified by the middleware */
  verifiedSignInProvider: string;
}

/**
 * Simulated Firebase Admin token parse result.
 * Phase 4: plain input — not a real firebase-admin DecodedIdToken.
 * Phase 5+ will be populated from `admin.auth().verifyIdToken(token)`.
 */
export interface SimulatedFirebaseTokenParseResult {
  readonly _kind: 'simulated_firebase_token_parse_result';
  /** Firebase uid from token */
  uid: string;
  /** Tenant id from token (Firebase tenantId claim) */
  tenantId: TenantId;
  /** Sign-in provider from token (sign_in_provider) */
  signInProvider?: string;
  /**
   * Whether the token was verified by Firebase Admin SDK.
   * Must be 'verified' for a trusted real-apply context.
   * Phase 4: simulated — Phase 5+ will set from real verifyIdToken call.
   */
  verificationStatus?: 'verified' | 'unverified' | 'forged' | string;
  /** Token verification source */
  tokenVerificationSource?: TokenVerificationSource;
  /** Whether caller is a Service Account / Admin SDK principal */
  isServiceAccount?: boolean;
}

export interface TokenAlignmentInput {
  middlewareContext: MiddlewareVerifiedContext | null | undefined;
  tokenParseResult: SimulatedFirebaseTokenParseResult | null | undefined;
  callerUserId: string;
  requestTenantId: TenantId;
}

export interface TokenAlignmentResult {
  valid: boolean;
  blockedReasons: BlockedReason[];
}

// ─── Trusted verification sources ────────────────────────────────────────────

const TRUSTED_SOURCES = new Set<TokenVerificationSource>([
  'FIREBASE_ADMIN_SDK',
  'MIDDLEWARE_SERVER',
]);

const SERVICE_ACCOUNT_PROVIDERS = new Set([
  'google.com/service-account',
  'service-account',
  'iam',
  'admin-sdk',
  'custom',
]);

// ─── Validator ───────────────────────────────────────────────────────────────

/**
 * Validates three-way consistency between:
 *   - upstream middleware verified context
 *   - simulated Firebase token parse result
 *   - request-level caller identity
 *
 * All three must agree on uid, tenantId, and signInProvider.
 * Any mismatch → BLOCKED.
 */
export function validateFirebaseTokenAlignment(
  input: TokenAlignmentInput,
): TokenAlignmentResult {
  const blocked: BlockedReason[] = [];

  // ── Token parse result must be present ────────────────────────────────────
  if (!input.tokenParseResult) {
    blocked.push('F008_TOKEN_VERIFICATION_MISSING');
    return { valid: false, blockedReasons: blocked };
  }

  const tok = input.tokenParseResult;

  // structural kind check
  if ((tok as { _kind?: string })._kind !== 'simulated_firebase_token_parse_result') {
    blocked.push('F008_TOKEN_VERIFICATION_MALFORMED');
    return { valid: false, blockedReasons: blocked };
  }

  // ── Token verification status must be 'verified' ──────────────────────────
  if (tok.verificationStatus === undefined || tok.verificationStatus === null) {
    blocked.push('F008_TOKEN_VERIFICATION_MISSING');
  } else if (tok.verificationStatus !== 'verified') {
    blocked.push('F008_TOKEN_VERIFICATION_MALFORMED');
  }

  // ── Token verification source must be trusted ─────────────────────────────
  if (
    tok.tokenVerificationSource !== undefined &&
    !TRUSTED_SOURCES.has(tok.tokenVerificationSource)
  ) {
    blocked.push('F008_TOKEN_SOURCE_UNTRUSTED');
  }

  // ── signInProvider must be present in token ───────────────────────────────
  if (!tok.signInProvider || tok.signInProvider.trim() === '') {
    blocked.push('F008_TOKEN_PROVIDER_MISSING');
  }

  // ── Service Account token must not claim human apply ──────────────────────
  if (
    tok.isServiceAccount === true ||
    (tok.signInProvider && SERVICE_ACCOUNT_PROVIDERS.has(tok.signInProvider))
  ) {
    blocked.push('F008_TOKEN_SERVICE_ACCOUNT_BLOCKED');
  }

  // ── token.uid must match callerUserId ────────────────────────────────────
  if (tok.uid !== input.callerUserId) {
    blocked.push('F008_TOKEN_UID_MISMATCH');
  }

  // ── token.tenantId must match requestTenantId ────────────────────────────
  if ((tok.tenantId as string) !== (input.requestTenantId as string)) {
    blocked.push('F008_TOKEN_TENANT_MISMATCH');
  }

  // ── Middleware context alignment ───────────────────────────────────────────
  if (input.middlewareContext) {
    const mw = input.middlewareContext;

    // middleware.verifiedUserId must match callerUserId
    if (mw.verifiedUserId !== input.callerUserId) {
      blocked.push('F008_MIDDLEWARE_USER_MISMATCH');
    }

    // middleware.verifiedUserId must match token.uid
    if (mw.verifiedUserId !== tok.uid) {
      blocked.push('F008_MIDDLEWARE_USER_MISMATCH');
    }

    // middleware.verifiedTenantId must match requestTenantId
    if ((mw.verifiedTenantId as string) !== (input.requestTenantId as string)) {
      blocked.push('F008_MIDDLEWARE_TENANT_MISMATCH');
    }

    // middleware.verifiedTenantId must match token.tenantId
    if ((mw.verifiedTenantId as string) !== (tok.tenantId as string)) {
      blocked.push('F008_MIDDLEWARE_TENANT_MISMATCH');
    }

    // middleware.verifiedSignInProvider must match token.signInProvider
    if (
      tok.signInProvider &&
      mw.verifiedSignInProvider !== tok.signInProvider
    ) {
      blocked.push('F008_MIDDLEWARE_PROVIDER_MISMATCH');
    }
  }

  const unique = [...new Set(blocked)] as BlockedReason[];
  return { valid: unique.length === 0, blockedReasons: unique };
}
