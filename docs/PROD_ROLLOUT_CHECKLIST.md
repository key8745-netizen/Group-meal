# Production Rollout Readiness Checklist — Feature 009 Model Config Apply

> Status: **READINESS-ONLY**. This checklist documents what must be true
> before any real production rollout could even be *proposed*. It does NOT
> authorize, schedule, or imply a rollout. As of Phase 5D, production write
> remains fully disabled and no rollout (broad or canary) path exists.

## How to use this checklist

Each item below must be independently verifiable (tests, static guards,
audits, two-person sign-off) before the corresponding gate can be considered
"ready". An item being "ready" does NOT mean rollout is approved — approval
is a separate, explicit, human, two-person, ibi-final-authority decision
outside the scope of any AI agent.

## Section 1 — Contract / Model Layer Completeness

- [x] Phase 5A: production environment guard contract modeled and tested
- [x] Phase 5B: production-gated rollout foundation (gate config, kill
      switch, tenant/operator allowlist, operator confirmation) modeled
- [x] Phase 5C: deployment gate hardening (DEPLOYMENT_TOKEN / HMAC / KMS
      contract, SecurityCoordinator, kill-switch reset transaction
      protection, observation mode) modeled
- [x] Phase 5D: deployment gate partial-failure / orphaned-token recovery
      modeled (`realModelConfigApplyDeploymentGateRecoveryService.ts`)
- [x] Phase 5D: observation-mode high-concurrency / race-condition
      validation modeled (`concurrencyManager.ts`)
- [x] Phase 5D: security alert payload helpers modeled (`securityAudit.ts`)

## Section 2 — Blocker Criteria (must ALL remain true / pass)

- [ ] No real production write path exists anywhere in the codebase
      (verify: static guards 5A–5D + manual grep for `runTransaction` /
      `getFirestore` outside the contract layer)
- [ ] No broad rollout path exists
- [ ] No canary rollout path exists
- [ ] Deployment gate failure cannot fail open (verify: Phase 5C + 5D
      partial-failure tests — every failure mode resolves to BLOCKED /
      HALT / SELF_INVALIDATE / GATE_AUTO_INVALIDATE / DEPLOYMENT_ABORTED)
- [ ] Orphaned tokens cannot remain usable (verify:
      `detectOrphanedToken` → `selfInvalidate: true` in all orphan/ambiguous
      cases; SELF_INVALIDATE audit payload `tokenRemainsUsable: false`)
- [ ] Observation mode cannot enable production write (verify:
      `authorizesProductionWrite` / `canEnableProductionWrites` are
      structural literal `false` everywhere)
- [ ] Observation mode cannot override emergency disable (verify:
      `observationModeCanOverrideEmergencyDisable` structural literal
      `false`; `emergencyDisableWins` always `true` when active)
- [ ] AI cannot apply / reset / approve reset / modify gate (verify:
      `aiCanExecute: false` on every Phase 5D contract result;
      `F009_PHASE5D_AI_*` / `F009_PHASE5C_AI_*` reasons enforced)
- [ ] Service Account / Admin SDK cannot bypass any business guard
- [ ] UI / rollback / cleanup remain absent from the codebase
- [ ] All Phase 5A–5D tests pass
- [ ] `npm run typecheck` passes (the one pre-existing
      `Analytics.tsx:398` recharts `Formatter` mismatch is the sole
      acceptable exception)
- [ ] `npm run build` passes
- [ ] All Phase 5A–5D static guards report 0 violations

## Section 3 — Deployment Gate Readiness (CI / Token / Lifecycle)

- [ ] CI pipeline correctly distinguishes and handles interruption at each
      stage: before token injection / after token injection / after gate
      update — no stage permits proceeding (`evaluateCiInterruption`)
- [ ] Orphaned-token detection runs on every gate-evaluation cycle and
      always results in `SELF_INVALIDATE` for orphaned/ambiguous tokens
- [ ] `TOKEN_INJECTED_GATE_UPDATE_FAILED` / `GATE_UPDATED_TOKEN_INVALID` /
      `TOKEN_EXPIRED_MID_FLOW` cross-states are all classified and BLOCKED
- [ ] `DEPLOYMENT_ABORTED` is raised (and audited) whenever a manually
      approved deployment fails — and NEVER auto-retries
- [ ] Retry attempts are blocked unless a genuinely fresh manual approval
      (new, distinct `approvalId`, freshly granted) is presented when the
      scope requires it
- [ ] `GATE_AUTO_INVALIDATE` triggers for any `deployment_gate` that has not
      reached `ENABLED` within 30 minutes of creation
- [ ] `DEPLOYMENT_ABORTED` / `GATE_AUTO_INVALIDATE` / `SELF_INVALIDATE`
      audit payloads are complete (all required fields present, non-null,
      non-executable) — see test assertions in
      `realModelConfigApplyDeploymentGateRecoveryService.test.ts`

## Section 4 — Observation Mode Concurrency Readiness

- [ ] Optimistic locking / version tracking resolves every concurrent
      attempt to exactly one of: `PROCEED_SINGLE_WINNER` (single winner
      only), `BLOCKED`, or `HALT` — never to multiple simultaneous winners
- [ ] Concurrent RESET + APPLY against the same authoritative version
      resolves to `HALT` (never both proceed)
- [ ] Concurrent emergency-disable + observation-mode races always resolve
      with emergency disable winning (`emergencyDisableWins: true`)
- [ ] Concurrent observation-expiry + apply-attempt races resolve to
      `BLOCKED` when the apply is at-or-after `expiresAt` — no
      timing "sneak-through"
- [ ] Stale / missing / malformed / expired observation flags are all
      classified and BLOCKED (default-deny)
- [ ] Version conflicts raise `CONCURRENCY_VIOLATION` /
      `CONCURRENCY_VIOLATION_ERR` and fall back to `HALT` or a safe
      blocked state — never fail open
- [ ] Monitoring payloads for concurrency failures are complete and
      structurally forbid `authorizesProductionWrite` /
      `overridesEmergencyDisable`
- [ ] Load/concurrency simulation acceptance criteria hold: no unsafe
      winners, at most one winner per round (`summarizeLoadSimulation`)

## Section 5 — Monitoring & Alerting Contracts

- [ ] `SecurityAlertPayload` (Spec §11) builder produces complete payloads
      only — never partial (`buildSecurityAlertPayload`)
- [ ] Deployment-gate-failure and observation-concurrency convenience
      alert builders stamp the correct `systemState` discriminators
- [ ] All monitoring/alert payload types are `executable: false` /
      `aiCanExecute: false`

## Section 6 — Human / Governance Sign-off (outside AI scope)

- [ ] Two-person integrity confirmed for kill-switch reset approval chain
- [ ] Tenant allowlist and operator allowlist reviewed and current
- [ ] ibi (final authority) has explicitly reviewed and approved moving
      beyond readiness-only validation
- [ ] A real (non-AI) rollout plan — including canary strategy, rollback
      plan, and cleanup plan — has been authored and reviewed; NONE of
      these exist in the codebase as of Phase 5D and their absence is
      intentional and required at this stage

## Explicit Non-Goals (must remain true through this phase)

- Real production write: **NOT INTRODUCED**
- Broad rollout: **NOT INTRODUCED**
- Canary rollout: **NOT INTRODUCED**
- UI: **ABSENT**
- Rollback: **ABSENT**
- Cleanup job: **ABSENT**
- AI apply / reset / approve-reset / gate-mutation: **FORBIDDEN AND ENFORCED**

## Revision History

- Phase 5D: checklist created; Sections 1–6 populated; Phase 5D contract
  items (Sections 3 & 4) added based on `realModelConfigApplyDeploymentGateRecoveryService.ts`,
  `concurrencyManager.ts`, and `securityAudit.ts`.
