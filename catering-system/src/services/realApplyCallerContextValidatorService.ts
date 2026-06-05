/**
 * realApplyCallerContextValidatorService.ts
 *
 * Feature 008 Phase 1: Verified Caller Context Validator
 *
 * Validates that a caller context was verified by a trusted server-side authority,
 * not by client-supplied claims. Extends Feature 007's guard contract.
 *
 * Key rule: tokenVerificationSource must be FIREBASE_ADMIN_SDK or MIDDLEWARE_SERVER.
 * CLIENT_SUPPLIED and UNKNOWN are always BLOCKED — they cannot be trusted.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type {
  VerifiedCallerContextSnapshot,
  TokenVerificationSource,
  ExecutorValidationResult,
} from '../types/realApplyTransactionExecution';

const SERVICE_ACCOUNT_PROVIDERS = new Set([
  'google.com/service-account',
  'service-account',
  'iam',
  'admin-sdk',
  'custom',
]);

// Only these sources are trusted for real apply
const TRUSTED_VERIFICATION_SOURCES = new Set<TokenVerificationSource>([
  'FIREBASE_ADMIN_SDK',
  'MIDDLEWARE_SERVER',
]);

const HUMAN_CALLER_TYPES = new Set(['HUMAN']);

export interface CallerContextValidationInput {
  context: VerifiedCallerContextSnapshot | null | undefined;
  requestTenantId: TenantId;
  /** ISO 8601 now string — used to check token expiry */
  now: string;
}

function nowUnixSeconds(isoNow: string): number {
  return Math.floor(new Date(isoNow).getTime() / 1000);
}

/**
 * Validates that the caller context was verified by a trusted server-side source.
 *
 * Checks:
 *  1. Context must be present
 *  2. callerType must be HUMAN
 *  3. callerUserId must be present
 *  4. tokenVerificationSource must be FIREBASE_ADMIN_SDK or MIDDLEWARE_SERVER
 *  5. token must not be expired at time of validation
 *  6. tenantId in context must match request tenantId
 */
export function validateVerifiedCallerContext(
  input: CallerContextValidationInput,
): ExecutorValidationResult {
  const blocked: BlockedReason[] = [];

  if (!input.context) {
    blocked.push('REAL_EXEC_MISSING_CALLER_CONTEXT');
    return { valid: false, blockedReasons: blocked };
  }

  const ctx = input.context;

  // callerType must be HUMAN
  if (!HUMAN_CALLER_TYPES.has(ctx.callerType)) {
    blocked.push('REAL_EXEC_AI_CALLER_BLOCKED');
  }

  // callerUserId must be present and non-empty
  if (!ctx.callerUserId || ctx.callerUserId.trim() === '') {
    blocked.push('F008_CALLER_UID_MISSING');
  }

  // tokenVerificationSource must be a trusted server-side source
  if (!TRUSTED_VERIFICATION_SOURCES.has(ctx.tokenVerificationSource)) {
    blocked.push('F008_CALLER_VERIFICATION_SOURCE_UNTRUSTED');
    // CLIENT_SUPPLIED explicitly means token was not server-verified
    if (ctx.tokenVerificationSource === 'CLIENT_SUPPLIED') {
      blocked.push('F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER');
    }
  }

  // Token must not be expired
  const nowSec = nowUnixSeconds(input.now);
  if (typeof ctx.tokenExp === 'number' && ctx.tokenExp <= nowSec) {
    blocked.push('REAL_EXEC_TOKEN_CLAIMS_SPOOFED');
  }

  // tenantId in context must match request tenantId
  if (ctx.tenantId && (ctx.tenantId as string) !== (input.requestTenantId as string)) {
    blocked.push('F008_CALLER_TENANT_CLAIM_MISMATCH');
  }

  // Phase 2: upstream verification must be explicitly confirmed by server middleware
  if (
    TRUSTED_VERIFICATION_SOURCES.has(ctx.tokenVerificationSource) &&
    ctx.upstreamVerificationConfirmed === false
  ) {
    blocked.push('F008_CALLER_UPSTREAM_VERIFICATION_MISSING');
  }

  // Phase 2: service account / Admin SDK callers must not claim HUMAN callerType
  if (ctx.isServiceAccount === true && HUMAN_CALLER_TYPES.has(ctx.callerType)) {
    blocked.push('F008_CALLER_SERVICE_ACCOUNT_FORGED_HUMAN');
    if (ctx.signInProvider && SERVICE_ACCOUNT_PROVIDERS.has(ctx.signInProvider)) {
      blocked.push('F008_CALLER_ADMIN_SDK_FORGED_HUMAN');
    }
  }

  // Phase 2: token subject must match callerUserId when present
  if (ctx.tokenSubject !== undefined && ctx.tokenSubject !== ctx.callerUserId) {
    blocked.push('F008_CALLER_TOKEN_SUBJECT_MISMATCH');
  }

  return { valid: blocked.length === 0, blockedReasons: blocked };
}
