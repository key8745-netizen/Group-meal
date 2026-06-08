/**
 * realModelConfigApplyVerifiedCallerService.ts
 *
 * Feature 009 Phase 1: Verified Human Caller Context Validator
 *
 * Validates that a caller context came from a trusted server-side source
 * and represents a verified human user — not an AI, Service Account, or
 * Admin SDK caller.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction
 *  - Pure synchronous — no I/O, no side effects
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { VerifiedHumanCallerContext, F009ValidationResult } from '../types/realModelConfigApplyTransaction';
import type { TokenVerificationSource } from '../types/realApplyTransactionExecution';

const TRUSTED_SOURCES = new Set<TokenVerificationSource>(['FIREBASE_ADMIN_SDK', 'MIDDLEWARE_SERVER']);

const SERVICE_ACCOUNT_PROVIDERS = new Set([
  'google.com/service-account', 'service-account', 'iam', 'admin-sdk', 'custom',
]);

export interface CallerValidationInput {
  context: VerifiedHumanCallerContext | null | undefined;
  requestTenantId: TenantId;
  now: string;
}

function nowSec(iso: string): number { return Math.floor(new Date(iso).getTime() / 1000); }
function str(v: unknown): string { return v as string; }

export function validateRealApplyCallerContext(input: CallerValidationInput): F009ValidationResult {
  const blocked: BlockedReason[] = [];

  if (!input.context) {
    return { valid: false, blockedReasons: ['REAL_EXEC_MISSING_CALLER_CONTEXT'] };
  }

  const ctx = input.context;

  if ((ctx as { _kind?: string })._kind !== 'verified_human_caller_context') {
    return { valid: false, blockedReasons: ['F009_CALLER_NOT_HUMAN'] };
  }

  // must be HUMAN
  if (ctx.callerType !== 'HUMAN') {
    if (ctx.callerType === 'AI') blocked.push('F009_CALLER_NOT_HUMAN', 'REAL_EXEC_AI_CALLER_BLOCKED');
    else if (ctx.callerType === 'SERVICE_ACCOUNT') blocked.push('F009_CALLER_SERVICE_ACCOUNT_BLOCKED');
    else if (ctx.callerType === 'ADMIN_SDK') blocked.push('F009_CALLER_ADMIN_SDK_BLOCKED');
    else blocked.push('F009_CALLER_NOT_HUMAN');
  }

  // service account provider check
  if (ctx.isServiceAccount === true) {
    blocked.push('F009_CALLER_SERVICE_ACCOUNT_BLOCKED');
    if (ctx.signInProvider && SERVICE_ACCOUNT_PROVIDERS.has(ctx.signInProvider)) {
      blocked.push('F009_CALLER_ADMIN_SDK_BLOCKED');
    }
  }

  // callerUserId must be present
  if (!ctx.callerUserId || ctx.callerUserId.trim() === '') blocked.push('F009_CALLER_MISSING_USER_ID');

  // tenantId must be present
  if (!ctx.tenantId || str(ctx.tenantId).trim() === '') {
    blocked.push('F009_CALLER_MISSING_TENANT_ID');
  } else if (str(ctx.tenantId) !== str(input.requestTenantId)) {
    blocked.push('F009_CALLER_TENANT_MISMATCH');
  }

  // tokenVerificationSource must be trusted
  if (!TRUSTED_SOURCES.has(ctx.tokenVerificationSource)) {
    blocked.push('F009_CALLER_VERIFICATION_UNTRUSTED');
    if (ctx.tokenVerificationSource === 'CLIENT_SUPPLIED') {
      blocked.push('F008_CALLER_TOKEN_NOT_VERIFIED_BY_SERVER');
    }
  }

  // tokenVerificationStatus must be 'verified'
  if (ctx.tokenVerificationStatus === undefined || ctx.tokenVerificationStatus === null) {
    blocked.push('F009_CALLER_VERIFICATION_NOT_VERIFIED');
  } else if (ctx.tokenVerificationStatus !== 'verified') {
    blocked.push('F009_CALLER_VERIFICATION_NOT_VERIFIED');
  }

  // upstream verification must not be explicitly false
  if (TRUSTED_SOURCES.has(ctx.tokenVerificationSource) && ctx.upstreamVerificationConfirmed === false) {
    blocked.push('F008_CALLER_UPSTREAM_VERIFICATION_MISSING');
  }

  // tokenSubject must match callerUserId when present
  if (ctx.tokenSubject !== undefined && ctx.tokenSubject !== '' && ctx.tokenSubject !== ctx.callerUserId) {
    blocked.push('F008_CALLER_TOKEN_SUBJECT_MISMATCH');
  }

  // tokenSubject required for trusted sources
  if (
    TRUSTED_SOURCES.has(ctx.tokenVerificationSource) &&
    (ctx.tokenSubject === undefined || ctx.tokenSubject === null || ctx.tokenSubject === '')
  ) {
    blocked.push('F008_CALLER_VERIFIED_SUBJECT_MISSING');
  }

  // token must not be expired
  if (typeof ctx.tokenExp === 'number' && ctx.tokenExp <= nowSec(input.now)) {
    blocked.push('REAL_EXEC_TOKEN_CLAIMS_SPOOFED');
  }

  const unique = [...new Set(blocked)] as BlockedReason[];
  return { valid: unique.length === 0, blockedReasons: unique };
}
