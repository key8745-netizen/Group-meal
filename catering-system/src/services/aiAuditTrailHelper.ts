/**
 * aiAuditTrailHelper.ts
 *
 * Phase 1 helper for building and validating AI audit trail events.
 *
 * HARD RULES:
 *  1. Read-only helpers — never writes to Firestore.
 *  2. computeAuditEventHash() uses djb2 in Phase 1 (synchronous, no crypto dependency).
 *     Phase 2 will upgrade to SHA-256 via the Web Crypto API.
 *  3. validateAuditAppend() is the authoritative gate — every append to an
 *     existing audit trail MUST pass this check before Firestore write.
 *  4. Event versions are monotonically increasing integers starting at 1.
 */

import type { AuditEvent, BlockedReason, CallerType } from '@/types/aiBoundary';

// ─── Hash ─────────────────────────────────────────────────────────────────────

/**
 * Computes a deterministic hash of an audit event's canonical fields.
 *
 * Phase 1: djb2 hash (synchronous, no crypto dependency).
 * Phase 2 upgrade: replace with SHA-256 via Web Crypto API.
 *
 * The canonical serialisation is JSON.stringify with sorted keys so that
 * field insertion order does not affect the hash.
 */
export function computeAuditEventHash(
  event: Omit<AuditEvent, 'eventHash'>,
): string {
  const canonical = JSON.stringify(event, Object.keys(event).sort());
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash) ^ canonical.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit integer
  }
  return hash.toString(16).padStart(8, '0');
}

// ─── createAuditEvent ─────────────────────────────────────────────────────────

export interface CreateAuditEventInput {
  eventType: string;
  actorType: CallerType;
  actorId: string;
  at: Date;
  fromState?: string;
  toState?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  /** Hash of the immediately preceding event in this trail. Omit for the first event. */
  previousEventHash?: string;
  /** Must equal the total number of events already in the trail + 1. */
  eventVersion: number;
}

/**
 * Builds a complete AuditEvent with a computed eventHash.
 * The caller is responsible for providing the correct eventVersion and previousEventHash.
 */
export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  const partial: Omit<AuditEvent, 'eventHash'> = {
    eventType:         input.eventType,
    actorType:         input.actorType,
    actorId:           input.actorId,
    at:                input.at,
    fromState:         input.fromState,
    toState:           input.toState,
    reason:            input.reason,
    metadata:          input.metadata,
    previousEventHash: input.previousEventHash,
    eventVersion:      input.eventVersion,
  };

  const eventHash = computeAuditEventHash(partial);

  return { ...partial, eventHash };
}

// ─── validateAuditAppend ──────────────────────────────────────────────────────

export interface ValidateAuditAppendInput {
  /** All events currently stored in the trail, in order. */
  existingEvents: AuditEvent[];
  /** The new event being appended. */
  newEvent: AuditEvent;
}

export interface ValidateAuditAppendResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
}

/**
 * Validates that a new audit event can safely be appended to an existing trail.
 *
 * Rules:
 *  1. newEvent.eventVersion must equal existingEvents.length + 1.
 *     Violation → AUDIT_VERSION_CONFLICT.
 *  2. If existingEvents is non-empty, newEvent.previousEventHash must match
 *     the eventHash of the last existing event.
 *     Violation → AUDIT_HASH_MISMATCH.
 */
export function validateAuditAppend(
  input: ValidateAuditAppendInput,
): ValidateAuditAppendResult {
  const blocked: BlockedReason[] = [];
  const { existingEvents, newEvent } = input;

  const expectedVersion = existingEvents.length + 1;
  if (newEvent.eventVersion !== expectedVersion) {
    blocked.push('AUDIT_VERSION_CONFLICT');
  }

  if (existingEvents.length > 0) {
    const lastEvent = existingEvents[existingEvents.length - 1];
    if (newEvent.previousEventHash !== lastEvent.eventHash) {
      blocked.push('AUDIT_HASH_MISMATCH');
    }
  }

  return {
    allowed: blocked.length === 0,
    blockedReasons: blocked,
  };
}
