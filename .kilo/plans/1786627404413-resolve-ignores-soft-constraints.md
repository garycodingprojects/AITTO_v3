# Fix: re-solve ignores newly enabled soft constraints
# Fix: re-solve ignores newly enabled soft constraints

## Root cause

`school-timetabling/src/main/resources/application.properties:15`:

```properties
quarkus.timefold.solver.termination.best-score-limit=0hard/*soft
```

This terminates the solver as soon as the best solution is feasible (0 hard violations), **regardless of soft score**.

- **Flow A (works):** enable constraints → Solve. The timetable starts unassigned (negative hard score), so the solver runs until feasible, then stops. Appears correct.
- **Flow B (broken):** Solve → enable soft constraints → Solve again. The resubmitted timetable is already fully assigned and feasible. The solver's initial best solution already matches `0hard/*soft`, so best-score-limit termination fires **immediately** — construction heuristics are skipped (solution fully initialized) and local search never runs. The score/violation labels are still recalculated with the new overrides, so the user *sees* the soft violations but the schedule never changes.

The client (`app.js solve()`) and server (`TimetableResource.solve`, `Timetable.setConstraintWeightOverridesFromJson`) both correctly transport `constraintWeightOverrides` on every solve — no changes needed there.

## Decided approach (Option A)

Replace `best-score-limit` with an **unimproved-spent-limit** termination, keeping the 30s hard cap. The solver then keeps optimizing the soft score until no improvement occurs for N seconds, instead of stopping at first feasibility.

## Changes

### 1. `school-timetabling/src/main/resources/application.properties` (main profile)

- **Remove** line 15: `quarkus.timefold.solver.termination.best-score-limit=0hard/*soft`
- **Add**: `quarkus.timefold.solver.termination.unimproved-spent-limit=10s`
- **Update** the comment above it (line 14) from "Stop as soon as a feasible timetable is found..." to something like: "Stop when the score has not improved for 10 seconds (or after the 30s spent-limit)."

### 2. Same file, `%test` profile (lines 45-47)

`%test` currently sets `spent-limit=1h` so `best-score-limit` is the only effective termination. Removing it without a replacement would make `TimetableResourceTest.solveDemoDataUntilFeasible` (1-minute await, `TimetableResourceTest.java:51-56`) time out.

- **Remove** line 47: `%test.quarkus.timefold.solver.termination.best-score-limit=0hard/*soft`
- **Add**: `%test.quarkus.timefold.solver.termination.unimproved-spent-limit=5s` (shorter for tests; dataset1 reaches feasibility in seconds, then terminates 5s after last improvement)
- Keep `%test...spent-limit=1h` as a safety net, update comment accordingly.

### 3. `school-timetabling/src/test/java/org/acme/schooltimetabling/rest/TimetableEnvironmentTest.java`

`solve()` (line 48-51) copies the injected `SolverConfig` and explicitly nulls `BestScoreLimit`, intending a full 30s FULL_ASSERT/STEP_ASSERT run. The copied config will now inherit the test-profile `unimproved-spent-limit=5s`, silently weakening the assertion tests to ~5s after last improvement.

- In `solve()`, also clear the unimproved limit on the copied config so the test keeps its intended behavior:
  `updatedConfig.getTerminationConfig().withUnimprovedSpentLimit(null);`
  (keep the existing `withTerminationSpentLimit(Duration.ofSeconds(30))` and `withBestScoreLimit(null)`).

### 4. `spec.md` (repo root, lines 215-222)

Update the "Solver termination" doc block: remove the `best-score-limit` line, document `unimproved-spent-limit=10s`, and reword the sentence "The solver stops at the first feasible solution..." to "The solver stops after 10 seconds without score improvement, or after 30 seconds total."

## Out of scope (verified not broken)

- `app.js` `solve()` / `applySoftConstraintSelectionToSchedule()` — overrides re-sent correctly on every POST.
- `TimetableResource.solve()` — fresh job + fresh solver per request; overrides parsed per request.
- Lesson `@PlanningPin` — only set by explicit user pin action; not affected.

## Validation

1. `cd school-timetabling; ./mvnw quarkus:dev`, open the UI, load `dataset1`.
2. Solve with all soft constraints **unchecked** → feasible schedule.
3. Enable e.g. "Teacher room stability" (weight 10), click Solve again → solver must show SOLVING for more than an instant (runs local search up to ~30s), and the soft score should improve vs. the initial feasible solution; previously the second solve returned almost immediately with the unchanged schedule.
4. Regression: fresh dataset + constraints enabled **before** first solve still produces a feasible schedule.
5. `cd school-timetabling; ./mvnw test` — `TimetableResourceTest.solveDemoDataUntilFeasible` must still terminate within its 1-minute await and assert feasible; other tests unchanged.

## Risks

- Solves now run longer in the "instantly feasible" case (up to `unimproved-spent-limit` + processing, capped by 30s) — intended; the 10s value is a tunable trade-off.
- `unimproved-spent-limit` is wall-clock since last best-solution improvement; on very large datasets with frequent tiny improvements the solver may use most of the 30s cap — acceptable for this demo tool.
