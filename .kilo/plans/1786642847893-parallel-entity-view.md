# Parallel view: room + teacher + student group on one screen

## Goal

Add a 4th entity-view tab **"Parallel"** after "By student group" in the Demo UI (AI Scheduler). It shows the By-room, By-teacher, and By-student-group grids side by side, each pane with its own independent vertical/horizontal scrollbar. All existing behavior (drag-and-drop manual scheduling, pin/unpin, unassign, violation modal, room-priority editing) must work in each pane, and a drop in any pane must immediately update the other two.

## Why this is easy in this codebase (verified facts)

- `renderSchedule(timetable)` (app.js ~L2808) already rebuilds all three entity grids from `loadedSchedule` on every update; lesson cards are cloned per grid (`placeLessonOnGrid` → `lessonElement.clone(true)`, app.js L2358).
- Drag-and-drop is **document-delegated** and driven only by cell attributes `data-view-type` / `data-column-key` / `data-column-label` / `data-timeslot-id` (app.js L294–346). Any grid built by `buildTimetableGrid($container, timetable, headers, viewType)` (app.js L1412) is automatically a valid drop target — no per-grid wiring exists.
- After a drop, `handleEntityViewLessonDrop` → `applyManualLessonMove` → `refreshScoreAfterManualMove()` (app.js L2642) PUTs `/timetables/score` and calls `renderSchedule(updatedSchedule)`. So once the Parallel panes are rendered by `renderSchedule`, "drop in room updates teacher + student group in the same view" happens automatically.
- Tabs are pure Bootstrap (`data-bs-toggle="tab"` / `data-bs-target`); there is **no** `shown.bs.tab` JS to extend.
- Files involved: `school-timetabling/src/main/resources/META-INF/resources/index.html`, `app.js`. Demo-specific styles live in the `<style>` block in index.html (timetable-shared.css is shared with pop-outs — leave it untouched unless necessary).

## Changes

### 1. index.html — tab button (~L1104, after the `byStudentGroupTab` `<li>`)

```html
<li class="nav-item" role="presentation">
  <button class="nav-link" id="byParallelTab" data-bs-toggle="tab"
          data-bs-target="#byParallel" type="button" role="tab" aria-controls="byParallel"
          aria-selected="false">Parallel
  </button>
</li>
```

### 2. index.html — tab pane (~L1144, after the `#byStudentGroup` pane)

```html
<div class="tab-pane fade" id="byParallel" role="tabpanel" aria-labelledby="byParallelTab">
  <div class="parallel-view">
    <div class="parallel-pane">
      <div class="parallel-pane-title">Rooms</div>
      <div class="timetable-grid-wrapper parallel-grid-wrapper" id="parallelByRoom"></div>
    </div>
    <div class="parallel-pane">
      <div class="parallel-pane-title">Teachers</div>
      <div class="timetable-grid-wrapper parallel-grid-wrapper" id="parallelByTeacher"></div>
    </div>
    <div class="parallel-pane">
      <div class="parallel-pane-title">Student groups</div>
      <div class="timetable-grid-wrapper parallel-grid-wrapper" id="parallelByStudentGroup"></div>
    </div>
  </div>
</div>
```

### 3. index.html `<style>` block — parallel layout (near the existing `.timetable-view-tabs` styles)

- `.parallel-view { display: flex; gap: 0.5rem; }`
- `.parallel-pane { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }`
- `.parallel-pane-title { font-weight: 600; padding: 0.25rem 0.5rem; background: #f8f9fa; border: 1px solid #dee2e6; border-bottom: 0; }`
- `.parallel-grid-wrapper { overflow: auto; max-height: calc(100vh - 16rem); margin-bottom: 0; }` — this is what gives each pane its **independent** vertical + horizontal scrollbar (the base `.timetable-grid-wrapper` only sets `overflow-x`). Sticky grid headers (`.timetable-grid-header { position: sticky; top: 0 }` in timetable-shared.css) keep working inside each scroll container.
- Media query `< 992px`: `.parallel-view { flex-direction: column; }` and a smaller per-pane `max-height` (e.g. 20rem), matching the existing responsive pattern.

### 4. app.js — `renderSchedule` refactor (~L2808–2902)

Extract the three-entity-grid construction into one helper and call it twice (single-view containers + parallel containers). No behavior changes to drop/validation logic.

- New helper, e.g. `renderEntityViewGrids(timetable, $roomContainer, $teacherContainer, $groupContainer, manualEditEnabled)`:
  - Empty the three containers.
  - Build `roomHeaders` (including the priority-star `extraContent`), `teacherHeaders`, `studentGroupHeaders` — move existing code as-is.
  - `buildTimetableGrid` × 3 with `ENTITY_VIEW_ROOM` / `ENTITY_VIEW_TEACHER` / `ENTITY_VIEW_STUDENT_GROUP`.
  - `placeEcaBlocksOnGrid` × 3.
  - Loop `timetable.lessons`: skip unassigned; for assigned lessons build one card via `buildLessonCard(lesson, pickColor(lesson.subject), cardOptions)` and place clones into the three grids via `getLessonGridPlacement` + `placeLessonOnGrid` (existing code, unchanged).
- `renderSchedule` keeps: drag-state reset, `refreshSolvingButtons`, `renderScoreDisplay`, `#info` text, the **unassigned-lessons sidebar** (count, list, "All lessons assigned" alert — stays rendered once, do not move into the helper), `refreshCustomLessonCardDatalists`, pop-out sync (`persistScheduleForPopouts` / `notifySchedulePopouts`).
- `renderSchedule` then calls:
  1. `renderEntityViewGrids(timetable, $("#timetableByRoom"), $("#timetableByTeacher"), $("#timetableByStudentGroup"), manualEditEnabled)`
  2. `renderEntityViewGrids(timetable, $("#parallelByRoom"), $("#parallelByTeacher"), $("#parallelByStudentGroup"), manualEditEnabled)`
- Header construction currently depends on closures over `roomMap`; keep it inside the helper so both call sites get fresh headers/buttons.

### 5. Optional (nice-to-have, low risk)

- Update the guided-tour text in index.html (L1576 EN, L1749 ZH) that says "Switch between By room, By teacher, and By student group" to mention Parallel.

## What does NOT change

- No backend/solver changes; no API changes.
- No changes to drag-and-drop handlers, `validateManualDropAssignment`, `applyManualLessonMove`, `unassignOverlappingLessonsInTargetColumn`, `refreshScoreAfterManualMove` — they are view-agnostic.
- No changes to schedule pop-out windows (`schedule-popout.html`) or `chat-to-schedule.js` (its view selector at L21 is an agent tool; adding "parallel" there is out of scope).
- No scroll synchronization between panes — the requirement is *independent* scrollbars. Row heights are fixed (`--timetable-slot-height`), so panes naturally align when scrolled to the same position.

## Risks / edge cases

- **Render cost doubles** (6 grids, 6 card-clone passes per `renderSchedule`). Fine for demo datasets. If jank appears on very large timetables, a follow-up can lazy-render the parallel grids only after `#byParallelTab` is first shown — do not build this now.
- Panes are ~1/3 screen width, so grids scroll horizontally within each pane — expected; per-pane `overflow: auto` handles it.
- Cross-pane drags (e.g. drag a card from the Rooms pane onto a Student-groups cell) work automatically and behave exactly like the equivalent single-view drop — acceptable, consistent behavior.
- Room-priority star button: its click handler is bound per built header in `buildTimetableGrid`, so the duplicate room grid in the Parallel pane gets its own working handler.
- Solver running: `manualEditEnabled = !isSolverRunning()` is passed to both calls, so cards in parallel panes lock exactly like the single views.

## Validation

1. Run the app (Quarkus dev: `mvnw quarkus:dev` in `school-timetabling`, or the repo's docker-compose). Open the Demo UI, load a demo dataset, solve.
2. Open the **Parallel** tab: three grids visible side by side with pane titles; each pane scrolls vertically and horizontally **independently**; sticky header row works per pane.
3. Drag an assigned lesson card in the **Rooms** pane to another timeslot/room → after the score refresh, the card shows the move in the Teachers and Student-groups panes (and in the single-view tabs).
4. Repeat a drop in the **Teachers** pane and **Student groups** pane; confirm manual teacher/group placement behavior (`manualTeacherPlacement` / `manualStudentGroupPlacement`) matches the single views.
5. Drop onto a pinned overlap → warning shown, no mutation. Drop onto an unpinned overlap → conflicting lesson displaced to Unassigned sidebar (single sidebar, count badge updates once).
6. Pin/unpin and unassign buttons, violation-badge modal, and room-priority star editing all work from cards/headers in the parallel panes.
7. While the solver is running, cards in parallel panes are not draggable.
8. By room / By teacher / By student group tabs render and behave exactly as before.
