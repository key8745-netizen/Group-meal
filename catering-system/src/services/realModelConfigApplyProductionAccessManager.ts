/**
 * realModelConfigApplyProductionAccessManager.ts
 *
 * Feature 009 Phase 5B: Top-Level Default-Deny Production Access Manager
 *
 * Composes ALL Phase 5B gates into a single default-deny entry point that
 * must pass in full before any real production model-config-apply transaction
 * could ever be attempted. This is rollout INFRASTRUCTURE — it does not open
 * production writes; production remains disabled-by-default.
 *
 * BLOCKS on: missing gate config, missing deployment gate, production disabled
 * flag, kill switch ON, kill switch missing, missing/failed tenant allowlist,
 * missing/failed operator allowlist, missing/malformed operator confirmation,
 * unknown environment, AI caller, Service Account/Admin SDK bypass attempts.
 *
 * Only allows proceeding (accessGranted = true) when ALL gates explicitly pass.
 *
 * HARD RULES:
 *  - No Firestore, no firebase-admin, no runTransaction, no I/O
 *  - Pure synchronous — default-deny; all failing gates are collected
 *  - Production remains disabled-by-default; AI / Service Account / Admin SDK
 *    callers are hard-blocked regardless of any other gate state
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { F009CallerType } from '../types/realModelConfigApplyTransaction';
import type {
  DeploymentPipelineGate,
  DeploymentEnvironment,
  KillSwitchRecord,
  EmergencyDisableContract,
} from './realModelConfigApplyProductionGateService';
import {
  evaluateDeploymentPipelineGate,
  evaluateKillSwitch,
  evaluateEmergencyDisableContract,
} from './realModelConfigApplyProductionGateService';
import type {
  TenantAllowlist,
  OperatorAllowlist,
  OperatorConfirmation,
  OperatorConfirmationExpectation,
} from './realModelConfigApplyOperatorConfirmationService';
import {
  validateTenantAllowlist,
  validateOperatorAllowlist,
  validateOperatorConfirmation,
} from './realModelConfigApplyOperatorConfirmationService';

// ─── Gate configuration contract ─────────────────────────────────────────────

/**
 * Top-level gate configuration. Its absence is itself a BLOCK
 * (F009_PHASE5B_GATE_CONFIG_MISSING) — there is no implicit default config.
 */
export interface ProductionGateConfig {
  readonly _kind: 'f009_phase5b_production_gate_config';
  present: boolean;
  /** Explicit production-enable flag — must be the literal boolean true. */
  productionEnabled: boolean;
  expectedProjectId: string;
  expectedEnvironment: DeploymentEnvironment;
  deploymentGate: DeploymentPipelineGate | null | undefined;
  killSwitch: KillSwitchRecord | null | undefined;
  emergencyDisable: EmergencyDisableContract | null | undefined;
  tenantAllowlist: TenantAllowlist | null | undefined;
  operatorAllowlist: OperatorAllowlist | null | undefined;
}

export interface ProductionAccessRequestCallerContext {
  callerType: F009CallerType;
  callerUserId: string;
  isServiceAccount?: boolean;
  isAdminSdk?: boolean;
}

export interface ProductionAccessManagerInput {
  config: ProductionGateConfig | null | undefined;
  resolvedEnvironment: DeploymentEnvironment;
  now: string;
  tenantId: TenantId;
  operatorUserId: string;
  callerContext: ProductionAccessRequestCallerContext;
  operatorConfirmation: OperatorConfirmation | null | undefined;
  confirmationExpectation: OperatorConfirmationExpectation;
}

export interface ProductionAccessManagerResult {
  readonly _kind: 'f009_phase5b_production_access_manager_result';
  accessGranted: boolean;
  blockedReasons: BlockedReason[];
  evaluatedAt: Date;
}

function unique(reasons: BlockedReason[]): BlockedReason[] {
  return [...new Set(reasons)];
}

/**
 * Evaluates whether production access may be granted for a real apply attempt.
 *
 * Default behavior is DENY. Every gate is evaluated (not short-circuited) so
 * the full set of blocking reasons is reported. accessGranted is true ONLY
 * when zero blocked reasons remain after evaluating every gate.
 */
export function evaluateProductionAccess(
  input: ProductionAccessManagerInput,
): ProductionAccessManagerResult {
  const blocked: BlockedReason[] = [];

  // ── 0. Caller hard-blocks — evaluated first, independent of all other gates ─
  const ctx = input.callerContext;
  if (ctx.callerType === 'AI') {
    blocked.push('F009_PHASE5B_AI_CALLER_BLOCKED');
  }
  if (ctx.callerType === 'SERVICE_ACCOUNT' || ctx.isServiceAccount === true) {
    blocked.push('F009_PHASE5B_SERVICE_ACCOUNT_BYPASS_BLOCKED');
  }
  if (ctx.callerType === 'ADMIN_SDK' || ctx.isAdminSdk === true) {
    blocked.push('F009_PHASE5B_ADMIN_SDK_BYPASS_BLOCKED');
  }
  if (ctx.callerType === 'UNKNOWN') {
    blocked.push('F009_PHASE5B_UNKNOWN_ENVIRONMENT_DEFAULT_DENY');
  }

  // ── 1. Unknown / ambiguous environment → default-deny ───────────────────────
  if (input.resolvedEnvironment === 'unknown') {
    blocked.push('F009_PHASE5B_UNKNOWN_ENVIRONMENT_DEFAULT_DENY');
  }

  // ── 2. Gate config presence ─────────────────────────────────────────────────
  const config = input.config;
  if (!config || config.present !== true) {
    // Without config, no further gate evaluation is meaningful — but we still
    // report the caller-related blocks collected above plus this one.
    blocked.push('F009_PHASE5B_GATE_CONFIG_MISSING');
    return {
      _kind: 'f009_phase5b_production_access_manager_result',
      accessGranted: false,
      blockedReasons: unique(blocked),
      evaluatedAt: new Date(),
    };
  }

  // ── 3. Production-enabled flag — explicit boolean true required ─────────────
  if (config.productionEnabled !== true) {
    blocked.push('F009_PHASE5B_PRODUCTION_DISABLED');
  }

  // ── 4. Deployment pipeline gate ──────────────────────────────────────────────
  const deploymentResult = evaluateDeploymentPipelineGate({
    gate: config.deploymentGate,
    expectedProjectId: config.expectedProjectId,
    expectedEnvironment: config.expectedEnvironment,
  });
  blocked.push(...deploymentResult.blockedReasons);

  // ── 5. Kill switch ────────────────────────────────────────────────────────────
  const killSwitchResult = evaluateKillSwitch({ record: config.killSwitch, now: input.now });
  blocked.push(...killSwitchResult.blockedReasons);

  // ── 6. Emergency disable ─────────────────────────────────────────────────────
  const emergencyResult = evaluateEmergencyDisableContract(config.emergencyDisable);
  blocked.push(...emergencyResult.blockedReasons);

  // ── 7. Tenant allowlist ──────────────────────────────────────────────────────
  const tenantAllowlistResult = validateTenantAllowlist(config.tenantAllowlist, input.tenantId);
  blocked.push(...tenantAllowlistResult.blockedReasons);

  // ── 8. Operator allowlist ────────────────────────────────────────────────────
  const operatorAllowlistResult = validateOperatorAllowlist(config.operatorAllowlist, input.operatorUserId);
  blocked.push(...operatorAllowlistResult.blockedReasons);

  // ── 9. Operator confirmation ─────────────────────────────────────────────────
  const confirmationResult = validateOperatorConfirmation(input.operatorConfirmation, input.confirmationExpectation);
  blocked.push(...confirmationResult.blockedReasons);

  const finalReasons = unique(blocked);

  return {
    _kind: 'f009_phase5b_production_access_manager_result',
    accessGranted: finalReasons.length === 0,
    blockedReasons: finalReasons,
    evaluatedAt: new Date(),
  };
}
