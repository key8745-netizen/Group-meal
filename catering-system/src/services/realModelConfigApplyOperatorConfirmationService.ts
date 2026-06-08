/**
 * realModelConfigApplyOperatorConfirmationService.ts
 *
 * Feature 009 Phase 5B: Operator Confirmation + Allowlist Validators
 *
 * Validates that an operator confirmation binds ALL required identity/version/
 * hash fields to the apply request, and that both the tenant and the operator
 * are EXPLICITLY allowlisted (never inferred from admin/service role).
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny on missing/malformed input
 *  - Any single field mismatch → BLOCKED with a specific reason
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type {
  ApplyToken, ConfigVersion, DiffHash, ModelConfigApprovalId,
} from '../types/modelConfigApply';

// ─── Operator Confirmation ───────────────────────────────────────────────────

export interface OperatorConfirmation {
  readonly _kind: 'f009_phase5b_operator_confirmation';
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  operatorUserId: string;
  timestamp: string;
}

export interface OperatorConfirmationExpectation {
  tenantId: TenantId;
  approvalId: ModelConfigApprovalId;
  applyToken: ApplyToken;
  expectedCurrentVersion: ConfigVersion;
  configBeforeHash: DiffHash;
  configAfterHash: DiffHash;
  diffHash: DiffHash;
  operatorUserId: string;
}

export interface OperatorConfirmationValidationResult {
  readonly _kind: 'f009_phase5b_operator_confirmation_validation_result';
  valid: boolean;
  blockedReasons: BlockedReason[];
}

const CONFIRMATION_REQUIRED_FIELDS: (keyof OperatorConfirmation)[] = [
  'tenantId', 'approvalId', 'applyToken', 'expectedCurrentVersion',
  'configBeforeHash', 'configAfterHash', 'diffHash', 'operatorUserId', 'timestamp',
];

function isMalformed(c: OperatorConfirmation): boolean {
  if ((c as { _kind?: string })._kind !== 'f009_phase5b_operator_confirmation') return true;
  for (const f of CONFIRMATION_REQUIRED_FIELDS) {
    const v = c[f] as unknown;
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return true;
  }
  if (Number.isNaN(new Date(c.timestamp).getTime())) return true;
  return false;
}

/**
 * Validates an operator confirmation binds ALL of: tenantId, approvalId,
 * applyToken, expectedCurrentVersion, configBeforeHash, configAfterHash,
 * diffHash, operatorUserId, timestamp — to the expected request values.
 *
 * Missing confirmation → BLOCKED (OPERATOR_CONFIRMATION_MISSING)
 * Malformed confirmation (missing/blank/invalid fields) → BLOCKED (MALFORMED)
 * Any single field mismatch → BLOCKED with a specific reason (collected, not short-circuited)
 */
export function validateOperatorConfirmation(
  confirmation: OperatorConfirmation | null | undefined,
  expected: OperatorConfirmationExpectation,
): OperatorConfirmationValidationResult {
  if (!confirmation) {
    return {
      _kind: 'f009_phase5b_operator_confirmation_validation_result',
      valid: false,
      blockedReasons: ['F009_PHASE5B_OPERATOR_CONFIRMATION_MISSING'],
    };
  }

  if (isMalformed(confirmation)) {
    return {
      _kind: 'f009_phase5b_operator_confirmation_validation_result',
      valid: false,
      blockedReasons: ['F009_PHASE5B_OPERATOR_CONFIRMATION_MALFORMED'],
    };
  }

  const blocked: BlockedReason[] = [];

  if (String(confirmation.tenantId) !== String(expected.tenantId)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_TENANT_MISMATCH');
  }
  if (String(confirmation.approvalId) !== String(expected.approvalId)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_APPROVAL_MISMATCH');
  }
  if (String(confirmation.applyToken) !== String(expected.applyToken)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_APPLY_TOKEN_MISMATCH');
  }
  if (String(confirmation.expectedCurrentVersion) !== String(expected.expectedCurrentVersion)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_VERSION_MISMATCH');
  }
  if (String(confirmation.configBeforeHash) !== String(expected.configBeforeHash)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_BEFORE_HASH_MISMATCH');
  }
  if (String(confirmation.configAfterHash) !== String(expected.configAfterHash)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_AFTER_HASH_MISMATCH');
  }
  if (String(confirmation.diffHash) !== String(expected.diffHash)) {
    blocked.push('F009_PHASE5B_CONFIRMATION_DIFF_HASH_MISMATCH');
  }
  if (confirmation.operatorUserId !== expected.operatorUserId) {
    blocked.push('F009_PHASE5B_CONFIRMATION_OPERATOR_MISMATCH');
  }
  if (Number.isNaN(new Date(confirmation.timestamp).getTime())) {
    blocked.push('F009_PHASE5B_CONFIRMATION_TIMESTAMP_INVALID');
  }

  return {
    _kind: 'f009_phase5b_operator_confirmation_validation_result',
    valid: blocked.length === 0,
    blockedReasons: blocked,
  };
}

// ─── Tenant Allowlist ────────────────────────────────────────────────────────

export interface TenantAllowlist {
  readonly _kind: 'f009_phase5b_tenant_allowlist';
  present: boolean;
  loadedSuccessfully: boolean;
  tenantIds: TenantId[];
}

export interface AllowlistValidationResult {
  readonly _kind: 'f009_phase5b_allowlist_validation_result';
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates that a tenant is EXPLICITLY present in a loaded tenant allowlist.
 * Missing / failed-to-load allowlist → BLOCKED. Tenant not present → BLOCKED.
 * Never inferred from any role or admin status.
 */
export function validateTenantAllowlist(
  allowlist: TenantAllowlist | null | undefined,
  tenantId: TenantId,
): AllowlistValidationResult {
  if (!allowlist || allowlist.present !== true) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_TENANT_ALLOWLIST_MISSING'],
    };
  }
  if (allowlist.loadedSuccessfully !== true) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_TENANT_ALLOWLIST_FAILED'],
    };
  }
  const present = allowlist.tenantIds.some(t => String(t) === String(tenantId));
  if (!present) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_TENANT_NOT_ALLOWLISTED'],
    };
  }
  return { _kind: 'f009_phase5b_allowlist_validation_result', allowed: true, blockedReasons: [] };
}

// ─── Operator Allowlist ──────────────────────────────────────────────────────

export interface OperatorAllowlist {
  readonly _kind: 'f009_phase5b_operator_allowlist';
  present: boolean;
  loadedSuccessfully: boolean;
  operatorUserIds: string[];
}

/**
 * Validates that an operator is EXPLICITLY present in a loaded operator
 * allowlist. Missing / failed-to-load allowlist → BLOCKED. Operator not
 * present → BLOCKED. Admin / service role NEVER substitutes for allowlisting.
 */
export function validateOperatorAllowlist(
  allowlist: OperatorAllowlist | null | undefined,
  operatorUserId: string,
): AllowlistValidationResult {
  if (!allowlist || allowlist.present !== true) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_OPERATOR_ALLOWLIST_MISSING'],
    };
  }
  if (allowlist.loadedSuccessfully !== true) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_OPERATOR_ALLOWLIST_FAILED'],
    };
  }
  const present = allowlist.operatorUserIds.includes(operatorUserId);
  if (!present) {
    return {
      _kind: 'f009_phase5b_allowlist_validation_result',
      allowed: false,
      blockedReasons: ['F009_PHASE5B_OPERATOR_NOT_ALLOWLISTED'],
    };
  }
  return { _kind: 'f009_phase5b_allowlist_validation_result', allowed: true, blockedReasons: [] };
}
