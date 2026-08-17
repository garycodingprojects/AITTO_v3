# Teacher Availability (Mon–Fri) + "Teacher availability" Soft Constraint

## Goal
In the Preparation workspace, the Teachers panel becomes a table with a per-teacher
Monday–Friday availability checkbox grid (all checked by default). A new soft
constraint **"Teacher availability"** (enabled/checked by default in the Demo UI and
chat-agent) penalizes any lesson placed on a day the teacher marked unavailable.

## Confirmed decisions
- Solver input: per-lesson `teacherUnavailableDays` field (mirrors `subjectTypes`).
- Penalty: `HardSoftScore.ONE_SOFT` per lesson on an unavailable day (UI weight scales it).
- Checkbox columns: fixed Mon–Fri, all checked by default.
- Storage: parallel map `preparationState.teacherAvailability = { name: [days...] }`;
  teachers stay a plain string array. Missing map entry = all days available.

## Changes

### 1. Preparation UI — `index.html`
- Replace `<ul id="teacherList">` (Teachers panel, ~line 1480) with a table:
  `<table><thead> Teacher | Mon | Tue | Wed | Thu | Fri | (remove) </thead><tbody id="teacherListBody">`.
  Keep the existing `id="teacherList"` if simpler, but render table rows.

### 2. Preparation logic — `preparation.js`
- Add constant `TEACHER_AVAILABILITY_DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"]`.
- Add `teacherAvailability: {}` to `preparationState` init (near line 180).
- `addTeacher()`: set `teacherAvailability[name] = TEACHER_AVAILABILITY_DAYS.slice()`.
- `removeTeacher()`: delete the map entry.
- `renderTeacherList()`: render one table row per teacher — name, five checkboxes
  (checked = day available; on change update the map), and the existing Remove button.
- `buildTimetableJson()` (~line 413): per lesson add
  `teacherUnavailableDays`: for `card.teacher`, all days in `TEACHER_AVAILABILITY_DAYS`
  missing from `teacherAvailability[card.teacher]` (missing entry → empty list).
- `buildWorkspaceJson()` (~line 459) and workspace load (~line 742): persist/restore
  `teacherAvailability` in the `preparation` object; on load, backfill missing teachers
  with all-days-available.
- Demo-load paths (`loadDemoDataIntoPreparation` ~line 878 and default state): initialize
  `teacherAvailability` entries as all-available for each teacher.

### 3. Solver — `TimetableConstraintProvider.java`
- New constant: `public static final String TEACHER_AVAILABILITY = "Teacher availability";`
- Add it to `SOFT_CONSTRAINTS` list and to `defineConstraints`.
- New constraint method:
  ```java
  Constraint teacherAvailability(ConstraintFactory f) {
      return f.forEach(Lesson.class)
              .filter(l -> l.getTimeslot() != null
                      && l.getTeacherUnavailableDays().contains(l.getTimeslot().getDayOfWeek()))
              .penalize(HardSoftScore.ONE_SOFT)
              .asConstraint(TEACHER_AVAILABILITY);
  }
  ```

### 4. Domain — `Lesson.java`
- Add `private List<String> teacherUnavailableDays = new ArrayList<>();` with getter/setter
  (null-safe like `subjectTypes`). Serialized per-lesson; problem fact-free.

### 5. Violation labels — `TimetableViolationLabeler.java`
- Add a `labelTeacherAvailability(assignedLessons)` step, guarded by
  `isSoftConstraintEnabled(timetable, TEACHER_AVAILABILITY)`, marking each assigned lesson
  whose day is in `teacherUnavailableDays` with a soft `ViolationInfo`:
  `"Teacher <name> is not available on <day>."`

### 6. Demo UI — `app.js`
- Add to `SOFT_CONSTRAINTS`:
  ```js
  { id: "teacherAvailability", name: "Teacher availability",
    label: "Respect teacher availability days", labelZh: "避開教師不可用嘅日子",
    defaultChecked: true,
    helpWhen: "Lesson is scheduled on a day the teacher marked unavailable",
    helpContribution: "−weight per lesson" }
  ```
- `renderSoftConstraintCheckboxes()`: honor optional `defaultChecked: true` — pre-check the
  box and enable its weight input on first render (all other constraints stay unchecked).
  `applySoftConstraintSelectionToSchedule` needs no change.

### 7. Chat agent — `chat-agent/src/timetable/softConstraints.ts`
- Add matching definition (same id/name/labels) to `SOFT_CONSTRAINT_DEFINITIONS`.
- Add optional `defaultEnabled?: boolean` to `SoftConstraintDefinition`; set it on the new
  constraint and honor it in `createDefaultSoftConstraintSettings()` so chat defaults to
  enabled, mirroring the Demo UI.

### 8. Tests
- `school-timetabling/src/test/java/.../solver/`: add a constraint test proving a lesson on
  an unavailable day scores `1soft` worse, and none when the day is available.
- `chat-agent/test/timetable.test.ts`: cover the new definition and its default-enabled flag.
- Manual: Teachers table renders 5 checked day boxes per teacher; unchecking a day updates
  exported lesson JSON (`teacherUnavailableDays`) and the solver penalizes accordingly with
  the constraint checked; unchecking the constraint disables the penalty.

## Backward compatibility
- Old workspace/demo JSON without `teacherAvailability` or `teacherUnavailableDays` loads as
  all-available; empty list ⇒ constraint never fires.
- `TimetableConstraintProvider.SOFT_CONSTRAINTS` ordering change is safe: overrides are
  keyed by name.

## Validation
- `mvn test` in `school-timetabling/` (or `mvn -f school-timetabling/pom.xml test`).
- `node --test` / repo test script in `chat-agent/`.
- Run the app, open Preparation, verify table + checkboxes, export workspace JSON persists
  availability, solve via Demo UI with the constraint pre-checked.
