# Parallel view: one-line layout with single shared timeline column

## Goal

Rebuild the **Parallel** tab so the timeslot column ("timeline") appears **once**, on the left, followed by the Rooms, Teachers, and Student groups tables — all **in one horizontal line**. The three tables share the width evenly (`flex: 1 1 0`). When space is insufficient, **each table gets its own independent horizontal scrollbar**; vertical scrolling stays **shared** (one scrollbar for the whole view, user-confirmed) so rows never misalign. Pane titles (Rooms / Teachers / Student groups) stay visible in the sticky header strip (user-confirmed).

This replaces the current broken state: a bogus `#parallelTimelineHeader` (built from room headers only) on top of three full grids that each still duplicate the timeslot column and header row.

## Target layout

```
#byParallel
└── .parallel-view  (overflow-y: auto; max-height: calc(100vh - 16rem))   ← THE single vertical scrollbar
    ├── .parallel-header-sticky  (position: sticky; top: 0; z-index: 4; display: flex)
    │   ├── .parallel-corner  ("Timeslot", width: var(--parallel-timeslot-width), align-self: stretch)
    │   └── .parallel-header-pane ×3  (flex: 1 1 0; min-width: 0; overflow: hidden)
    │       ├── .parallel-pane-title  ("Rooms" / "Teachers" / "Student groups" — fixed, never scrolls)
    │       └── .timetable-grid (ONE row: entity header cells; gridTemplateColumns: repeat(n, minmax(9rem, 1fr)))
    └── .parallel-body-row  (display: flex)
        ├── .parallel-timeslot-col  (width: var(--parallel-timeslot-width), flex: 0 0 auto)
        │   └── .timetable-grid (ONE column: timeslot label cells; gridTemplateRows: repeat(rowCount, var(--timetable-slot-height)))
        └── .parallel-body-pane ×3  (flex: 1 1 0; min-width: 0; overflow-x: auto)   ← independent horizontal scrollbar per table
            └── .timetable-grid (entity cols × timeslot rows, NO header row, NO timeslot col;
                                 gridTemplateColumns: repeat(n, minmax(9rem, 1fr));
                                 gridTemplateRows: repeat(rowCount, var(--timetable-slot-height));
                                 rows are 1-based here)
```

Header panes have `overflow: hidden` and their `scrollLeft` is synced from the matching body pane via JS, so entity headers track horizontal scrolling while titles stay fixed.

## Verified facts that make this work

- `.timetable-grid` uses `gap: 0` + `box-shadow` cell borders and rows are fixed-height (`--timetable-slot-height: 2.75rem`, timetable-shared.css L4/L12-19/L31-46) → the standalone timeslot column and the three body grids align **pixel-perfectly** when given the same row template.
- Drag-and-drop is document-delegated and reads only cell attributes (`data-view-type` / `data-timeslot-id` / `data-column-key` / `data-column-label`, app.js ~L294-346) → body cells in the new grids just need the same attributes; no wiring changes.
- `placeLessonOnGrid($grid, el, gridRow, gridColumn, rowSpan, truncated)` (L2347) takes explicit indices; `getLessonGridPlacement` (L1388) takes the row-index map as a parameter → both work with 1-based rows and `colIndex + 1` columns.
- `placeEcaBlocksOnGrid` (L1357) hardcodes `gridColumn: "2 / span " + colCount` → needs an optional `startColumn` param (default `2`, parallel passes `1`).
- Sticky headers **cannot** live inside the `overflow-x: auto` panes (setting `overflow-x` forces `overflow-y: auto`, creating a nested scrollport that never scrolls vertically → sticky would be relative to the pane, not the outer scroller). Hence the header strip is a sibling of the body row, sticky against `.parallel-view`.
- Header-pane width == body-pane width: both rows are flex containers of the same width with identical `flex: 1 1 0` children; a body pane's horizontal scrollbar consumes *height*, not width; the single outer vertical scrollbar shrinks header row and body row equally (both inside `.parallel-view`).

## Changes

### 1. index.html — replace the `#byParallel` pane content (~L1189-1205)

Remove `#parallelTimelineHeader` and the three static `.parallel-pane` blocks entirely; JS builds everything into one container:

```html
<div class="tab-pane fade" id="byParallel" role="tabpanel" aria-labelledby="byParallelTab">
  <div class="parallel-view" id="parallelView">
    <!-- Filled in by app.js (renderParallelView) -->
  </div>
</div>
```

### 2. index.html `<style>` block — replace the old parallel CSS (~L936-964)

Delete `.parallel-view`/`.parallel-pane`/`.parallel-grid-wrapper`/`.parallel-timeline-header` rules (including the `<992px` stacking media query — layout is **always one line** now) and add:

- `:root` or `.parallel-view` local: `--parallel-timeslot-width: 11rem;`
- `.parallel-view { overflow-y: auto; overflow-x: hidden; max-height: calc(100vh - 16rem); }`
- `.parallel-header-sticky { position: sticky; top: 0; z-index: 4; display: flex; }` (z-index above `.timetable-lesson` z-2 and `.timetable-grid-header` z-3)
- `.parallel-corner { flex: 0 0 var(--parallel-timeslot-width); display: flex; align-items: center; }` — reuse `.timetable-grid-header` class for look; remove its own `position: sticky` effect inside the strip (the strip itself is sticky) by not relying on it / overriding with `position: static` if needed.
- `.parallel-header-pane, .parallel-body-pane { flex: 1 1 0; min-width: 0; }`
- `.parallel-header-pane { overflow: hidden; }`
- `.parallel-body-pane { overflow-x: auto; }`
- `.parallel-body-row { display: flex; }`
- `.parallel-timeslot-col { flex: 0 0 var(--parallel-timeslot-width); }`
- Keep `.parallel-pane-title` style; add `flex: 0 0 auto;`.
- Avoid double borders between adjacent sub-grids: `.parallel-view .timetable-grid { border-left: 0; }` except the first (cosmetic, keep simple).

All styles stay in index.html's `<style>` block (demo-specific); **timetable-shared.css is untouched** (shared with pop-outs).

### 3. app.js — cleanup of the previous refactor

- **Delete** `buildSharedTimelineHeader` and `buildTimetableGridBody` (added in previous iterations).
- `renderEntityViewGrids` (L2962): switch its three `buildTimetableGridBody(...)` calls back to the original **`buildTimetableGrid($container, timetable, headers, viewType)`** — single views render exactly as before. Keep the rest (header construction, `$unassignedContainer` param, placements) as-is.

### 4. app.js — `placeEcaBlocksOnGrid` (L1357)

Add optional 5th parameter `startColumn` (default `2`); use `` gridColumn: `${startColumn} / span ${colCount}` ``. Existing callers unchanged.

### 5. app.js — extract room-priority click binding

The star-button click handler currently inlined in `buildTimetableGrid` (L1434-1465) is needed by the parallel header builder too. Extract `attachRoomPriorityEditor($extraContent, roomKey)` containing the click handler body; call it from both places. Behavior unchanged (solver-running guard, inline number input, blur/Enter commit → `refreshScoreAfterManualMove()`, Escape restores).

### 6. app.js — new `renderParallelView(timetable, manualEditEnabled)`

Called from `renderSchedule` after the single-view render. Steps:

1. Build `roomHeaders` / `teacherHeaders` / `studentGroupHeaders` — **reuse the exact header-building code** from `renderEntityViewGrids` (extract a small `buildEntityViewHeaders(timetable)` helper returning `{ roomHeaders, teacherHeaders, studentGroupHeaders }` and use it in both functions to avoid a third copy).
2. `$view = $("#parallelView").empty()`.
3. Build `.parallel-header-sticky`: corner div (`Timeslot`, classes `timetable-grid-header timetable-grid-corner parallel-corner`) + one `.parallel-header-pane` per entity view containing `.parallel-pane-title` and a one-row `.timetable-grid` of header cells (`repeat(n, minmax(9rem,1fr))`, header cells via same markup as `buildTimetableGrid` L1426-1469, room priority button wired via `attachRoomPriorityEditor`).
4. Build `.parallel-body-row`:
   - `.parallel-timeslot-col` with a one-column `.timetable-grid`: one `.timetable-grid-timeslot-label` per timeslot (same markup as L1474-1481: `getTimeslotDayCssClass`, `formatTimeslotLabel`, `timeslot-lunch-hard`), `gridRow: rowIndex + 1`.
   - One `.parallel-body-pane` per entity view with a `.timetable-grid` (`repeat(n, minmax(9rem,1fr))` × `repeat(rowCount, var(--timetable-slot-height))`): drop cells per (timeslot × header) with the same `data-view-type`/`data-timeslot-id`/`data-column-key`/`data-column-label` attributes as L1483-1494, but `gridRow: rowIndex + 1`, `gridColumn: colIndex + 1`.
5. `placeEcaBlocksOnGrid(timetable, $grid, parallelRowIndexByTimeslotId, headers.length, 1)` per pane, where `parallelRowIndexByTimeslotId` maps timeslot id → `index + 1` (build inline, mirroring `buildTimeslotRowIndexMap` but 1-based).
6. Lesson loop: for each **assigned** lesson build one card (`buildLessonCard(lesson, pickColor(lesson.subject), cardOptions)` — same `cardOptions` logic as `renderEntityViewGrids`) and place clones into the three parallel grids: `getLessonGridPlacement(timetable, timeslot, lesson, parallelRowIndexByTimeslotId)` + `placeLessonOnGrid($grid, lessonElement, placement.startRow, headerIndex + 1, placement.rowSpan, placement.truncated)`. Column lookup logic identical to `renderEntityViewGrids` (room by `room.id`; teacher via `convertToId(getLessonTeacherPlacement(lesson))`; group via `convertToId(getLessonStudentGroupPlacement(lesson))`) — only `+ 1` instead of `+ 2`.
   - **Unassigned lessons are NOT handled here** (sidebar is rendered once by the single-view call).
7. Scroll sync: for each pane `i`, `$bodyPane.on("scroll", () => $headerPane.children(".timetable-grid").parent().scrollLeft(...))` — i.e. set the header pane's `scrollLeft` to the body pane's `scrollLeft`. Bind on the freshly built elements (rebuilt every `renderSchedule`, no delegation needed).

### 7. app.js — `renderSchedule` simplification (L3044+)

- Remove the local header-building code (moved into `buildEntityViewHeaders`) and the `buildSharedTimelineHeader(...)` call.
- Keep: drag-state reset, `refreshSolvingButtons`, `renderScoreDisplay`, `#info`, unassigned sidebar emptying, single-view `renderEntityViewGrids(..., unassignedLessons)` call (returns `unassignedCount`), `updateUnassignedLessonCount`, "All lessons assigned" alert, `refreshCustomLessonCardDatalists`, pop-out sync.
- Add: `renderParallelView(timetable, manualEditEnabled);`

## What does NOT change

- No backend/solver/API changes.
- No changes to drag-and-drop handlers, validation, `applyManualLessonMove`, `refreshScoreAfterManualMove` — view-agnostic, attribute-driven.
- Single views (By room / By teacher / By student group) render via the **original** `buildTimetableGrid` — pixel-identical to before the Parallel feature.
- `timetable-shared.css`, `schedule-popout.html`, `chat-to-schedule.js` untouched.
- No scroll synchronization between the three body panes — horizontal scrolling is deliberately **independent** per table; vertical scroll is structurally shared (single scroller), so no JS sync needed for it.

## Risks / edge cases

- **Row alignment**: guaranteed by identical `gridTemplateRows` (fixed `var(--timetable-slot-height)`), `gap: 0`, border-via-box-shadow. Verify with lessons spanning multiple rows and ECA blocks present.
- **Header/body width drift**: header and body panes are equal-flex children of equal-width flex rows; the outer vertical scrollbar affects both rows equally. Verify at viewport widths where 0/1/2/3 panes show horizontal scrollbars.
- **Sticky stacking**: `.parallel-header-sticky` needs `z-index: 4` so lesson cards (z-2) and header cells (z-3) slide under it.
- **Render cost**: 3 parallel grids + 3 single-view grids per render — same order as before; fine for demo datasets.
- **Cross-pane drags** (e.g. Rooms-pane card onto Teachers-pane cell) still work and behave like the equivalent single-view drop — acceptable.
- **Solver running**: `manualEditEnabled` passed to `renderParallelView`; cards lock exactly like single views.
- **Old containers removed**: ensure no code still references `#parallelTimelineHeader` / `#parallelByRoom` / `#parallelByTeacher` / `#parallelByStudentGroup` after the refactor (grep before done).

## Validation

1. Run the app (`mvnw quarkus:dev` in `school-timetabling`), load a demo dataset, solve.
2. Open **Parallel**: one line — timeslot column once on the left, then Rooms / Teachers / Student groups tables evenly distributed; pane titles visible.
3. Exactly **one vertical scrollbar** for the whole view; scrolling it moves all three tables + timeslot column together; sticky title+header strip stays on top; rows align across all four columns (check multi-row lessons and ECA blocks).
4. Shrink the window: each table gets its **own horizontal scrollbar**; scrolling one table horizontally scrolls its entity headers (synced) but not the other tables and not the timeslot column.
5. Drag an assigned lesson in any pane → after score refresh the move shows in all panes and single-view tabs. Repeat per pane (teacher/group manual placement included).
6. Pinned-overlap drop → warning, no mutation; unpinned-overlap drop → conflicting lesson displaced to the (single) Unassigned sidebar, badge counts once.
7. Pin/unpin, unassign, violation-badge modal, room-priority star editing work from parallel panes (star in the synced header strip).
8. Solver running → cards in parallel panes not draggable.
9. By room / By teacher / By student group tabs pixel-identical and behavior-identical to before.
10. `node --check app.js` passes.
