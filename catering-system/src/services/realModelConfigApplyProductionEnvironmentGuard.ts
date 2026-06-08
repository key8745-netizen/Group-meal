/**
 * realModelConfigApplyProductionEnvironmentGuard.ts
 *
 * Feature 009 Phase 5A: Emulator-only Production Environment Guard
 *
 * Runs FIRST, before any real Firestore transaction is attempted for the
 * model-config-apply flow. Hard-blocks unless the runtime is conclusively
 * an emulator/test environment with explicit opt-in.
 *
 * ALL of the following must hold, or the guard BLOCKS:
 *   1. process.env.NODE_ENV === 'test'
 *   2. process.env.FIRESTORE_EMULATOR_HOST is set (non-empty)
 *   3. the resolved project ID is an explicit emulator/test project id
 *      (and is NOT a known/forbidden production project id, and is NOT
 *      an unrecognized id — default-deny on unknown)
 *   4. process.env.ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY === 'true'
 *
 * Missing or failing ANY condition produces a specific BlockedReason and
 * an overall BLOCKED result. Unknown / ambiguous environments default-deny.
 *
 * HARD RULES:
 *  - This guard performs NO Firestore I/O — pure environment inspection.
 *  - This guard MUST be invoked and MUST pass before
 *    realModelConfigApplyTransactionExecutorService opens any runTransaction.
 *  - This guard NEVER returns ALLOW for a production project id.
 */

import type { BlockedReason } from '../types/aiBoundary';

// ─── Known production project ids — explicitly hard-blocked ─────────────────
// These can NEVER be allowed to run a real transaction in this phase, no
// matter what other env vars are set.
export const FORBIDDEN_PRODUCTION_PROJECT_IDS = [
  'umas-booking-manager',
] as const;

// ─── Explicit emulator/test project id allow-list ───────────────────────────
// Project ids that are conclusively emulator/test projects. Anything not in
// this list (and not in the forbidden list) is "unknown" and default-denied.
export const ALLOWED_EMULATOR_PROJECT_IDS = [
  'demo-group-meal-emulator',
  'demo-group-meal-test',
  'group-meal-emulator-test',
] as const;

export type ProjectIdClassification = 'EMULATOR_TEST' | 'PRODUCTION' | 'UNKNOWN';

export interface ProductionEnvironmentGuardInput {
  /** Typically process.env.NODE_ENV */
  nodeEnv: string | undefined;
  /** Typically process.env.FIRESTORE_EMULATOR_HOST */
  firestoreEmulatorHost: string | undefined;
  /** Resolved Firestore/Firebase project id for this run */
  projectId: string | undefined;
  /** Typically process.env.ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY */
  allowEmulatorOnlyFlag: string | undefined;
}

export interface ProductionEnvironmentGuardResult {
  readonly _kind: 'real_model_config_apply_production_environment_guard_result';
  allowed: boolean;
  blocked: boolean;
  blockedReasons: BlockedReason[];
  projectIdClassification: ProjectIdClassification;
  evaluatedAt: Date;
}

function isNonEmptyString(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Classifies a project id as EMULATOR_TEST, PRODUCTION, or UNKNOWN (default-deny). */
export function classifyProjectId(projectId: string | undefined): ProjectIdClassification {
  if (!isNonEmptyString(projectId)) return 'UNKNOWN';
  const id = projectId.trim();

  if ((FORBIDDEN_PRODUCTION_PROJECT_IDS as readonly string[]).includes(id)) {
    return 'PRODUCTION';
  }
  if ((ALLOWED_EMULATOR_PROJECT_IDS as readonly string[]).includes(id)) {
    return 'EMULATOR_TEST';
  }
  // Heuristic for explicitly-named emulator/demo/test projects not yet on the
  // allow-list — still must not collide with production naming.
  if (/^(demo-|emulator-|test-).*(emulator|test)/i.test(id) || /emulator/i.test(id)) {
    return 'EMULATOR_TEST';
  }

  // Anything else is unknown → default-deny.
  return 'UNKNOWN';
}

/**
 * Evaluates whether a real Firestore transaction may run for the
 * model-config-apply flow in the current environment.
 *
 * Default behavior is DENY. Every one of the four conditions must
 * independently pass for ALLOW. All failing conditions are reported
 * (not short-circuited) so callers get the full picture, EXCEPT that a
 * PRODUCTION project id always forces blocked=true regardless of any
 * other flag combination (hard physical block).
 */
export function evaluateProductionEnvironmentGuard(
  input: ProductionEnvironmentGuardInput,
): ProductionEnvironmentGuardResult {
  const blocked: BlockedReason[] = [];

  // 1. NODE_ENV must be 'test'
  if (input.nodeEnv !== 'test') {
    blocked.push('F009_PHASE5A_NOT_TEST_ENV');
  }

  // 2. FIRESTORE_EMULATOR_HOST must exist and be non-empty
  if (!isNonEmptyString(input.firestoreEmulatorHost)) {
    blocked.push('F009_PHASE5A_MISSING_EMULATOR_HOST');
  }

  // 3. Project id must be an explicit emulator/test project id
  const classification = classifyProjectId(input.projectId);
  if (classification === 'PRODUCTION') {
    blocked.push('F009_PHASE5A_PRODUCTION_PROJECT_ID_BLOCKED');
  } else if (classification === 'UNKNOWN') {
    blocked.push('F009_PHASE5A_UNKNOWN_PROJECT_ID');
    blocked.push('F009_PHASE5A_UNKNOWN_ENVIRONMENT_DEFAULT_DENY');
  }

  // 4. Explicit opt-in flag must be the literal string 'true'
  if (!isNonEmptyString(input.allowEmulatorOnlyFlag)) {
    blocked.push('F009_PHASE5A_MISSING_OPT_IN_FLAG');
  } else if (input.allowEmulatorOnlyFlag !== 'true') {
    blocked.push('F009_PHASE5A_OPT_IN_FLAG_INVALID');
  }

  // Hard physical block: a PRODUCTION project id can NEVER be allowed,
  // no matter what other flags say. This is intentionally redundant with
  // the push above so that even a future refactor that changes the
  // condition list cannot accidentally permit production.
  const hardBlockedProduction = classification === 'PRODUCTION';

  const allowed = blocked.length === 0 && !hardBlockedProduction;

  return {
    _kind: 'real_model_config_apply_production_environment_guard_result',
    allowed,
    blocked: !allowed,
    blockedReasons: blocked,
    projectIdClassification: classification,
    evaluatedAt: new Date(),
  };
}

/**
 * Convenience wrapper that reads directly from process.env.
 * Still pure with respect to Firestore — only inspects environment variables.
 */
export type EnvLike = Record<string, string | undefined>;

function readProcessEnv(): EnvLike {
  // Avoid a hard dependency on @types/node — access process via a loose
  // global lookup so this file type-checks regardless of the Node typings
  // configured for this project.
  const g = globalThis as unknown as { process?: { env?: EnvLike } };
  return g.process?.env ?? {};
}

export function evaluateProductionEnvironmentGuardFromProcessEnv(
  env?: EnvLike,
): ProductionEnvironmentGuardResult {
  const e = env ?? readProcessEnv();
  return evaluateProductionEnvironmentGuard({
    nodeEnv: e.NODE_ENV,
    firestoreEmulatorHost: e.FIRESTORE_EMULATOR_HOST,
    projectId: e.FIRESTORE_PROJECT_ID ?? e.GCLOUD_PROJECT ?? e.VITE_FIREBASE_PROJECT_ID,
    allowEmulatorOnlyFlag: e.ALLOW_MODEL_CONFIG_APPLY_EMULATOR_ONLY,
  });
}

/** Throws if the guard does not allow — used as a hard physical gate before runTransaction. */
export function assertProductionEnvironmentGuardAllowed(
  result: ProductionEnvironmentGuardResult,
): void {
  if (!result.allowed) {
    throw new Error(
      `F009_PHASE5A_GUARD_BLOCKED: real model-config-apply transaction denied — ` +
      `reasons=[${result.blockedReasons.join(', ')}], ` +
      `projectIdClassification=${result.projectIdClassification}`,
    );
  }
}
