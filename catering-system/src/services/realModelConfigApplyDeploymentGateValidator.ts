/**
 * realModelConfigApplyDeploymentGateValidator.ts
 *
 * Feature 009 Phase 5C: Deployment Gate Hardening
 *
 * Pure-logic, non-executable contract/model layer hardening the deployment
 * pipeline gate beyond Phase 5B's presence/project/environment checks. This
 * module models:
 *   - DEPLOYMENT_TOKEN contract with HMAC/KMS validation (structurally typed —
 *     no real KMS SDK / crypto calls; the "verification" is a modeled,
 *     deterministic comparison of expected vs supplied structural fields)
 *   - SecurityCoordinator contract (cross-validates token state against the
 *     Firestore deployment_gate lifecycle record)
 *   - CI token injection lifecycle model
 *   - Deployment gate audit payload builder
 *
 * HARD RULES:
 *  - executable: false / aiCanExecute: false on every contract/result type
 *  - No Firestore, no firebase-admin, no runTransaction, no KMS/HMAC SDK, no I/O
 *  - Pure synchronous — default-deny on any missing/ambiguous/unknown input
 *  - Production remains disabled-by-default; this module BLOCKS, never executes
 */

import type { BlockedReason, TenantId } from '../types/aiBoundary';
import type { DeploymentEnvironment } from './realModelConfigApplyProductionGateService';

// ─── DEPLOYMENT_TOKEN contract (HMAC / KMS modeling) ─────────────────────────

/**
 * Structurally-typed model of a CI-injected deployment token. This is NOT a
 * real cryptographic artifact — `hmacSignatureHex` / `kmsKeyId` /
 * `kmsVerificationStatus` are modeled fields compared structurally against
 * expectations supplied by the (also modeled) SecurityCoordinator. No real
 * HMAC computation or KMS SDK call ever occurs in this file.
 */
export interface DeploymentTokenContract {
  readonly _kind: 'f009_phase5c_deployment_token_contract';
  readonly executable: false;
  present: boolean;
  /** Opaque token identifier issued by CI for this pipeline run */
  tokenId: string;
  projectId: string;
  environment: DeploymentEnvironment;
  /** ISO timestamp the token was issued at */
  issuedAt: string;
  /** Token must be considered stale beyond this freshness window */
  staleAfterSeconds: number;
  /** Modeled HMAC signature (hex string) — structural comparison only */
  hmacSignatureHex: string;
  /** Modeled KMS key identifier the token claims to be signed with */
  kmsKeyId: string;
  /** Modeled KMS verification status as reported by the (modeled) KMS contract */
  kmsVerificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH' | 'UNKNOWN';
  /** True only when injected through the CI pipeline; false for any local origin */
  injectedByCi: boolean;
  /** True when the caller attempted to bypass CI injection (e.g. manual env var) */
  localBypassAttempted: boolean;
  /** True when the caller attempted to bypass CI's own gate checks from within CI */
  ciBypassAttempted: boolean;
}

/** Caller-supplied expectations a valid token must structurally match. */
export interface DeploymentTokenExpectation {
  expectedProjectId: string;
  expectedEnvironment: DeploymentEnvironment;
  /** Expected HMAC signature, computed upstream (outside this contract layer) */
  expectedHmacSignatureHex: string;
  /** Expected KMS key identifier */
  expectedKmsKeyId: string;
  /** ISO timestamp representing "now", supplied by caller for determinism */
  now: string;
}

export interface DeploymentTokenValidationResult {
  readonly _kind: 'f009_phase5c_deployment_token_validation_result';
  passed: boolean;
  blockedReasons: BlockedReason[];
}

function isoToSeconds(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Structural malformation check — any required field missing/blank/wrong type. */
function isMalformedToken(token: DeploymentTokenContract): boolean {
  if (token.present !== true) return false; // handled separately as "missing"
  if (!isNonEmptyString(token.tokenId)) return true;
  if (!isNonEmptyString(token.projectId)) return true;
  if (!isNonEmptyString(token.issuedAt) || !Number.isFinite(isoToSeconds(token.issuedAt))) return true;
  if (!isNonEmptyString(token.hmacSignatureHex) || !/^[0-9a-f]+$/i.test(token.hmacSignatureHex)) return true;
  if (!isNonEmptyString(token.kmsKeyId)) return true;
  if (typeof token.staleAfterSeconds !== 'number' || !Number.isFinite(token.staleAfterSeconds) || token.staleAfterSeconds <= 0) return true;
  if (token.environment !== 'staging' && token.environment !== 'production' && token.environment !== 'unknown') return true;
  if (
    token.kmsVerificationStatus !== 'VERIFIED'
    && token.kmsVerificationStatus !== 'UNVERIFIED'
    && token.kmsVerificationStatus !== 'MISMATCH'
    && token.kmsVerificationStatus !== 'UNKNOWN'
  ) return true;
  return false;
}

/**
 * Validates a deployment token contract against expectations. Hard-blocks
 * (collecting ALL applicable reasons, never short-circuiting on the first)
 * for: missing, malformed, stale, invalid HMAC, KMS mismatch, wrong project,
 * wrong environment, local bypass attempt, CI bypass attempt.
 *
 * Default-deny: any unknown/ambiguous state BLOCKS.
 */
export function validateDeploymentToken(
  token: DeploymentTokenContract | null | undefined,
  expectation: DeploymentTokenExpectation,
): DeploymentTokenValidationResult {
  if (!token || token.present !== true || (token as { _kind?: string })._kind !== 'f009_phase5c_deployment_token_contract') {
    return {
      _kind: 'f009_phase5c_deployment_token_validation_result',
      passed: false,
      blockedReasons: ['F009_PHASE5C_DEPLOYMENT_TOKEN_MISSING'],
    };
  }

  // Malformed token short-circuits further structural comparisons (they would
  // be meaningless against malformed data) but is still its own hard-block.
  if (isMalformedToken(token)) {
    return {
      _kind: 'f009_phase5c_deployment_token_validation_result',
      passed: false,
      blockedReasons: ['F009_PHASE5C_DEPLOYMENT_TOKEN_MALFORMED'],
    };
  }

  const blocked: BlockedReason[] = [];

  // Local / CI bypass attempts — hard-block regardless of any other field.
  if (token.localBypassAttempted === true || token.injectedByCi !== true) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_LOCAL_BYPASS_BLOCKED');
  }
  if (token.ciBypassAttempted === true) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_CI_BYPASS_BLOCKED');
  }

  // Staleness
  const nowSec = isoToSeconds(expectation.now);
  const issuedSec = isoToSeconds(token.issuedAt);
  if (!Number.isFinite(nowSec) || !Number.isFinite(issuedSec) || (nowSec - issuedSec) > token.staleAfterSeconds) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_STALE');
  }

  // Project / environment structural match
  if (token.projectId !== expectation.expectedProjectId) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_PROJECT');
  }
  if (token.environment !== expectation.expectedEnvironment || token.environment === 'unknown') {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_ENVIRONMENT');
  }

  // Modeled HMAC comparison — structural string equality only (no crypto).
  if (
    token.hmacSignatureHex.toLowerCase() !== expectation.expectedHmacSignatureHex.toLowerCase()
    || !isNonEmptyString(expectation.expectedHmacSignatureHex)
  ) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_INVALID_HMAC');
  }

  // Modeled KMS comparison — key id match AND reported verification status.
  if (
    token.kmsKeyId !== expectation.expectedKmsKeyId
    || token.kmsVerificationStatus === 'MISMATCH'
    || token.kmsVerificationStatus === 'UNVERIFIED'
    || token.kmsVerificationStatus === 'UNKNOWN'
  ) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_KMS_MISMATCH');
  }

  return {
    _kind: 'f009_phase5c_deployment_token_validation_result',
    passed: blocked.length === 0,
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Firestore deployment_gate lifecycle model ───────────────────────────────

export type DeploymentGateLifecycleState =
  | 'NOT_CREATED'
  | 'PENDING'
  | 'ACTIVE'
  | 'UPDATE_FAILED'
  | 'STALE';

/**
 * Pure data model of the `deployment_gate` Firestore document lifecycle.
 * No real Firestore reads/writes occur — this is the modeled "snapshot" the
 * SecurityCoordinator cross-validates against the deployment token.
 */
export interface DeploymentGateLifecycleRecord {
  readonly _kind: 'f009_phase5c_deployment_gate_lifecycle_record';
  present: boolean;
  state: DeploymentGateLifecycleState;
  /** The tokenId that the gate record claims authorized its current state */
  authorizingTokenId: string | null;
  projectId: string;
  environment: DeploymentEnvironment;
  lastUpdatedAt: string;
  /** True when the most recent gate write attempt reported failure */
  lastUpdateFailed: boolean;
}

// ─── CI token injection lifecycle model ──────────────────────────────────────

export type CiTokenInjectionPhase =
  | 'NOT_STARTED'
  | 'TOKEN_REQUESTED'
  | 'TOKEN_ISSUED'
  | 'TOKEN_INJECTED'
  | 'GATE_UPDATE_REQUESTED'
  | 'GATE_UPDATE_SUCCEEDED'
  | 'GATE_UPDATE_FAILED'
  | 'NETWORK_PARTIAL_FAILURE';

/**
 * Pure data model of the CI pipeline's token-injection → gate-update lifecycle.
 * Each phase is a discrete, inspectable state — no real CI runner is invoked.
 */
export interface CiTokenInjectionLifecycle {
  readonly _kind: 'f009_phase5c_ci_token_injection_lifecycle';
  readonly executable: false;
  phase: CiTokenInjectionPhase;
  pipelineRunId: string;
  tokenId: string | null;
  gateUpdateAttempted: boolean;
  gateUpdateSucceeded: boolean | null;
  /** True when a network/partial failure was observed mid-lifecycle */
  networkPartialFailureObserved: boolean;
  observedAt: string;
}

// ─── SecurityCoordinator contract ────────────────────────────────────────────

export interface SecurityCoordinatorInput {
  token: DeploymentTokenContract | null | undefined;
  tokenExpectation: DeploymentTokenExpectation;
  gate: DeploymentGateLifecycleRecord | null | undefined;
  ciLifecycle: CiTokenInjectionLifecycle | null | undefined;
  /** Caller's claimed environment — used to detect "wrong environment" framing */
  expectedEnvironment: DeploymentEnvironment;
  expectedProjectId: string;
}

export interface SecurityCoordinatorResult {
  readonly _kind: 'f009_phase5c_security_coordinator_result';
  readonly executable: false;
  /** true → deployment may structurally proceed (still subject to ALL other gates) */
  consistent: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Cross-validates: (a) the deployment token itself, (b) the Firestore
 * deployment_gate lifecycle record, and (c) the CI token-injection lifecycle —
 * for mutual consistency. ANY of the following hard-blocks (collected, not
 * short-circuited):
 *   - token injected but Firestore gate missing
 *   - Firestore gate updated but token invalid
 *   - token injected but gate update failed (token must be treated as invalidated)
 *   - network / partial failure mid-lifecycle
 *   - unknown/ambiguous state of any input → default-deny
 *
 * This coordinator NEVER mutates anything — it only evaluates consistency.
 */
export function evaluateSecurityCoordinatorConsistency(
  input: SecurityCoordinatorInput,
): SecurityCoordinatorResult {
  const blocked: BlockedReason[] = [];

  // 1. Token validity (delegates to validateDeploymentToken; all its reasons propagate)
  const tokenResult = validateDeploymentToken(input.token, input.tokenExpectation);
  blocked.push(...tokenResult.blockedReasons);
  const tokenStructurallyPresent = !!input.token && input.token.present === true
    && (input.token as { _kind?: string })._kind === 'f009_phase5c_deployment_token_contract';

  // 2. Gate presence / default-deny on missing or unknown gate
  const gate = input.gate;
  const gatePresent = !!gate && gate.present === true
    && (gate as { _kind?: string })._kind === 'f009_phase5c_deployment_gate_lifecycle_record';
  if (!gatePresent) {
    blocked.push('F009_PHASE5C_DEPLOYMENT_GATE_MISSING');
  }

  // 3. CI lifecycle presence / default-deny
  const lifecycle = input.ciLifecycle;
  const lifecyclePresent = !!lifecycle
    && (lifecycle as { _kind?: string })._kind === 'f009_phase5c_ci_token_injection_lifecycle';
  if (!lifecyclePresent) {
    blocked.push('F009_PHASE5C_SECURITY_COORDINATOR_INCONSISTENT');
  }

  if (gatePresent && lifecyclePresent && tokenStructurallyPresent && lifecycle && gate && input.token) {
    // Token injected but Firestore gate missing/never created
    if (lifecycle.phase === 'TOKEN_INJECTED' && gate.state === 'NOT_CREATED') {
      blocked.push('F009_PHASE5C_TOKEN_INJECTED_GATE_MISSING');
    }

    // Firestore gate updated (ACTIVE) but token itself failed validation
    if (gate.state === 'ACTIVE' && tokenResult.passed === false) {
      blocked.push('F009_PHASE5C_GATE_UPDATED_TOKEN_INVALID');
    }

    // Token injected but the gate-update step failed → token must be treated
    // as invalidated; this is a hard-block, never a silent retry.
    if (
      (lifecycle.phase === 'GATE_UPDATE_FAILED' || gate.state === 'UPDATE_FAILED' || gate.lastUpdateFailed === true)
      && (lifecycle.tokenId === input.token.tokenId || gate.authorizingTokenId === input.token.tokenId)
    ) {
      blocked.push('F009_PHASE5C_TOKEN_INJECTED_GATE_UPDATE_FAILED');
    }

    // Network / partial failure modeled explicitly
    if (lifecycle.phase === 'NETWORK_PARTIAL_FAILURE' || lifecycle.networkPartialFailureObserved === true) {
      blocked.push('F009_PHASE5C_NETWORK_PARTIAL_FAILURE');
    }

    // Cross-binding: gate's authorizing token must match the token under review
    if (gate.state === 'ACTIVE' && gate.authorizingTokenId !== input.token.tokenId) {
      blocked.push('F009_PHASE5C_SECURITY_COORDINATOR_INCONSISTENT');
    }

    // Project / environment cross-binding between gate and expectations
    if (gate.projectId !== input.expectedProjectId) {
      blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_PROJECT');
    }
    if (gate.environment !== input.expectedEnvironment || gate.environment === 'unknown') {
      blocked.push('F009_PHASE5C_DEPLOYMENT_TOKEN_WRONG_ENVIRONMENT');
    }
  }

  return {
    _kind: 'f009_phase5c_security_coordinator_result',
    executable: false,
    consistent: blocked.length === 0,
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Development fallback guard ──────────────────────────────────────────────

export interface DevelopmentFallbackContext {
  readonly _kind: 'f009_phase5c_development_fallback_context';
  /** True when the caller is running in a local/dev context */
  isDevelopmentContext: boolean;
  /** True when the dev context attempted to construct ANY production write path */
  attemptedProductionWritePath: boolean;
  resolvedEnvironment: DeploymentEnvironment;
}

export interface DevelopmentFallbackEvaluationResult {
  readonly _kind: 'f009_phase5c_development_fallback_evaluation_result';
  /** true → a production write path would be created (must NEVER be true) */
  createsProductionWritePath: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Models the guarantee that a development fallback can NEVER create a
 * production write path. Default-deny: any ambiguity blocks.
 */
export function evaluateDevelopmentFallback(
  ctx: DevelopmentFallbackContext | null | undefined,
): DevelopmentFallbackEvaluationResult {
  if (!ctx || (ctx as { _kind?: string })._kind !== 'f009_phase5c_development_fallback_context') {
    return {
      _kind: 'f009_phase5c_development_fallback_evaluation_result',
      createsProductionWritePath: false,
      blockedReasons: ['F009_PHASE5C_UNKNOWN_ENVIRONMENT_DEFAULT_DENY'],
    };
  }
  const blocked: BlockedReason[] = [];
  if (ctx.isDevelopmentContext === true && (ctx.attemptedProductionWritePath === true || ctx.resolvedEnvironment === 'production')) {
    blocked.push('F009_PHASE5C_DEV_FALLBACK_PRODUCTION_PATH_BLOCKED');
  }
  if (ctx.resolvedEnvironment === 'unknown') {
    blocked.push('F009_PHASE5C_UNKNOWN_ENVIRONMENT_DEFAULT_DENY');
  }
  return {
    _kind: 'f009_phase5c_development_fallback_evaluation_result',
    createsProductionWritePath: false, // INVARIANT — this contract layer never creates one
    blockedReasons: [...new Set(blocked)],
  };
}

// ─── Deployment gate audit payload builder ───────────────────────────────────

export interface DeploymentGateAuditPayload {
  readonly _kind: 'f009_phase5c_deployment_gate_audit_payload';
  readonly executable: false;
  tenantId: TenantId | null;
  pipelineRunId: string;
  tokenId: string | null;
  projectId: string;
  environment: DeploymentEnvironment;
  tokenValidationPassed: boolean;
  tokenBlockedReasons: BlockedReason[];
  coordinatorConsistent: boolean;
  coordinatorBlockedReasons: BlockedReason[];
  gateState: DeploymentGateLifecycleState | 'UNKNOWN';
  ciPhase: CiTokenInjectionPhase | 'UNKNOWN';
  evaluatedAt: string;
  auditTrailId: string;
}

export interface DeploymentGateAuditPayloadInput {
  tenantId: TenantId | null;
  pipelineRunId: string;
  token: DeploymentTokenContract | null | undefined;
  tokenResult: DeploymentTokenValidationResult;
  gate: DeploymentGateLifecycleRecord | null | undefined;
  coordinatorResult: SecurityCoordinatorResult;
  ciLifecycle: CiTokenInjectionLifecycle | null | undefined;
  evaluatedAt: string;
  auditTrailId: string;
}

/** Builds a complete, structured, non-executable deployment-gate audit payload. */
export function buildDeploymentGateAuditPayload(
  input: DeploymentGateAuditPayloadInput,
): DeploymentGateAuditPayload {
  return {
    _kind: 'f009_phase5c_deployment_gate_audit_payload',
    executable: false,
    tenantId: input.tenantId,
    pipelineRunId: input.pipelineRunId,
    tokenId: input.token?.tokenId ?? null,
    projectId: input.token?.projectId ?? 'UNKNOWN',
    environment: input.token?.environment ?? 'unknown',
    tokenValidationPassed: input.tokenResult.passed,
    tokenBlockedReasons: [...input.tokenResult.blockedReasons],
    coordinatorConsistent: input.coordinatorResult.consistent,
    coordinatorBlockedReasons: [...input.coordinatorResult.blockedReasons],
    gateState: input.gate?.state ?? 'UNKNOWN',
    ciPhase: input.ciLifecycle?.phase ?? 'UNKNOWN',
    evaluatedAt: input.evaluatedAt,
    auditTrailId: input.auditTrailId,
  };
}

/** Validates that an audit payload is structurally complete (default-deny). */
export function evaluateDeploymentGateAuditPayloadCompleteness(
  payload: DeploymentGateAuditPayload | null | undefined,
): { passed: boolean; blockedReasons: BlockedReason[] } {
  if (!payload || (payload as { _kind?: string })._kind !== 'f009_phase5c_deployment_gate_audit_payload') {
    return { passed: false, blockedReasons: ['F009_PHASE5C_DEPLOYMENT_GATE_AUDIT_INCOMPLETE'] };
  }
  const requiredStrings: (keyof DeploymentGateAuditPayload)[] = [
    'pipelineRunId', 'projectId', 'evaluatedAt', 'auditTrailId',
  ];
  const missing = requiredStrings.filter((f) => !isNonEmptyString(payload[f] as unknown as string));
  if (missing.length > 0) {
    return { passed: false, blockedReasons: ['F009_PHASE5C_DEPLOYMENT_GATE_AUDIT_INCOMPLETE'] };
  }
  return { passed: true, blockedReasons: [] };
}

// ─── Composed deployment gate evaluation (top-level entry point) ────────────

export interface DeploymentGateHardenedEvaluationResult {
  readonly _kind: 'f009_phase5c_deployment_gate_hardened_evaluation_result';
  readonly executable: false;
  /** true ONLY when token, gate, coordinator ALL pass with zero blocked reasons */
  passed: boolean;
  blockedReasons: BlockedReason[];
  auditPayload: DeploymentGateAuditPayload;
}

/**
 * Top-level composed evaluation — runs token validation, coordinator
 * consistency check, and development-fallback guard, never short-circuiting,
 * and produces a complete audit payload regardless of outcome.
 *
 * Default-deny: passes ONLY when every sub-evaluation passes with zero
 * blocked reasons.
 */
export function evaluateHardenedDeploymentGate(input: {
  tenantId: TenantId | null;
  pipelineRunId: string;
  token: DeploymentTokenContract | null | undefined;
  tokenExpectation: DeploymentTokenExpectation;
  gate: DeploymentGateLifecycleRecord | null | undefined;
  ciLifecycle: CiTokenInjectionLifecycle | null | undefined;
  developmentFallback: DevelopmentFallbackContext | null | undefined;
  expectedProjectId: string;
  expectedEnvironment: DeploymentEnvironment;
  evaluatedAt: string;
  auditTrailId: string;
}): DeploymentGateHardenedEvaluationResult {
  const tokenResult = validateDeploymentToken(input.token, input.tokenExpectation);
  const coordinatorResult = evaluateSecurityCoordinatorConsistency({
    token: input.token,
    tokenExpectation: input.tokenExpectation,
    gate: input.gate,
    ciLifecycle: input.ciLifecycle,
    expectedEnvironment: input.expectedEnvironment,
    expectedProjectId: input.expectedProjectId,
  });
  const fallbackResult = evaluateDevelopmentFallback(input.developmentFallback);

  const blocked: BlockedReason[] = [
    ...tokenResult.blockedReasons,
    ...coordinatorResult.blockedReasons,
    ...fallbackResult.blockedReasons,
  ];

  const auditPayload = buildDeploymentGateAuditPayload({
    tenantId: input.tenantId,
    pipelineRunId: input.pipelineRunId,
    token: input.token,
    tokenResult,
    gate: input.gate,
    coordinatorResult,
    ciLifecycle: input.ciLifecycle,
    evaluatedAt: input.evaluatedAt,
    auditTrailId: input.auditTrailId,
  });

  return {
    _kind: 'f009_phase5c_deployment_gate_hardened_evaluation_result',
    executable: false,
    passed: blocked.length === 0,
    blockedReasons: [...new Set(blocked)],
    auditPayload,
  };
}

/** Builds a complete "deployment gate blocked" event payload (executable: false). */
export interface DeploymentGateBlockedEventPayload {
  readonly _kind: 'f009_phase5c_deployment_gate_blocked_event_payload';
  readonly executable: false;
  readonly aiCanExecute: false;
  blockedReasons: BlockedReason[];
  auditPayload: DeploymentGateAuditPayload;
  blockedAt: string;
}

export function buildDeploymentGateBlockedEventPayload(input: {
  blockedReasons: BlockedReason[];
  auditPayload: DeploymentGateAuditPayload;
  blockedAt: string;
}): DeploymentGateBlockedEventPayload {
  return {
    _kind: 'f009_phase5c_deployment_gate_blocked_event_payload',
    executable: false,
    aiCanExecute: false,
    blockedReasons: [...input.blockedReasons],
    auditPayload: input.auditPayload,
    blockedAt: input.blockedAt,
  };
}
