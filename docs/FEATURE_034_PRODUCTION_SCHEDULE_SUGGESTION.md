# Feature 034: 人力與製作順序自動排程建議

## Purpose

Given one `productionWorkflowPlans` document's ACTIVE tasks, suggest a
deterministic labor/equipment assignment and task ordering — start/end
offsets, which staff slot and equipment slot each task uses, a resulting
makespan, and a suggested latest work-start time. This is a **suggestion
only**: it never writes to `productionWorkflowPlans` and never
auto-executes anything. A human reads the schedule and decides.

## Algorithm (`calculateProductionSchedule`, pure)

1. **Normalize.** Clamp invalid `estimatedMinutes` (must be > 0) and
   `staffCount` (must be >= 1) to safe minimums, with a warning. Drop
   `dependsOnTaskIds` entries referencing archived/missing tasks, with a
   warning.
2. **Cycle detection via Kahn's algorithm.** Tasks that never reach
   in-degree 0 (cycle members, and anything transitively depending on one)
   are marked `unschedulableTaskIds` and the run is `infeasible`; the
   acyclic remainder is still scheduled.
3. **Critical-path priority.** Over the acyclic graph, compute each task's
   critical-path length = its own duration + the longest chain of durations
   through its dependents to any leaf; longer downstream chains are
   scheduled first. Tiebreaks: lower `sequence`, larger `estimatedMinutes`,
   then `taskName`/`taskId` for full determinism.
4. **List scheduling, event-driven placement.** Repeatedly pick the
   highest-priority READY task (all deps resolved) and place it at the
   earliest candidate time (`0` or an existing busy-interval end — never a
   per-minute scan) where staff and equipment are simultaneously free:
   - **Staff**: `staffCount` slots of `staffRole` free for the duration;
     falls back to a pooled "any role" search (with a warning) when
     `staffRole` is absent/unknown. Never-enough-slots → unschedulable.
   - **Equipment**: one slot of `equipmentType` free (skipped when
     `'none'`). Zero available slots of that type → unschedulable, without
     blocking the rest of the run.
   - A task depending on an unschedulable task is itself unschedulable
     (propagated).
5. **`canRunInParallel: false`** means the task must not overlap **any
   other task sharing the same `recipeId`**, regardless of the other task's
   own flag — enforced via a per-recipe exclusive-interval ledger. The
   first time this delays a placement it is noted in that task's
   `warnings` and in `manualReviewNotes`.
6. **Summary.** `makespanMinutes` = latest end offset (0 if nothing
   scheduled). `scheduleStatus`: `infeasible` if anything is unschedulable;
   else `overrun` if makespan exceeds `capacityWindowMinutes - bufferMinutes`;
   else `fits`. `workStartSuggestion` = `targetServiceDateTime - (makespan +
   bufferMinutes)` minutes, as ISO. `staffUtilization`/`equipmentUtilization`
   = busy minutes ÷ (slot count × effective window), 2dp, only for
   roles/types actually used.

## Collection Schema & Rules

`/productionScheduleSuggestions/{id}` — immutable, create-only (mirrors
`capacityFeasibilityChecks`): `sourceProductionWorkflowPlanId`,
`sourcePlanNameSnapshot`, `targetServiceDateTime`, `capacityWindowMinutes`,
`bufferMinutes`, `availableStaff[]`, `availableEquipment[]`,
`scheduledTasks[]`, `makespanMinutes`, `scheduleStatus`,
`unschedulableTaskIds[]`, `staffUtilization`, `equipmentUtilization`,
`workStartSuggestion`, `manualReviewNotes[]`, `createdAt`, `createdBy`.
`read`: `isAuthenticated()`; `create`: `isPurchasingStaff()` + field
allow-list; `update`/`delete`: always `false`.

## Suggestion-Only Guarantee

`createProductionScheduleSuggestion` only re-reads the source plan (via
`getProductionWorkflowPlan`) and `addDoc`s a new immutable record — it never
calls `updateProductionWorkflowPlan` or writes to `inventory` or any other
collection. The `/production-schedules` page is read-only against the
generated record and shows a standing disclaimer:
排程建議不會回寫製程規劃，僅供排班參考。

## Out of Scope

- No real-time tracking of actual task progress against the suggestion.
- No Gantt-chart rendering — the timeline is a flat, sortable table.
- No cross-plan scheduling (each run is scoped to one
  `productionWorkflowPlans` document).
- No automatic staff-roster integration — `availableStaff`/`availableEquipment`
  are entered manually per run, same as `capacityFeasibilityChecks`.

## Runtime Verification Pending

Unit tests (`productionScheduleService.test.ts`) cover the pure algorithm
only (linear chains, parallelism, staff/equipment bottlenecks, missing
equipment, cycles, fits/overrun thresholds, role fallback, recipe
exclusivity, workStartSuggestion arithmetic, determinism). Before
production use, verify against a live `group-meal` database with a real
`productionWorkflowPlans` document, checking the rendered timeline and
per-slot utilization table against expectations.
