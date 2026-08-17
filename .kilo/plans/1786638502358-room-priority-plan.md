# Room Priority: Editable Per-Room Allocation Preference

## Goal

Today room allocation by the solver has no user-controllable preference: each lesson's room value range is just the `rooms` list order (`Timetable.updateLessonValueRanges()`), which follows `preparationState.rooms` insertion order. Add a per-room **priority** so that:

1. In **Preparation → Classrooms**, each room row has a room-name input and a priority input.
2. In the **Demo UI timetable (By room view)**, clicking a room column header badge opens an inline input to edit that room's priority.
3. The solver prefers higher-priority rooms via a new toggleable **soft constraint**.

## Resolved decisions

- **Solver effect**: new soft constraint `Room priority` — reward `ONE_SOFT × room.priority` per assigned lesson. Added to `SOFT_CONSTRAINTS` so it appears in the existing enable/disable + weight panel. Hard feasibility is unchanged (any eligible room still allowed).
- **Scale**: integer, **higher = more preferred**, default `0`. No renumbering on add/remove; ties are fine.
- **Timetable click UX**: room column headers already support `extraContent` (`app.js` `renderSchedule()`, ~line 2787 — currently an empty placeholder button). Render a priority badge button there; clicking swaps it for a small inline number input (Enter/blur commits, Esc cancels), updates the loaded timetable, and triggers the existing score-refresh so the soft score reflects the new priority without re-solving.

## Data model

### Backend (`Room.java`)
- Add `private int priority;` (default 0), getter/setter. Keep existing `Room(id, name)` constructor (priority 0) so current tests/demo code compile unchanged; add `Room(id, name, priority)`.
- Jackson serializes `priority` automatically; `@JsonIdentityInfo` (by `id`) is unaffected.

### Frontend preparation state
- `preparationState.rooms` changes from `string[]` to `{ name, priority }[]`.
- Subject-to-room mappings (`subject.rooms`) and card `roomNames` **stay plain name strings** (unchanged).
- Add helper `getRoomNames()` (returns `preparationState.rooms.map(r => r.name)`) and update every string-based usage in `preparation.js`: `buildRoomsWithIds()` (~278, emit `{id, name, priority}`), `buildTimetableJson()` fallback (~410), `buildWorkspaceJson()` export (~455), `applyWorkspaceJson()` (~719), lesson-inferred room list (~867), `renderRoomList()` (~955), `ensureAssignmentSelections()` (~1022), assignment entity list call (~1278), `addRoom()` (~1610), `removeRoom()` (~1661).
- `normalizeRoomNames()` → `normalizeRooms()`: accepts legacy string arrays, legacy `{id,name}` objects, and new `{name, priority}` objects; missing/invalid priority → 0. Legacy workspace JSON (incl. `demo-preparation-workspace.json` and localStorage cache) keeps loading with priority 0.

## Task list

1. **Backend domain** — `domain/Room.java`: add `priority` field, getter/setter, 3-arg constructor; keep 2-arg constructor delegating with priority 0.
2. **Backend constraint** — `solver/TimetableConstraintProvider.java`:
   - Add constant `ROOM_PRIORITY = "Room priority"` and include it in `SOFT_CONSTRAINTS`.
   - Add `roomPriority(constraintFactory)` to `defineConstraints()`: `forEach(Lesson.class).filter(l -> l.getRoom() != null).reward(HardSoftScore.ONE_SOFT, l -> l.getRoom().getPriority()).asConstraint(ROOM_PRIORITY)`.
3. **Backend test** — `TimetableConstraintProviderTest.java`: add a test verifying a lesson in a priority-2 room scores +2 soft higher than the same lesson in a priority-0 room (follow existing test patterns there). Existing tests keep passing unchanged (default priority 0 → no score change).
4. **Demo UI constraint panel** — `app.js` `SOFT_CONSTRAINTS` array (~line 21): add entry `{ id: "roomPriority", name: "Room priority", label: "Prefer higher-priority classrooms", labelZh: "優先使用優先度較高的課室", helpWhen: "Lesson is assigned to a lower-priority room", helpContribution: "+priority × weight per lesson" }` (match existing bilingual pattern).
5. **Demo UI timetable editing** — `app.js` `renderSchedule()` room header `extraContent` (~2787):
   - Render badge button showing current priority (e.g. `★2`, or `☆` when 0), `title="Room priority — click to edit"`.
   - Click → replace with inline `<input type="number">` prefilled; commit on Enter/blur, cancel on Esc.
   - On commit: parse integer (fallback 0), update the room object in `loadedSchedule.rooms` and `roomMap`, re-render, and call the existing score-refresh path (`refreshScoreAfterManualMove()`) so the soft score updates. Verify `normalizeScheduleReferencesForApi()` already passes `rooms` through with all fields (it only converts lesson-level refs to ids — confirm `priority` survives).
6. **Preparation Classroom table** — `index.html` (~1382): replace the single name input + `<ul id="roomList">` with a small table: header row (Classroom / Priority / ""), an input row (`#newRoomNameInput`, `#newRoomPriorityInput` number input default 0, Add button), and a body rendered by JS. Adjust adjacent prep CSS classes if needed.
7. **Preparation logic** — `preparation.js`:
   - Convert state to `{name, priority}` objects + `getRoomNames()` helper; update all usages listed in Data model.
   - `addRoom()`: read + validate priority (integer, default 0 on blank/invalid).
   - `renderRoomList()`: render table rows; priority shown as a number input per row, committed on change/Enter into state; Remove button unchanged.
   - Export/import: `buildWorkspaceJson()` emits `{name, priority}` rooms; `normalizeRooms()` keeps legacy compatibility. Room ids in `buildRoomsWithIds()` remain positional indexes (`String(index)`) — unchanged.
8. **Docs** — `spec.md`: add `Room priority | Soft | Prefers rooms with higher priority (+priority per lesson)` to the constraint table and note priority on the Room entity row.

## Failure modes / edge cases

- **Legacy data**: old workspace JSON / cached localStorage / hand-written timetable JSON without `priority` must load with priority 0 (both JS normalizer and Java field default).
- **Score toggle off**: when `Room priority` is unchecked, `applyEnabledSoftConstraints()` zeroes it — verify the new name is in `SOFT_CONSTRAINTS` or the toggle silently no-ops.
- **Negative priorities**: allowed (integer input); they simply score lower. No clamping beyond integer parsing.
- **Solver running**: hide/disable the priority badge editing while `isSolverRunning()` (same as `manualEditEnabled` gating for drag-and-drop).
- **Unassigned lessons**: `room == null` → constraint filter excludes them; no NPE.

## Validation

1. `mvn -f school-timetabling/pom.xml test` (or existing wrapper) — all existing tests pass; new constraint test passes.
2. Manual: Preparation → add classrooms with priorities → Generate/Open in Demo UI → enable `Room priority` → Solve → lessons cluster in higher-priority rooms; soft score reflects priority sum.
3. Manual: in By room view, click a room header badge, change priority, confirm score refreshes and next Solve respects the new priority.
4. Manual: load `demo-preparation-workspace.json` (no priorities) — loads with all priorities 0, no console errors.

## Out of scope

- Per-subject or per-lesson room priority (only global per-room).
- Sorting timetable columns by priority (columns keep current order).
- Chat-agent tool changes (`chat-to-schedule.js` displays rooms by name only; unaffected).
- Updating `demo-preparation-workspace.json` sample data with non-zero priorities (optional; loader handles its absence).
