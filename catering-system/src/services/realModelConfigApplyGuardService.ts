/**
 * realModelConfigApplyGuardService.ts
 *
 * Feature 007 Phase 1 + Phase 2: Default-Deny Service Guard
 *
 * Validates that a caller is authorized to initiate a real model config apply.
 * Default behavior: DENY. Every check must pass for ALLOW.
 *
 * Phase 2 additions:
 *  - spoofed token claims detection
 *  - malformed caller context detection
 *  - sign_in_provider validation
 *  - contextValidated flag check
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - Tenant hard guard executes FIRST
 *  - AI caller is BLOCKED regardless of credential type
 *  - Unknown callerType is BLOCKED
 *  - Service Account / Admin SDK alone is INSUFFICIENT
 *  - Spoofed / malformed context is BLOCKED
 */

import type { BlockedReason } from '../types/aiBoundary';
import type {
  RealModelConfigApplyRequest,
  RealModelConfigApplyGuardResult,
  RealModelConfigApplyCallerContext,
} from '../types/realModelConfigApplyExecution';

// Known valid sign_in_providers for human callers
const VALID_HUMAN_SIGN_IN_PROVIDERS = new Set([
  'password',
  'google.com',
  'microsoft.com',
  'github.com',
  'facebook.com',
  'apple.com',
  'twitter.com',
  'custom',
]);

// Token claim fields that must be consistent — spoofing indicators
const REQUIRED_TOKEN_CLAIM_FIELDS = ['uid', 'iss', 'aud', 'iat', 'exp'] as const;

/**
 * Checks whether a tokenClaims object shows signs of spoofing:
 * - Required fields missing
 * - uid mismatch with callerUserId
 * - iat/exp invalid
 */
function detectSpoofedTokenClaims(
  tokenClaims: Record<string, unknown>,
  callerUserId: string,
): BlockedReason | null {
  // Required fields must be present
  for (const field of REQUIRED_TOKEN_CLAIM_FIELDS) {
    if (!(field in tokenClaims)) {
      return 'REAL_EXEC_TOKEN_CLAIMS_SPOOFED';
    }
  }

  // uid must match callerUserId
  if (typeof tokenClaims['uid'] === 'string' && tokenClaims['uid'] !== callerUserId) {
    return 'REAL_EXEC_TOKEN_CLAIMS_SPOOFED';
  }

  // iat and exp must be numbers
  if (typeof tokenClaims['iat'] !== 'number' || typeof tokenClaims['exp'] !== 'number') {
    return 'REAL_EXEC_TOKEN_CLAIMS_SPOOFED';
  }

  // exp must be after iat
  if ((tokenClaims['exp'] as number) <= (tokenClaims['iat'] as number)) {
    return 'REAL_EXEC_TOKEN_CLAIMS_SPOOFED';
  }

  return null;
}

/**
 * Validates signInProvider for a human caller.
 * - null / undefined / empty → BLOCKED (REAL_EXEC_SIGN_IN_PROVIDER_MISSING)
 * - unrecognized provider → BLOCKED (REAL_EXEC_SIGN_IN_PROVIDER_INVALID)
 */
function validateSignInProvider(
  ctx: RealModelConfigApplyCallerContext,
): BlockedReason | null {
  // Only check if the caller supplies tokenClaims (enriched context)
  // If tokenClaims not supplied, sign_in_provider check is advisory only
  if (ctx.tokenClaims === undefined) return null;

  if (ctx.signInProvider === null || ctx.signInProvider === undefined || ctx.signInProvider === '') {
    return 'REAL_EXEC_SIGN_IN_PROVIDER_MISSING';
  }
  if (!VALID_HUMAN_SIGN_IN_PROVIDERS.has(ctx.signInProvider)) {
    return 'REAL_EXEC_SIGN_IN_PROVIDER_INVALID';
  }
  return null;
}

/**
 * Default-deny entrance guard for real model config apply.
 *
 * Validation order (tenant hard guard first):
 *  1.  tenantId present (hard guard — early exit)
 *  2.  callerContext present (context parse guard — early exit)
 *  3.  contextValidated flag check (malformed context)
 *  4.  tokenClaims spoofing check (when supplied)
 *  5.  signInProvider validation (when tokenClaims supplied)
 *  6.  callerType is HUMAN (AI / UNKNOWN → BLOCKED)
 *  7.  Service Account alone without human userId → BLOCKED
 *  8.  Admin SDK alone without human userId → BLOCKED
 *  9.  callerUserId present (human identity required)
 *  10. approvalId present
 *  11. auditTrailId present
 *  12. expectedCurrentVersion present
 *  13. applyToken present
 *  14. newVersion present
 *  15. sourceRecommendationId present
 *
 * Default behavior: DENY — every check must pass for ALLOW.
 */
export function validateRealModelConfigApplyEntrance(
  request: RealModelConfigApplyRequest,
): RealModelConfigApplyGuardResult {
  const blocked: BlockedReason[] = [];

  // 1. Tenant hard guard — must be first, early exit
  if (!request.tenantId || (request.tenantId as string).trim() === '') {
    blocked.push('REAL_EXEC_TENANT_MISMATCH');
    return { allowed: false, blockedReasons: blocked };
  }

  // 2. Caller context must be present (context parse guard — early exit)
  if (!request.callerContext) {
    blocked.push('REAL_EXEC_MISSING_CALLER_CONTEXT');
    return { allowed: false, blockedReasons: blocked };
  }

  const ctx = request.callerContext;

  // 3. contextValidated === false → malformed / unvalidated context
  if (ctx.contextValidated === false) {
    blocked.push('REAL_EXEC_CALLER_CONTEXT_MALFORMED');
  }

  // 4. Token claims spoofing check (when tokenClaims explicitly supplied)
  if (ctx.tokenClaims !== undefined && ctx.tokenClaims !== null) {
    const callerUserId = ctx.callerUserId ?? '';
    const spoofReason = detectSpoofedTokenClaims(ctx.tokenClaims, callerUserId as string);
    if (spoofReason) {
      blocked.push(spoofReason);
    }
  }

  // 5. signInProvider validation (when tokenClaims supplied)
  const signInProviderError = validateSignInProvider(ctx);
  if (signInProviderError) {
    blocked.push(signInProviderError);
  }

  // 6. callerType must be HUMAN — AI always blocked, unknown always blocked
  if (ctx.callerType === 'AI') {
    blocked.push('REAL_EXEC_AI_CALLER_BLOCKED');
  } else if (ctx.callerType !== 'HUMAN') {
    blocked.push('REAL_EXEC_UNKNOWN_CALLER_TYPE');
  }

  // 7. Service Account alone is insufficient — human userId still required
  if (ctx.isServiceAccount && !ctx.callerUserId) {
    blocked.push('REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT');
  }

  // 8. Admin SDK alone is insufficient — business guard still applies
  if (ctx.isAdminSdk && !ctx.callerUserId) {
    blocked.push('REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT');
  }

  // 9. Human user id must be present
  if (!ctx.callerUserId || (ctx.callerUserId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_HUMAN_USER_ID');
  }

  // 10. approvalId required
  if (!request.approvalId || (request.approvalId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_APPROVAL_ID');
  }

  // 11. auditTrailId required
  if (!request.auditTrailId || (request.auditTrailId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_AUDIT_TRAIL_ID');
  }

  // 12. expectedCurrentVersion required
  if (!request.expectedCurrentVersion || (request.expectedCurrentVersion as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_EXPECTED_VERSION');
  }

  // 13. applyToken required
  if (!request.applyToken || (request.applyToken as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_APPLY_TOKEN');
  }

  // 14. newVersion required
  if (!request.newVersion || (request.newVersion as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_NEW_VERSION');
  }

  // 15. sourceRecommendationId required
  if (!request.sourceRecommendationId || (request.sourceRecommendationId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID');
  }

  return { allowed: blocked.length === 0, blockedReasons: blocked };
}
