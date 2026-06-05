/**
 * realModelConfigApplyGuardService.ts
 *
 * Feature 007 Phase 1: Default-Deny Service Guard
 *
 * Validates that a caller is authorized to initiate a real model config apply.
 * Default behavior: DENY. Every check must pass for ALLOW.
 *
 * HARD RULES:
 *  - No Firestore writes, no firebase-admin, no google-cloud-firestore
 *  - No runTransaction
 *  - No UI, no async, no side effects
 *  - Tenant hard guard executes FIRST
 *  - AI caller is BLOCKED regardless of credential type
 *  - Unknown callerType is BLOCKED
 *  - Service Account / Admin SDK alone is INSUFFICIENT
 */

import type { BlockedReason } from '../types/aiBoundary';
import type {
  RealModelConfigApplyRequest,
  RealModelConfigApplyGuardResult,
} from '../types/realModelConfigApplyExecution';

/**
 * Default-deny entrance guard for real model config apply.
 *
 * Validation order (tenant hard guard first):
 *  1. tenantId present (hard guard — early exit)
 *  2. callerContext present (context parse guard)
 *  3. callerType is HUMAN (AI / UNKNOWN → BLOCKED)
 *  4. Service Account alone without human userId → BLOCKED
 *  5. Admin SDK alone without human userId → BLOCKED
 *  6. callerUserId present (human identity required)
 *  7. approvalId present
 *  8. auditTrailId present
 *  9. expectedCurrentVersion present
 * 10. applyToken present
 * 11. newVersion present
 * 12. sourceRecommendationId present
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

  // 2. Caller context must be present (context parse guard)
  if (!request.callerContext) {
    blocked.push('REAL_EXEC_MISSING_CALLER_CONTEXT');
    return { allowed: false, blockedReasons: blocked };
  }

  const ctx = request.callerContext;

  // 3. callerType must be HUMAN — AI always blocked, unknown always blocked
  if (ctx.callerType === 'AI') {
    blocked.push('REAL_EXEC_AI_CALLER_BLOCKED');
  } else if (ctx.callerType !== 'HUMAN') {
    blocked.push('REAL_EXEC_UNKNOWN_CALLER_TYPE');
  }

  // 4. Service Account alone is insufficient — human userId still required
  if (ctx.isServiceAccount && !ctx.callerUserId) {
    blocked.push('REAL_EXEC_SERVICE_ACCOUNT_INSUFFICIENT');
  }

  // 5. Admin SDK alone is insufficient — business guard still applies
  if (ctx.isAdminSdk && !ctx.callerUserId) {
    blocked.push('REAL_EXEC_ADMIN_SDK_NOT_SUFFICIENT');
  }

  // 6. Human user id must be present
  if (!ctx.callerUserId || (ctx.callerUserId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_HUMAN_USER_ID');
  }

  // 7. approvalId required
  if (!request.approvalId || (request.approvalId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_APPROVAL_ID');
  }

  // 8. auditTrailId required
  if (!request.auditTrailId || (request.auditTrailId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_AUDIT_TRAIL_ID');
  }

  // 9. expectedCurrentVersion required
  if (!request.expectedCurrentVersion || (request.expectedCurrentVersion as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_EXPECTED_VERSION');
  }

  // 10. applyToken required
  if (!request.applyToken || (request.applyToken as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_APPLY_TOKEN');
  }

  // 11. newVersion required
  if (!request.newVersion || (request.newVersion as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_NEW_VERSION');
  }

  // 12. sourceRecommendationId required
  if (!request.sourceRecommendationId || (request.sourceRecommendationId as string).trim() === '') {
    blocked.push('REAL_EXEC_MISSING_SOURCE_RECOMMENDATION_ID');
  }

  return { allowed: blocked.length === 0, blockedReasons: blocked };
}
