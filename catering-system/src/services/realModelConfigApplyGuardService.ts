/**
 * realModelConfigApplyGuardService.ts
 *
 * Feature 007 Phase 1 + Phase 2 + Phase 3: Default-Deny Service Guard
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
 * Phase 3 additions:
 *  - forged sign_in_provider with valid uid → BLOCKED
 *  - provider / callerType mismatch → BLOCKED
 *  - Service Account forged human context → BLOCKED
 *  - Admin SDK forged human context → BLOCKED
 *  - token claims tenantId mismatch → BLOCKED
 *  - untrusted role / admin claims → BLOCKED
 *  - provider / user identity mismatch → BLOCKED
 *
 * Phase 4 additions:
 *  - tokenVerificationStatus forged / unverified / missing / malformed → BLOCKED
 *  - injected permission / tenant / approval / serviceAccount / provider claims → BLOCKED
 *  - conflicting claims → BLOCKED
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - Tenant hard guard executes FIRST
 *  - AI caller is BLOCKED regardless of credential type
 *  - Unknown callerType is BLOCKED
 *  - Service Account / Admin SDK alone is INSUFFICIENT
 *  - Spoofed / malformed / forged context is BLOCKED
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
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

// Provider strings that indicate non-human / machine identity
const SERVICE_ACCOUNT_PROVIDERS = new Set([
  'service_account',
  'serviceAccount',
  'service-account',
]);

/**
 * Phase 3: Detects advanced forged / mismatched context.
 * Returns array of blocked reasons (all distinct violations collected).
 */
function detectAdvancedForgedContext(
  ctx: RealModelConfigApplyCallerContext,
  requestTenantId: TenantId,
): BlockedReason[] {
  const blocked: BlockedReason[] = [];
  const claims = ctx.tokenClaims;

  if (!claims) return blocked;

  // Service Account context + human callerType → forged
  if (ctx.isServiceAccount && ctx.callerType === 'HUMAN' && ctx.callerUserId) {
    // isServiceAccount flag contradicts HUMAN callerType with a userId — potential impersonation
    // Only block when provider also points to service_account
    const provider = (ctx.signInProvider ?? '') as string;
    if (SERVICE_ACCOUNT_PROVIDERS.has(provider)) {
      blocked.push('REAL_EXEC_SERVICE_ACCOUNT_FORGED_HUMAN_CONTEXT');
    }
  }

  // Admin SDK context + service_account provider → Admin SDK forged human context
  if (ctx.isAdminSdk && ctx.callerType === 'HUMAN') {
    const provider = (ctx.signInProvider ?? '') as string;
    if (SERVICE_ACCOUNT_PROVIDERS.has(provider)) {
      blocked.push('REAL_EXEC_ADMIN_SDK_FORGED_HUMAN_CONTEXT');
    }
  }

  // callerType HUMAN but provider explicitly says serviceAccount → mismatch
  if (ctx.callerType === 'HUMAN') {
    const provider = (ctx.signInProvider ?? '') as string;
    if (SERVICE_ACCOUNT_PROVIDERS.has(provider)) {
      blocked.push('REAL_EXEC_CALLER_TYPE_PROVIDER_MISMATCH');
    }
  }

  // token claims tenantId mismatch (if tenantId claim present)
  if (typeof claims['tenantId'] === 'string' && claims['tenantId'] !== (requestTenantId as string)) {
    blocked.push('REAL_EXEC_TOKEN_TENANT_MISMATCH');
  }

  // Untrusted role / admin claim — any claim asserting elevated role without approved human context
  if (
    claims['role'] === 'admin' ||
    claims['admin'] === true ||
    claims['superuser'] === true ||
    claims['isAdmin'] === true
  ) {
    // Admin/role claims in raw token claims are untrusted — must be verified by middleware
    // contextValidated===true is required to accept them; if they appear without contextValidated
    // the guard treats them as suspicious injection
    if (ctx.contextValidated !== true) {
      blocked.push('REAL_EXEC_ROLE_CLAIM_UNTRUSTED');
    }
  }

  // sign_in_provider / uid identity mismatch (provider says human but uid looks like service account)
  const provider = (ctx.signInProvider ?? '') as string;
  const uid = typeof claims['uid'] === 'string' ? claims['uid'] : '';
  if (
    VALID_HUMAN_SIGN_IN_PROVIDERS.has(provider) &&
    (uid.startsWith('service-account') || uid.includes('@') && uid.endsWith('.gserviceaccount.com'))
  ) {
    blocked.push('REAL_EXEC_PROVIDER_USER_MISMATCH');
  }

  // Malicious injected claims: unknown extra fields with suspicious keys
  const SUSPICIOUS_CLAIM_KEYS = ['override', 'bypass', 'elevate', 'forceAllow', 'sudo', 'root'];
  for (const key of SUSPICIOUS_CLAIM_KEYS) {
    if (key in claims && claims[key] === true) {
      blocked.push('REAL_EXEC_TOKEN_CLAIMS_SPOOFED');
      break;
    }
  }

  return blocked;
}

// Injection claim keys that indicate forged elevation attempts
const INJECTED_PERMISSION_KEYS = ['permissions', 'applyConfig', 'applyModelConfig', 'allowApply'] as const;
const INJECTED_OVERRIDE_KEYS_TENANT = ['tenantOverride', 'forceTenantId', 'impersonateTenant'] as const;
const INJECTED_OVERRIDE_KEYS_APPROVAL = ['approvalOverride', 'forceApproval', 'skipApproval'] as const;
const INJECTED_SA_KEYS = ['isServiceAccount', 'serviceAccountFlag', 'serviceAccount'] as const;
const INJECTED_PROVIDER_KEYS = ['providerOverride', 'forceProvider', 'overrideProvider'] as const;

/**
 * Phase 4: Validates tokenVerificationStatus on the caller context.
 * When tokenClaims are supplied, verification status must be explicitly 'verified'.
 * Anything else → BLOCKED.
 */
function detectForgedTokenSignature(
  ctx: RealModelConfigApplyCallerContext,
): BlockedReason[] {
  const blocked: BlockedReason[] = [];

  // Only applies when tokenClaims are supplied
  if (!ctx.tokenClaims) return blocked;

  const status = ctx.tokenVerificationStatus;

  if (status === 'forged') {
    blocked.push('REAL_EXEC_TOKEN_SIGNATURE_FORGED');
    return blocked;
  }
  if (status === 'unverified') {
    blocked.push('REAL_EXEC_TOKEN_UNVERIFIED');
    return blocked;
  }
  if (status === undefined || status === null) {
    blocked.push('REAL_EXEC_TOKEN_VERIFICATION_STATUS_MISSING');
    return blocked;
  }
  if (status !== 'verified') {
    // Any non-standard / malformed string value
    blocked.push('REAL_EXEC_TOKEN_VERIFICATION_STATUS_MALFORMED');
    return blocked;
  }

  return blocked;
}

/**
 * Phase 4: Detects injected / conflicting claims that indicate multi-claim injection attacks.
 */
function detectInjectedClaims(
  ctx: RealModelConfigApplyCallerContext,
): BlockedReason[] {
  const blocked: BlockedReason[] = [];
  const claims = ctx.tokenClaims;

  if (!claims) return blocked;

  // Injected permission claims
  for (const key of INJECTED_PERMISSION_KEYS) {
    if (key in claims) {
      blocked.push('REAL_EXEC_INJECTED_PERMISSION_CLAIM');
      break;
    }
  }

  // Injected tenant override
  for (const key of INJECTED_OVERRIDE_KEYS_TENANT) {
    if (key in claims) {
      blocked.push('REAL_EXEC_INJECTED_TENANT_OVERRIDE');
      break;
    }
  }

  // Injected approval override
  for (const key of INJECTED_OVERRIDE_KEYS_APPROVAL) {
    if (key in claims) {
      blocked.push('REAL_EXEC_INJECTED_APPROVAL_OVERRIDE');
      break;
    }
  }

  // Injected service account flag inside claims (not the CallerContext flag)
  for (const key of INJECTED_SA_KEYS) {
    if (key in claims && claims[key] === true) {
      blocked.push('REAL_EXEC_INJECTED_SERVICE_ACCOUNT_FLAG');
      break;
    }
  }

  // Injected provider override
  for (const key of INJECTED_PROVIDER_KEYS) {
    if (key in claims) {
      blocked.push('REAL_EXEC_INJECTED_PROVIDER_OVERRIDE');
      break;
    }
  }

  // Conflicting claims: callerType says AI but tokenClaims has human uid
  if (ctx.callerType === 'HUMAN') {
    const uid = typeof claims['uid'] === 'string' ? claims['uid'] : '';
    // uid says 'ai-' prefix but callerType says human → conflict
    if (uid.startsWith('ai-agent') || uid.startsWith('ai_agent')) {
      blocked.push('REAL_EXEC_CONFLICTING_CLAIMS');
    }
  }

  // Claims say uid is the caller but callerType is explicitly AI — contradicting pair
  if (ctx.callerType === 'AI' && typeof claims['uid'] === 'string' && claims['uid'] === ctx.callerUserId) {
    // AI caller with matching uid still must be blocked — this is just an extra conflict marker
    blocked.push('REAL_EXEC_CONFLICTING_CLAIMS');
  }

  return blocked;
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

  // 5b. Phase 3: advanced forged / mismatched context checks (when tokenClaims supplied)
  const advancedErrors = detectAdvancedForgedContext(ctx, request.tenantId);
  for (const r of advancedErrors) {
    if (!blocked.includes(r)) blocked.push(r);
  }

  // 5c. Phase 4: token signature verification status check
  const sigErrors = detectForgedTokenSignature(ctx);
  for (const r of sigErrors) {
    if (!blocked.includes(r)) blocked.push(r);
  }

  // 5d. Phase 4: multi-claim injection detection
  const injectionErrors = detectInjectedClaims(ctx);
  for (const r of injectionErrors) {
    if (!blocked.includes(r)) blocked.push(r);
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
