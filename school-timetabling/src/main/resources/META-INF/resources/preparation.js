/**
 * Preparation page: author demo timetable data without solving.
 * Supports full workspace JSON and browser cache (localStorage).
 */

/** JSON format identifier for full workspace (setup + cards + generated timetable). */
const PREPARATION_WORKSPACE_FORMAT = "school-timetabling-preparation-v1";

/** localStorage key for cached full workspace JSON. */
const PREPARATION_CACHE_KEY = "school-timetabling-preparation-workspace";

/** Length of one atomic scheduling slot in minutes (must match Timeslot.SLOT_MINUTES). */
const SLOT_MINUTES = 30;

/** School day bounds (defaults match TimeslotGenerator.java). */
const DEFAULT_SCHOOL_DAY = { start: "08:30", end: "17:30" };
const LUNCH_HARD_START = { hour: 13, minute: 0 };
/** ECA half-day period identifiers. */
const ECA_PERIOD_AM = "AM";
const ECA_PERIOD_PM = "PM";

/** Example subject type tags shown when adding a subject; users can also enter custom tags. */
const EXAMPLE_SUBJECT_TYPE_TAGS = ["Trade", "Generic", "Theory", "Practical"];

/** Days of week for teacher availability checkboxes (Mon–Fri). */
const TEACHER_AVAILABILITY_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

/** Preferred weekdays for subject cards (same Mon–Fri set as teacher availability). */
const PREFERRED_WEEKDAY_DAYS = TEACHER_AVAILABILITY_DAYS;

/** Default preferred weekdays: subject is available on every weekday. */
function defaultPreferredWeekdays() {
  return PREFERRED_WEEKDAY_DAYS.slice();
}

/**
 * Normalizes preferred weekdays from workspace/lesson JSON.
 * Missing/null defaults to all days; an explicit empty array is preserved.
 */
function normalizePreferredWeekdays(raw) {
  if (raw == null) {
    return defaultPreferredWeekdays();
  }
  return (raw || [])
    .map(day => String(day).trim())
    .filter(day => PREFERRED_WEEKDAY_DAYS.includes(day));
}

/**
 * Returns Mon–Fri days present in a raw availability list, in calendar order.
 */
function normalizeTeacherAvailabilityDays(rawDays) {
  const allowed = new Set();
  for (const day of rawDays || []) {
    const value = String(day).trim();
    if (TEACHER_AVAILABILITY_DAYS.includes(value)) {
      allowed.add(value);
    }
  }
  return TEACHER_AVAILABILITY_DAYS.filter(day => allowed.has(day));
}

/**
 * Clones a teacher-availability map, keeping only valid weekday names.
 */
function cloneTeacherAvailability(map) {
  const cloned = {};
  if (map == null || typeof map !== "object" || Array.isArray(map)) {
    return cloned;
  }
  for (const teacher of Object.keys(map)) {
    cloned[teacher] = normalizeTeacherAvailabilityDays(map[teacher]);
  }
  return cloned;
}

/**
 * True when workspace JSON includes a persisted teacher-availability map.
 */
function hasPersistedTeacherAvailability(rawMap) {
  return rawMap != null && typeof rawMap === "object" && !Array.isArray(rawMap)
    && Object.keys(rawMap).length > 0;
}

/**
 * Builds a complete teacher-availability map for the given teachers.
 * Missing teachers default to available every weekday.
 */
function buildTeacherAvailabilityMap(teachers, rawMap) {
  const normalizedRaw = cloneTeacherAvailability(rawMap);
  const result = {};
  for (const teacher of teachers || []) {
    result[teacher] = Object.prototype.hasOwnProperty.call(normalizedRaw, teacher)
      ? normalizedRaw[teacher].slice()
      : TEACHER_AVAILABILITY_DAYS.slice();
  }
  return result;
}

/**
 * Days the teacher is unavailable (Mon–Fri minus available days).
 * Missing map entry means available every day.
 */
function unavailableDaysForTeacher(teacherName) {
  if (!teacherName || !preparationState.teacherAvailability[teacherName]) {
    return [];
  }
  const availableDays = preparationState.teacherAvailability[teacherName];
  return TEACHER_AVAILABILITY_DAYS.filter(day => !availableDays.includes(day));
}

/**
 * Writes teacherUnavailableDays onto one card from the current availability map.
 */
function applyTeacherAvailabilityToCard(card) {
  if (!card) {
    return;
  }
  card.teacherUnavailableDays = unavailableDaysForTeacher(card.teacher);
}

/**
 * Syncs teacherUnavailableDays on every subject card from teacherAvailability.
 */
function syncAllCardsTeacherAvailability() {
  for (const card of preparationState.cards) {
    applyTeacherAvailabilityToCard(card);
  }
}

/**
 * Derives a teacher-availability map from lessons/cards that store unavailable days.
 * Used when loading legacy workspace JSON that did not persist teacherAvailability.
 */
function deriveTeacherAvailabilityFromLessonList(teachers, lessons) {
  const availability = buildTeacherAvailabilityMap(teachers, {});
  for (const lesson of lessons || []) {
    const teacher = lesson.teacher;
    const unavailable = (lesson.teacherUnavailableDays || [])
      .map(day => String(day).trim())
      .filter(day => TEACHER_AVAILABILITY_DAYS.includes(day));
    if (!teacher || unavailable.length === 0) {
      continue;
    }
    if (!availability[teacher]) {
      availability[teacher] = TEACHER_AVAILABILITY_DAYS.slice();
    }
    availability[teacher] = availability[teacher].filter(day => !unavailable.includes(day));
  }
  return availability;
}

/**
 * Normalizes parallel card IDs from workspace/lesson JSON.
 * Missing/null defaults to an empty list (no parallel pairing).
 * Ignores legacy subject-name values that are not card IDs.
 */
function normalizeParallelCardIds(raw) {
  return [...new Set((raw || [])
    .map(id => String(id).trim())
    .filter(id => id && isPreparationCardId(id)))];
}

/** True when the value looks like a subject-card / lesson ID (e.g. 0003). */
function isPreparationCardId(value) {
  return /^\d+$/.test(String(value).trim());
}

/** Serializes LocalTime the same way as backend Jackson (HH:mm:ss). */
const PREPARATION_TIME_FORMATTER = JSJoda.DateTimeFormatter.ofPattern("HH:mm:ss");

/** Parses HH:mm or HH:mm:ss from JSON / HTML time inputs into JSJoda LocalTime. */
function parsePreparationLocalTime(timeText) {
  const normalized = String(timeText || "").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length === 5) {
    return JSJoda.LocalTime.parse(normalized + ":00");
  }
  return JSJoda.LocalTime.parse(normalized);
}

function formatLocalTimeForJson(localTime) {
  return localTime.format(PREPARATION_TIME_FORMATTER);
}

/** Returns a copy of the default school-day bounds. */
function createDefaultSchoolDay() {
  return { start: DEFAULT_SCHOOL_DAY.start, end: DEFAULT_SCHOOL_DAY.end };
}

/**
 * Normalizes schoolDay from setup/workspace JSON; falls back to defaults for older files.
 */
function normalizeSchoolDay(rawSchoolDay) {
  if (!rawSchoolDay || typeof rawSchoolDay !== "object") {
    return createDefaultSchoolDay();
  }
  const start = rawSchoolDay.start != null ? String(rawSchoolDay.start).substring(0, 5) : DEFAULT_SCHOOL_DAY.start;
  const end = rawSchoolDay.end != null ? String(rawSchoolDay.end).substring(0, 5) : DEFAULT_SCHOOL_DAY.end;
  return { start: start, end: end };
}

/**
 * Validates school start/end for timeslot generation.
 * Returns an error message string, or null when valid.
 */
function validateSchoolDay(schoolDay) {
  const startTime = parsePreparationLocalTime(schoolDay.start);
  const endTime = parsePreparationLocalTime(schoolDay.end);
  if (startTime == null || endTime == null) {
    return "Enter valid school start and end times.";
  }
  if (!endTime.isAfter(startTime)) {
    return "School end time must be after school start time.";
  }
  if (startTime.minute() % SLOT_MINUTES !== 0 || endTime.minute() % SLOT_MINUTES !== 0) {
    return "School start and end must align to " + SLOT_MINUTES + "-minute slots (e.g. 08:30, 09:00).";
  }
  if (startTime.plusMinutes(SLOT_MINUTES).compareTo(endTime) > 0) {
    return "School day must be long enough for at least one " + SLOT_MINUTES + "-minute timeslot.";
  }
  return null;
}

/** Validates schoolDay and throws when invalid (used before export/cache/timetable build). */
function validateSchoolDayOrThrow() {
  const error = validateSchoolDay(preparationState.schoolDay);
  if (error) {
    throw new Error(error);
  }
}

/**
 * Normalizes ECA selection from setup/workspace JSON; null means no ECA block.
 */
function normalizeEca(rawEca) {
  if (!rawEca || typeof rawEca !== "object" || !rawEca.dayOfWeek || !rawEca.period) {
    return null;
  }
  const period = String(rawEca.period).toUpperCase();
  if (period !== ECA_PERIOD_AM && period !== ECA_PERIOD_PM) {
    return null;
  }
  return { dayOfWeek: String(rawEca.dayOfWeek), period: period };
}

/**
 * Returns the half-open time window [windowStart, windowEnd) for an ECA selection on one day.
 * AM: school start to 13:00; PM: 13:30 to school end.
 */
function getEcaWindow(eca, schoolDay) {
  if (!eca) {
    return null;
  }
  const dayStart = parsePreparationLocalTime(schoolDay.start);
  const dayEnd = parsePreparationLocalTime(schoolDay.end);
  const lunchStart = JSJoda.LocalTime.of(LUNCH_HARD_START.hour, LUNCH_HARD_START.minute);
  const lunchEnd = lunchStart.plusMinutes(SLOT_MINUTES);
  if (eca.period === ECA_PERIOD_AM) {
    return { dayOfWeek: eca.dayOfWeek, windowStart: dayStart, windowEnd: lunchStart };
  }
  return { dayOfWeek: eca.dayOfWeek, windowStart: lunchEnd, windowEnd: dayEnd };
}

/** True when a timeslot row starts inside the ECA half-day window on the matching weekday. */
function isTimeslotInEcaWindow(timeslot, ecaWindow) {
  if (!ecaWindow || timeslot.dayOfWeek !== ecaWindow.dayOfWeek) {
    return false;
  }
  const slotStart = JSJoda.LocalTime.parse(timeslot.startTime);
  return !slotStart.isBefore(ecaWindow.windowStart) && slotStart.isBefore(ecaWindow.windowEnd);
}

/**
 * Validates ECA against selected weekdays and school hours.
 * Returns an error message string, or null when valid.
 */
function validateEca(eca, weekdays, schoolDay) {
  if (!eca) {
    return null;
  }
  if (!weekdays.includes(eca.dayOfWeek)) {
    return "ECA weekday must be checked in Weekdays (for timeslot grid).";
  }
  const ecaWindow = getEcaWindow(eca, schoolDay);
  if (ecaWindow.windowStart.plusMinutes(SLOT_MINUTES).compareTo(ecaWindow.windowEnd) > 0) {
    return "ECA " + eca.period + " has no timeslot rows in the selected school hours.";
  }
  return null;
}

/** Validates school day and ECA; throws when invalid. */
function validatePreparationMetaOrThrow() {
  validateSchoolDayOrThrow();
  syncPreparationMetaFromForm();
  const ecaError = validateEca(preparationState.eca, preparationState.weekdays, preparationState.schoolDay);
  if (ecaError) {
    throw new Error(ecaError);
  }
}

/** Default lesson duration when creating a subject card (1 hour). */
const DEFAULT_CARD_DURATION_MINUTES = 60;

/** In-memory preparation workspace state. */
let preparationState = createEmptyPreparationState();

/** Next numeric ID for subject cards / lessons (4-digit zero-padded strings). */
let nextCardNumericId = 1;

/**
 * Returns a fresh empty preparation workspace.
 */
function createEmptyPreparationState() {
  return {
    name: "Custom demo data",
    weekdays: ["MONDAY", "TUESDAY"],
    schoolDay: createDefaultSchoolDay(),
    eca: null,
    subjects: [],
    studentGroups: [],
    teachers: [],
    rooms: [],
    cards: [],
    teacherAvailability: {}
  };
}

/**
 * Formats a number as a 4-digit zero-padded string (e.g. 1 -> "0001").
 */
function formatPreparationId(numericId) {
  return String(numericId).padStart(4, "0");
}

/**
 * Shows a Bootstrap alert in the preparation notification panel.
 */
function showPreparationMessage(message, type) {
  const alertType = type || "info";
  $("#preparationNotificationPanel").html(
    $(`<div class="alert alert-${alertType} alert-dismissible fade show" role="alert"/>`)
      .append($("<span/>").text(message))
      .append($('<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"/>'))
  );
}

/**
 * Triggers download of a JSON object as a pretty-printed file.
 */
function downloadJsonFile(jsonObject, filename) {
  const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Reads a user-selected file as parsed JSON.
 */
function readJsonFile(fileInput, onSuccess, onError) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const parsed = JSON.parse(event.target.result);
      onSuccess(parsed);
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        showPreparationMessage("Invalid JSON file: " + error.message, "danger");
      }
    }
    fileInput.value = "";
  };
  reader.onerror = function () {
    showPreparationMessage("Failed to read file.", "danger");
    fileInput.value = "";
  };
  reader.readAsText(file);
}

/**
 * Syncs preparationState from form inputs (name, weekdays, school day bounds).
 */
function syncPreparationMetaFromForm() {
  preparationState.name = $("#preparationNameInput").val().trim() || "Custom demo data";
  preparationState.weekdays = [];
  $(".preparation-weekday:checked").each(function () {
    preparationState.weekdays.push($(this).val());
  });
  if (preparationState.weekdays.length === 0) {
    preparationState.weekdays = ["MONDAY", "TUESDAY"];
  }
  preparationState.schoolDay = {
    start: $("#preparationSchoolStartInput").val() || DEFAULT_SCHOOL_DAY.start,
    end: $("#preparationSchoolEndInput").val() || DEFAULT_SCHOOL_DAY.end
  };
  const ecaValue = $("#preparationEcaSelect").val();
  if (!ecaValue) {
    preparationState.eca = null;
  } else {
    const parts = ecaValue.split("|");
    preparationState.eca = { dayOfWeek: parts[0], period: parts[1] };
  }
}

/**
 * Builds solver Room objects with generated IDs from classroom name list.
 */
function buildRoomsWithIds() {
    return preparationState.rooms.map((room, index) => ({ id: String(index), name: room.name, priority: room.priority || 0 }));
  }

  function getRoomNames() {
    return preparationState.rooms.map(r => r.name);
  }

  function getRoomPriorities() {
    return preparationState.rooms.map(r => r.priority || 0);
  }

/**
 * Maps classroom name to solver room id.
 */
function buildRoomNameToIdMap(roomsWithIds) {
  return new Map(roomsWithIds.map(room => [room.name, room.id]));
}

/**
 * Generates timeslots for selected weekdays and school-day bounds (30-minute slots).
 */
function generateTimeslots(weekdays, schoolDay, eca) {
  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const sortedDays = dayOrder.filter(day => weekdays.includes(day));
  const dayStart = parsePreparationLocalTime(schoolDay.start);
  const dayEnd = parsePreparationLocalTime(schoolDay.end);
  let nextId = 0;
  const timeslots = [];

  for (const dayOfWeek of sortedDays) {
    let slotStart = dayStart;

    while (slotStart.plusMinutes(SLOT_MINUTES).compareTo(dayEnd) <= 0) {
      const slotEnd = slotStart.plusMinutes(SLOT_MINUTES);
      timeslots.push({
        id: String(nextId++),
        dayOfWeek: dayOfWeek,
        startTime: formatLocalTimeForJson(slotStart),
        endTime: formatLocalTimeForJson(slotEnd),
        maxConsecutiveMinutesFromStart: 0
      });
      slotStart = slotEnd;
    }
  }

  computeMaxConsecutiveMinutes(timeslots, eca, schoolDay);
  return timeslots;
}

/**
 * Builds ecaBlocks metadata for Demo UI rendering of the reserved half-day.
 */
function buildEcaBlocksForTimetable(timeslots, eca, schoolDay) {
  if (!eca) {
    return [];
  }
  const ecaWindow = getEcaWindow(eca, schoolDay);
  const matchingSlots = timeslots.filter(slot => isTimeslotInEcaWindow(slot, ecaWindow));
  if (matchingSlots.length === 0) {
    return [];
  }
  return [{
    label: "ECA",
    dayOfWeek: eca.dayOfWeek,
    period: eca.period,
    startTime: formatLocalTimeForJson(ecaWindow.windowStart),
    endTime: formatLocalTimeForJson(ecaWindow.windowEnd),
    timeslotIds: matchingSlots.map(slot => slot.id)
  }];
}

/**
 * Computes maxConsecutiveMinutesFromStart per slot (mirrors TimeslotGenerator.computeMaxConsecutiveMinutes).
 * ECA half-day rows get 0; lessons cannot start in or cross into ECA or hard lunch.
 */
function computeMaxConsecutiveMinutes(timeslots, eca, schoolDay) {
  const ecaWindow = getEcaWindow(eca, schoolDay);
  const byDay = {};
  for (const slot of timeslots) {
    if (!byDay[slot.dayOfWeek]) {
      byDay[slot.dayOfWeek] = [];
    }
    byDay[slot.dayOfWeek].push(slot);
  }

  for (const day of Object.keys(byDay)) {
    const daySlots = byDay[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < daySlots.length; i++) {
      const startSlot = daySlots[i];
      const startTime = JSJoda.LocalTime.parse(startSlot.startTime);
      const lunchStart = JSJoda.LocalTime.of(LUNCH_HARD_START.hour, LUNCH_HARD_START.minute);
      const lunchEnd = lunchStart.plusMinutes(SLOT_MINUTES);

      if (!startTime.isBefore(lunchStart) && startTime.isBefore(lunchEnd)) {
        startSlot.maxConsecutiveMinutesFromStart = 0;
        continue;
      }
      if (isTimeslotInEcaWindow(startSlot, ecaWindow)) {
        startSlot.maxConsecutiveMinutesFromStart = 0;
        continue;
      }

      let consecutiveMinutes = SLOT_MINUTES;
      for (let j = i + 1; j < daySlots.length; j++) {
        const previous = daySlots[j - 1];
        const current = daySlots[j];
        if (previous.endTime !== current.startTime) {
          break;
        }
        const currentStart = JSJoda.LocalTime.parse(current.startTime);
        if (currentStart.equals(lunchStart)) {
          break;
        }
        if (isTimeslotInEcaWindow(current, ecaWindow)) {
          break;
        }
        consecutiveMinutes += SLOT_MINUTES;
      }
      startSlot.maxConsecutiveMinutesFromStart = consecutiveMinutes;
    }
  }
}

/**
 * Builds Demo UI / solver Timetable JSON from current preparation state.
 */
function buildTimetableJson() {
  syncPreparationMetaFromForm();
  validatePreparationMetaOrThrow();
  const timeslots = generateTimeslots(preparationState.weekdays, preparationState.schoolDay, preparationState.eca);
  const ecaBlocks = buildEcaBlocksForTimetable(timeslots, preparationState.eca, preparationState.schoolDay);
  const rooms = buildRoomsWithIds();
  const roomNameToId = buildRoomNameToIdMap(rooms);
  const subjectByName = new Map(preparationState.subjects.map(s => [s.name, s]));

  const lessons = preparationState.cards.map(card => {
    const subject = subjectByName.get(card.subjectName);
    const durationInMinutes = card.durationInMinutes == null ? DEFAULT_CARD_DURATION_MINUTES : card.durationInMinutes;
    const roomNames = card.roomNames && card.roomNames.length > 0
      ? card.roomNames.slice()
      : (subject && subject.rooms ? subject.rooms.slice() : getRoomNames());
    const allowedRoomIds = roomNames
      .map(name => roomNameToId.get(name))
      .filter(id => id != null);

    // Teacher unavailable days come from the per-teacher availability map
    return {
      id: card.id,
      subject: card.subjectName,
      teacher: card.teacher,
      studentGroup: card.studentGroup,
      durationInMinutes: durationInMinutes,
      subjectTypes: (card.subjectTypes || []).slice(),
      teacherUnavailableDays: unavailableDaysForTeacher(card.teacher),
      // Preferred weekdays for the Preferred weekday soft constraint
      preferredWeekdays: normalizePreferredWeekdays(card.preferredWeekdays),
      // Linked subject-card IDs for the Parallel subject soft constraint
      parallelCardIds: normalizeParallelCardIds(card.parallelCardIds || card.parallelSubjects),
      allowedRoomIds: allowedRoomIds,
      timeslot: null,
      room: null
    };
  });

  return {
    name: preparationState.name,
    timeslots: timeslots,
    rooms: rooms,
    lessons: lessons,
    ecaBlocks: ecaBlocks,
    score: null,
    solverStatus: null
  };
}

/**
 * Builds the full preparation workspace JSON (setup + cards + timetable).
 */
function buildWorkspaceJson() {
  syncPreparationMetaFromForm();
  validatePreparationMetaOrThrow();
  // Keep card.teacherUnavailableDays in sync so download/save round-trips availability
  syncAllCardsTeacherAvailability();
  return {
    format: PREPARATION_WORKSPACE_FORMAT,
    name: preparationState.name,
    weekdays: preparationState.weekdays.slice(),
    schoolDay: { start: preparationState.schoolDay.start, end: preparationState.schoolDay.end },
    eca: preparationState.eca ? { dayOfWeek: preparationState.eca.dayOfWeek, period: preparationState.eca.period } : null,
    preparation: {
      subjects: preparationState.subjects.map(cloneSubject),
      studentGroups: preparationState.studentGroups.slice(),
      teachers: preparationState.teachers.slice(),
      // Persist weekday availability so upload/load restores teacher checkboxes
      teacherAvailability: cloneTeacherAvailability(preparationState.teacherAvailability),
      rooms: preparationState.rooms.map(room => ({ name: room.name, priority: room.priority || 0 })),
      cards: preparationState.cards.map(cloneCard)
    },
    timetable: buildTimetableJson()
  };
}

function cloneSubjectForSetupExport(subject) {
  return {
    name: subject.name,
    types: (subject.types || []).slice(),
    studentGroups: (subject.studentGroups || []).slice(),
    teachers: (subject.teachers || []).slice(),
    rooms: (subject.rooms || []).slice()
  };
}

function cloneSubject(subject) {
  return cloneSubjectForSetupExport(subject);
}

function cloneCard(card) {
  return {
    id: card.id,
    subjectName: card.subjectName,
    durationInMinutes: card.durationInMinutes == null ? null : card.durationInMinutes,
    studentGroup: card.studentGroup,
    teacher: card.teacher == null || card.teacher === "" ? null : card.teacher,
    subjectTypes: (card.subjectTypes || []).slice(),
    roomNames: (card.roomNames || []).slice(),
    // Prefer the live teacher map; fall back to the card field for legacy in-memory state
    teacherUnavailableDays: preparationState.teacherAvailability[card.teacher]
      ? unavailableDaysForTeacher(card.teacher)
      : (card.teacherUnavailableDays || []).slice(),
    preferredWeekdays: normalizePreferredWeekdays(card.preferredWeekdays),
    parallelCardIds: normalizeParallelCardIds(card.parallelCardIds || card.parallelSubjects)
  };
}

/**
 * Normalizes room list from setup JSON (strings or legacy {id,name} objects).
 */
function normalizeRooms(rawRooms) {
    return (rawRooms || []).map(room => {
      if (typeof room === "string") {
        return { name: room, priority: 0 };
      } else if (room && typeof room === "object" && room.name != null) {
        return { name: room.name, priority: typeof room.priority === "number" ? room.priority : 0 };
      } else {
        return { name: "", priority: 0 };
      }
    }).filter(r => r.name && r.name !== "").map((r, index) => ({
      id: String(index),
      name: r.name,
      priority: r.priority
    }));
  }

/**
 * Builds id-to-name map when loading legacy workspace/setup with room objects.
 */
function buildLegacyRoomIdToName(rawRooms) {
  const map = new Map();
  for (const room of rawRooms || []) {
    if (room && typeof room === "object" && room.id != null && room.name) {
      map.set(String(room.id), room.name);
    }
  }
  return map;
}

/**
 * Builds legacy subject-id to name map when loading older workspace files.
 */
function buildLegacySubjectIdToName(rawSubjects) {
  const map = new Map();
  for (const subject of rawSubjects || []) {
    if (subject && subject.id != null && subject.name) {
      map.set(String(subject.id), subject.name);
    }
  }
  return map;
}

/**
 * Normalizes subject type tags from setup/workspace JSON (missing values become an empty list).
 */
function normalizeSubjectTypes(rawTypes) {
  if (!rawTypes) {
    return [];
  }
  return [...new Set(rawTypes.map(type => String(type).trim()).filter(type => type))];
}

/**
 * Parses comma-separated subject type tags from the add-subject custom input.
 */
function parseSubjectTypesInput(text) {
  return normalizeSubjectTypes(String(text || "").split(","));
}

/**
 * Renders example subject type checkboxes on the add-subject form (once per page load).
 */
function renderNewSubjectExampleTypeCheckboxes() {
  const $container = $("#newSubjectExampleTypeCheckboxes");
  if ($container.children().length > 0) {
    return;
  }
  for (const subjectType of EXAMPLE_SUBJECT_TYPE_TAGS) {
    const checkboxId = "new_subject_type_" + convertToId(subjectType);
    $container.append(
      $(`<div class="form-check form-check-inline mb-0"/>`)
        .append($(`<input class="form-check-input new-subject-example-type-checkbox" type="checkbox"/>`)
          .prop("id", checkboxId)
          .attr("data-subject-type", subjectType))
        .append($(`<label class="form-check-label"/>`).prop("for", checkboxId).text(subjectType))
    );
  }
}

/** Reads selected example + custom subject type tags from the add-subject form. */
function getSubjectTypesFromAddForm() {
  const selectedTypes = [];
  $("#newSubjectExampleTypeCheckboxes .new-subject-example-type-checkbox:checked").each(function () {
    selectedTypes.push($(this).attr("data-subject-type"));
  });
  const customTypes = parseSubjectTypesInput($("#newSubjectCustomTypesInput").val());
  return normalizeSubjectTypes(selectedTypes.concat(customTypes));
}

/** Clears example checkboxes and the custom type input after a subject is added. */
function clearNewSubjectTypeForm() {
  $("#newSubjectExampleTypeCheckboxes .new-subject-example-type-checkbox").prop("checked", false);
  $("#newSubjectCustomTypesInput").val("");
}

/** Formats subject type tags for list/table display. */
function formatSubjectTypesLabel(subjectTypes) {
  const types = subjectTypes || [];
  return types.length === 0 ? "(none)" : types.join(", ");
}

/**
 * Keeps card subject types valid against the card's subject definition.
 * When the subject defines types, the card must use a subset of those tags.
 * When the subject defines none, the card may carry its own type tags.
 */
function sanitizeCardSubjectTypes(card) {
  const subject = preparationState.subjects.find(item => item.name === card.subjectName);
  const subjectDefinedTypes = subject ? (subject.types || []) : [];
  if (subjectDefinedTypes.length === 0) {
    card.subjectTypes = normalizeSubjectTypes(card.subjectTypes);
    return;
  }
  const allowedTypes = new Set(subjectDefinedTypes);
  card.subjectTypes = (card.subjectTypes || []).filter(type => allowedTypes.has(type));
}

/** Sanitizes subject type selections on every card against current subject definitions. */
function sanitizeAllCardSubjectTypes() {
  for (const card of preparationState.cards) {
    sanitizeCardSubjectTypes(card);
  }
}

/**
 * Reads subject type tags from the card form.
 * Uses subject-defined checkboxes when available; otherwise example tags plus custom input.
 */
function getSelectedCardSubjectTypesFromForm() {
  const selectedTypes = [];
  $("#cardSubjectTypeCheckboxes .card-subject-type-checkbox:checked").each(function () {
    selectedTypes.push($(this).attr("data-subject-type"));
  });
  const subjectName = $("#cardSubjectSelect").val();
  const subject = preparationState.subjects.find(item => item.name === subjectName);
  const subjectDefinedTypes = subject ? (subject.types || []) : [];
  if (subjectDefinedTypes.length === 0) {
    const customTypes = parseSubjectTypesInput($("#cardSubjectCustomTypesInput").val());
    return normalizeSubjectTypes(selectedTypes.concat(customTypes));
  }
  return normalizeSubjectTypes(selectedTypes);
}

/**
 * Normalizes one subject from setup/workspace JSON (name-only, no unique id).
 */
function normalizeSubject(raw, legacyRoomIdToName) {
  const roomNames = [];
  for (const room of raw.rooms || []) {
    roomNames.push(typeof room === "string" ? room : room.name);
  }
  for (const roomId of raw.roomIds || []) {
    if (legacyRoomIdToName && legacyRoomIdToName.has(String(roomId))) {
      roomNames.push(legacyRoomIdToName.get(String(roomId)));
    }
  }
  return {
    name: raw.name,
    types: normalizeSubjectTypes(raw.types),
    studentGroups: (raw.studentGroups || []).slice(),
    teachers: (raw.teachers || []).slice(),
    rooms: [...new Set(roomNames.filter(name => name))]
  };
}

/**
 * Builds subject-name to duration map from legacy setup where duration lived on subjects.
 */
function buildLegacySubjectDurationByName(rawSubjects) {
  const map = new Map();
  for (const subject of rawSubjects || []) {
    if (subject && subject.name != null && subject.durationInMinutes != null) {
      map.set(subject.name, subject.durationInMinutes);
    }
  }
  return map;
}

/**
 * Normalizes one subject card from workspace JSON.
 */
function normalizeCard(raw, legacyRoomIdToName, legacySubjectIdToName, legacySubjectDurationByName) {
  const subjectName = raw.subjectName
    || (legacySubjectIdToName && raw.subjectId != null ? legacySubjectIdToName.get(String(raw.subjectId)) : null)
    || raw.subjectId
    || "Unknown";
  const roomNames = [];
  for (const room of raw.roomNames || []) {
    roomNames.push(typeof room === "string" ? room : room.name);
  }
  for (const roomId of raw.roomIds || []) {
    if (legacyRoomIdToName && legacyRoomIdToName.has(String(roomId))) {
      roomNames.push(legacyRoomIdToName.get(String(roomId)));
    }
  }
  const durationInMinutes = raw.durationInMinutes != null
    ? raw.durationInMinutes
    : (legacySubjectDurationByName && legacySubjectDurationByName.has(subjectName)
      ? legacySubjectDurationByName.get(subjectName)
      : null);
  return {
    id: raw.id,
    subjectName: subjectName,
    durationInMinutes: durationInMinutes,
    studentGroup: raw.studentGroup,
    teacher: raw.teacher == null || raw.teacher === "" ? null : raw.teacher,
    subjectTypes: normalizeSubjectTypes(raw.subjectTypes),
    roomNames: [...new Set(roomNames.filter(name => name))],
    teacherUnavailableDays: (raw.teacherUnavailableDays || []).map(day => String(day).trim()).filter(day => day),
    // Missing preferredWeekdays on legacy cards → available all weekdays
    preferredWeekdays: normalizePreferredWeekdays(raw.preferredWeekdays),
    // Missing parallelCardIds on legacy cards → no parallel pairing
    parallelCardIds: normalizeParallelCardIds(raw.parallelCardIds || raw.parallelSubjects)
  };
}

/**
 * Recomputes next card ID counter from loaded state.
 */
function recomputeIdCounters() {
  let maxCard = 0;
  for (const card of preparationState.cards) {
    const n = parseInt(card.id, 10);
    if (!isNaN(n) && n > maxCard) {
      maxCard = n;
    }
  }
  nextCardNumericId = maxCard + 1;
}

/**
 * Applies full workspace JSON to preparation state.
 */
function applyWorkspaceJson(workspaceJson) {
  if (workspaceJson.format !== PREPARATION_WORKSPACE_FORMAT) {
    throw new Error("Expected format " + PREPARATION_WORKSPACE_FORMAT + ", got " + workspaceJson.format);
  }
  const prep = workspaceJson.preparation || {};
  const legacyRoomIdToName = buildLegacyRoomIdToName(prep.rooms);
  const legacySubjectIdToName = buildLegacySubjectIdToName(prep.subjects);
  const legacySubjectDurationByName = buildLegacySubjectDurationByName(prep.subjects);
  preparationState.name = workspaceJson.name || "Custom demo data";
  preparationState.weekdays = (workspaceJson.weekdays || ["MONDAY", "TUESDAY"]).slice();
  preparationState.schoolDay = normalizeSchoolDay(workspaceJson.schoolDay);
  preparationState.eca = normalizeEca(workspaceJson.eca);
  preparationState.rooms = normalizeRooms(prep.rooms);
  preparationState.subjects = (prep.subjects || []).map(subject => normalizeSubject(subject, legacyRoomIdToName));
  preparationState.studentGroups = (prep.studentGroups || []).slice();
  preparationState.teachers = (prep.teachers || []).slice();
  preparationState.cards = (prep.cards || []).map(card => normalizeCard(
    card, legacyRoomIdToName, legacySubjectIdToName, legacySubjectDurationByName));

  // Restore weekday checkboxes from the persisted map; fall back to cards/lessons
  restoreTeacherAvailabilityFromWorkspace(workspaceJson, preparationState.cards);
  // Mirror the restored map onto cards so later exports stay consistent
  syncAllCardsTeacherAvailability();

  sanitizeAllCardSubjectTypes();
  recomputeIdCounters();
  renderPreparationUi();
}

/**
 * Restores teacher weekday availability after workspace load.
 * Prefers the persisted map; older files reconstruct it from cards and timetable lessons.
 */
function restoreTeacherAvailabilityFromWorkspace(workspaceJson, cards) {
  const prep = (workspaceJson && workspaceJson.preparation) || {};
  if (hasPersistedTeacherAvailability(prep.teacherAvailability)) {
    preparationState.teacherAvailability = buildTeacherAvailabilityMap(
      preparationState.teachers, prep.teacherAvailability);
    return;
  }
  const lessons = (workspaceJson && workspaceJson.timetable && workspaceJson.timetable.lessons) || [];
  // Union cards + lessons so older downloads (map missing, cards empty, lessons populated) recover
  preparationState.teacherAvailability = deriveTeacherAvailabilityFromLessonList(
    preparationState.teachers, (cards || []).concat(lessons));
}

/**
 * Derives teacher availability from loaded cards.
 * For each teacher, collects all unavailable days from their lessons.
 * If a teacher has no lessons with unavailable days, they are available all days.
 */
function deriveTeacherAvailabilityFromCards() {
  preparationState.teacherAvailability = deriveTeacherAvailabilityFromLessonList(
    preparationState.teachers, preparationState.cards);
}

/**
 * Saves full workspace to localStorage (browser cache).
 */
function savePreparationToCache() {
  try {
    const workspace = buildWorkspaceJson();
    localStorage.setItem(PREPARATION_CACHE_KEY, JSON.stringify(workspace));
    showPreparationMessage("Workspace saved to browser cache.", "success");
  } catch (error) {
    showPreparationMessage("Failed to save to cache: " + error.message, "danger");
  }
}

/**
 * Loads full workspace from localStorage; returns parsed object or null.
 */
function loadPreparationFromCacheObject() {
  const raw = localStorage.getItem(PREPARATION_CACHE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

/** Mon–Fri order used when inferring weekdays from demo timetable timeslots. */
const DEMO_WEEKDAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

/**
 * Extracts active weekdays from demo timetable timeslots in Mon–Fri order.
 */
function extractWeekdaysFromDemoTimeslots(timeslots) {
  const activeDays = new Set();
  for (const slot of timeslots || []) {
    if (slot.dayOfWeek) {
      activeDays.add(slot.dayOfWeek);
    }
  }
  return DEMO_WEEKDAY_ORDER.filter(day => activeDays.has(day));
}

/**
 * Infers school-day bounds from demo timetable timeslots (falls back to defaults when empty).
 */
function extractSchoolDayFromDemoTimeslots(timeslots) {
  let minStart = null;
  let maxEnd = null;
  for (const slot of timeslots || []) {
    const startTime = parsePreparationLocalTime(slot.startTime);
    const endTime = parsePreparationLocalTime(slot.endTime);
    if (startTime != null && (minStart == null || startTime.isBefore(minStart))) {
      minStart = startTime;
    }
    if (endTime != null && (maxEnd == null || endTime.isAfter(maxEnd))) {
      maxEnd = endTime;
    }
  }
  if (minStart == null || maxEnd == null) {
    return createDefaultSchoolDay();
  }
  const timeLabelFormatter = JSJoda.DateTimeFormatter.ofPattern("HH:mm");
  return {
    start: minStart.format(timeLabelFormatter),
    end: maxEnd.format(timeLabelFormatter)
  };
}

/**
 * Builds preparation subject definitions by aggregating demo lesson metadata per subject name.
 */
function buildPreparationSubjectsFromDemoLessons(lessons, roomNames) {
  const subjectMap = new Map();
  for (const lesson of lessons || []) {
    const subjectName = lesson.subject;
    if (!subjectName) {
      continue;
    }
    if (!subjectMap.has(subjectName)) {
      subjectMap.set(subjectName, {
        name: subjectName,
        types: new Set(),
        studentGroups: new Set(),
        teachers: new Set(),
        rooms: new Set(roomNames)
      });
    }
    const subject = subjectMap.get(subjectName);
    if (lesson.studentGroup) {
      subject.studentGroups.add(lesson.studentGroup);
    }
    if (lesson.teacher) {
      subject.teachers.add(lesson.teacher);
    }
    for (const subjectType of lesson.subjectTypes || []) {
      subject.types.add(String(subjectType).trim());
    }
  }
  return [...subjectMap.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(subject => ({
      name: subject.name,
      types: normalizeSubjectTypes([...subject.types]),
      studentGroups: [...subject.studentGroups].sort(),
      teachers: [...subject.teachers].sort(),
      rooms: [...subject.rooms].sort()
    }));
}

/**
 * Resolves eligible classroom names for one lesson/card.
 * Uses allowedRoomIds when present; otherwise falls back to every room name.
 */
function resolveCardRoomNamesFromLesson(lesson, rooms, fallbackRoomNames) {
  const roomById = new Map();
  for (const room of rooms || []) {
    if (room && room.id != null) {
      roomById.set(String(room.id), room.name || String(room.id));
    }
  }
  const allowedIds = lesson.allowedRoomIds || [];
  if (allowedIds.length === 0) {
    return fallbackRoomNames.slice();
  }
  const names = [];
  for (const roomId of allowedIds) {
    const name = roomById.get(String(roomId));
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names.length > 0 ? names : fallbackRoomNames.slice();
}

/**
 * Builds preparation subject cards from demo timetable lessons (one card per lesson).
 */
function buildPreparationCardsFromDemoLessons(lessons, roomNames, rooms) {
  return (lessons || []).map(lesson => ({
    id: lesson.id,
    subjectName: lesson.subject,
    durationInMinutes: lesson.durationInMinutes != null
      ? lesson.durationInMinutes
      : DEFAULT_CARD_DURATION_MINUTES,
    studentGroup: lesson.studentGroup,
    teacher: lesson.teacher == null || lesson.teacher === "" ? null : lesson.teacher,
    subjectTypes: normalizeSubjectTypes(lesson.subjectTypes),
    roomNames: resolveCardRoomNamesFromLesson(lesson, rooms, roomNames),
    teacherUnavailableDays: (lesson.teacherUnavailableDays || []).map(day => String(day).trim()).filter(day => day),
    preferredWeekdays: normalizePreferredWeekdays(lesson.preferredWeekdays),
    parallelCardIds: normalizeParallelCardIds(lesson.parallelCardIds || lesson.parallelSubjects)
  }));
}

/** Reads ECA day/period from timetable ecaBlocks metadata when present. */
function extractEcaFromTimetable(timetable) {
  const block = (timetable && timetable.ecaBlocks ? timetable.ecaBlocks : [])[0];
  if (!block || !block.dayOfWeek || !block.period) {
    return null;
  }
  return { dayOfWeek: block.dayOfWeek, period: block.period };
}

/**
 * Builds a Preparation workspace JSON from an AI Scheduler timetable
 * so edited subject cards can be loaded back on the Preparation tab.
 */
function buildWorkspaceJsonFromTimetable(timetable) {
  if (timetable == null || timetable.lessons == null || timetable.rooms == null) {
    throw new Error("No timetable with subject cards is loaded.");
  }
  const rooms = normalizeRooms(timetable.rooms);
  const roomNames = rooms.map(room => room.name);
  const weekdays = extractWeekdaysFromDemoTimeslots(timetable.timeslots);
  const schoolDay = extractSchoolDayFromDemoTimeslots(timetable.timeslots);
  const lessons = timetable.lessons || [];
  const eca = extractEcaFromTimetable(timetable);
  const workspaceName = timetable.name || "Subject cards from AI Scheduler";
  const teachers = [...new Set(lessons.map(lesson => lesson.teacher).filter(Boolean))].sort();
  const cards = buildPreparationCardsFromDemoLessons(lessons, roomNames, timetable.rooms);
  return {
    format: PREPARATION_WORKSPACE_FORMAT,
    name: workspaceName,
    weekdays: weekdays.length > 0 ? weekdays : ["MONDAY", "TUESDAY"],
    schoolDay: { start: schoolDay.start, end: schoolDay.end },
    eca: eca,
    preparation: {
      subjects: buildPreparationSubjectsFromDemoLessons(lessons, roomNames),
      studentGroups: [...new Set(lessons.map(lesson => lesson.studentGroup).filter(Boolean))].sort(),
      teachers: teachers,
      // Rebuild the weekday map from lessons so Preparation checkboxes survive this export
      teacherAvailability: deriveTeacherAvailabilityFromLessonList(teachers, lessons),
      rooms: rooms.map(room => ({ name: room.name, priority: room.priority || 0 })),
      cards: cards
    },
    // Keep the original timetable payload so AI Scheduler can load this file back.
    timetable: {
      name: workspaceName,
      timeslots: (timetable.timeslots || []).slice(),
      rooms: (timetable.rooms || []).slice(),
      lessons: (timetable.lessons || []).slice(),
      ecaBlocks: (timetable.ecaBlocks || []).slice(),
      score: timetable.score == null ? null : timetable.score,
      solverStatus: timetable.solverStatus == null ? null : timetable.solverStatus
    }
  };
}

/**
 * Writes a timetable as Preparation cache and refreshes the Preparation tab.
 * Returns the workspace JSON that was saved.
 */
function saveWorkspaceFromTimetableToCache(timetable) {
  const workspace = buildWorkspaceJsonFromTimetable(timetable);
  localStorage.setItem(PREPARATION_CACHE_KEY, JSON.stringify(workspace));
  applyWorkspaceJson(workspace);
  return workspace;
}

/**
 * Converts a demo timetable (dataset1/dataset2) into preparation workspace state and renders it.
 */
function applyDemoTimetableToPreparation(timetable, demoDataId) {
  const rooms = normalizeRooms(timetable.rooms);
  const roomNames = rooms.map(room => room.name);
  const weekdays = extractWeekdaysFromDemoTimeslots(timetable.timeslots);
  const schoolDay = extractSchoolDayFromDemoTimeslots(timetable.timeslots);
  const lessons = timetable.lessons || [];

  preparationState.name = timetable.name || demoDataId;
  preparationState.weekdays = weekdays.length > 0 ? weekdays : ["MONDAY", "TUESDAY"];
  preparationState.schoolDay = schoolDay;
  preparationState.eca = null;
  preparationState.rooms = rooms;
  preparationState.subjects = buildPreparationSubjectsFromDemoLessons(lessons, roomNames);
  preparationState.studentGroups = [...new Set(lessons.map(lesson => lesson.studentGroup).filter(Boolean))].sort();
  preparationState.teachers = [...new Set(lessons.map(lesson => lesson.teacher).filter(Boolean))].sort();
  preparationState.cards = buildPreparationCardsFromDemoLessons(lessons, roomNames, rooms);
  // Rebuild weekday checkboxes from lesson.teacherUnavailableDays instead of defaulting to all days
  deriveTeacherAvailabilityFromCards();
  sanitizeAllCardSubjectTypes();
  recomputeIdCounters();
  renderPreparationUi();
}

/**
 * Fetches dataset1/dataset2 from the demo-data API and loads it into the Preparation UI.
 */
function loadDemoDatasetIntoPreparation(demoDataId) {
  $.getJSON("/demo-data/" + demoDataId)
    .done(function (timetable) {
      try {
        applyDemoTimetableToPreparation(timetable, demoDataId);
        showPreparationMessage("Sample data \"" + demoDataId + "\" loaded into Preparation.", "success");
      } catch (error) {
        showPreparationMessage("Failed to apply sample data: " + error.message, "danger");
      }
    })
    .fail(function () {
      showPreparationMessage("Failed to fetch sample data \"" + demoDataId + "\".", "danger");
    });
}

/**
 * Clears localStorage cache and resets in-memory preparation state to empty defaults.
 */
function clearPreparationCacheAndReset() {
  if (!window.confirm("Clear browser cache and reset all preparation data?")) {
    return;
  }
  localStorage.removeItem(PREPARATION_CACHE_KEY);
  preparationState = createEmptyPreparationState();
  nextCardNumericId = 1;
  editingCardId = null;
  renderPreparationUi();
  showPreparationMessage("Browser cache cleared and preparation workspace reset.", "success");
}

/**
 * Renders all preparation UI lists, selects, and tables from preparationState.
 */
function renderPreparationUi() {
  $("#preparationNameInput").val(preparationState.name);
  $(".preparation-weekday").each(function () {
    $(this).prop("checked", preparationState.weekdays.includes($(this).val()));
  });
  if (!preparationState.schoolDay) {
    preparationState.schoolDay = createDefaultSchoolDay();
  }
  $("#preparationSchoolStartInput").val(preparationState.schoolDay.start || DEFAULT_SCHOOL_DAY.start);
  $("#preparationSchoolEndInput").val(preparationState.schoolDay.end || DEFAULT_SCHOOL_DAY.end);
  const ecaSelectValue = preparationState.eca
    ? preparationState.eca.dayOfWeek + "|" + preparationState.eca.period
    : "";
  $("#preparationEcaSelect").val(ecaSelectValue);

  renderSubjectList();
  renderRoomList();
  renderTeacherList();
  renderStudentGroupList();
  renderAssignmentPanel();
  renderCardFormSelects();
  renderCardTable();
}

function renderSubjectList() {
  const $list = $("#subjectList").empty();
  for (const subject of preparationState.subjects) {
    const typeLabel = (subject.types || []).length > 0
      ? " [" + subject.types.join(", ") + "]"
      : "";
    $list.append(
      $(`<li class="list-group-item d-flex justify-content-between align-items-center px-0"/>`)
        .append($("<span/>").text(subject.name + typeLabel))
        .append(
          $(`<button type="button" class="btn btn-outline-danger btn-sm py-0"/>`)
            .text("Remove")
            .on("click", () => removeSubject(subject.name))
        )
    );
  }
}

function renderRoomList() {
    const $tbody = $("#roomTableBody").empty();
    for (const room of preparationState.rooms) {
      $tbody.append(
        $("<tr/>").append(
          $("<td/>").append(
            $(`<input type="text" class="form-control form-control-sm room-name-input"/>`)
              .val(room.name)
              .on("change", (e) => {
                room.name = e.target.value;
                renderRoomList();
              })
          )
        ).append(
          $("<td/>").append(
            $(`<input type="number" class="form-control form-control-sm room-priority-input"/>`)
              .val(room.priority)
              .attr("min", "-9999")
              .attr("max", "9999")
              .on("change", (e) => {
                room.priority = parseInt(e.target.value) || 0;
                refreshPreparationUi();
              })
          )
        ).append(
          $("<td/>").append(
            $(`<button type="button" class="btn btn-outline-danger btn-sm py-0"/>`)
              .text("Remove")
              .on("click", () => removeRoom(room.name))
          )
        )
      );
    }
  }

function renderTeacherList() {
  const $tbody = $("#teacherListBody").empty();
  for (const teacher of preparationState.teachers) {
    const availableDays = preparationState.teacherAvailability[teacher] || TEACHER_AVAILABILITY_DAYS.slice();
    const row = $("<tr/>")
      .append($("<td/>").text(teacher))
      .append($("<td/>").append(createDayCheckbox("teacher", teacher, "MONDAY", availableDays.includes("MONDAY"))))
      .append($("<td/>").append(createDayCheckbox("teacher", teacher, "TUESDAY", availableDays.includes("TUESDAY"))))
      .append($("<td/>").append(createDayCheckbox("teacher", teacher, "WEDNESDAY", availableDays.includes("WEDNESDAY"))))
      .append($("<td/>").append(createDayCheckbox("teacher", teacher, "THURSDAY", availableDays.includes("THURSDAY"))))
      .append($("<td/>").append(createDayCheckbox("teacher", teacher, "FRIDAY", availableDays.includes("FRIDAY"))))
      .append($("<td/>").append(
        $("<button type=\"button\" class=\"btn btn-outline-danger btn-sm py-0\"/>")
          .text("Remove")
          .on("click", () => removeTeacher(teacher))
      ));
    $tbody.append(row);
  }
}

function createDayCheckbox(teacherKey, teacherName, dayOfWeek, isChecked) {
  const checkboxId = "teacher_" + convertToId(teacherKey + teacherName + dayOfWeek);
  return $("<input type='checkbox' class='form-check-input teacher-availability-checkbox'/>")
    .prop("id", checkboxId)
    .prop("checked", isChecked)
    .attr("data-teacher-name", teacherName)
    .attr("data-day-of-week", dayOfWeek)
    .on("change", function () {
      const teacherName = $(this).attr("data-teacher-name");
      const dayOfWeek = $(this).attr("data-day-of-week");
      const isAvailable = $(this).prop("checked");
      
      // Update teacherAvailability map
      if (!preparationState.teacherAvailability[teacherName]) {
        preparationState.teacherAvailability[teacherName] = TEACHER_AVAILABILITY_DAYS.slice();
      }
      
      if (isAvailable) {
        if (!preparationState.teacherAvailability[teacherName].includes(dayOfWeek)) {
          preparationState.teacherAvailability[teacherName].push(dayOfWeek);
        }
      } else {
        preparationState.teacherAvailability[teacherName] = preparationState.teacherAvailability[teacherName]
          .filter(d => d !== dayOfWeek);
      }
      
      // Update all cards for this teacher to reflect the new availability
      updateCardsForTeacherAvailability(teacherName);
    });
}

/**
 * Updates all cards for a teacher to reflect their current availability.
 * Sets teacherUnavailableDays based on the teacher's available days.
 */
function updateCardsForTeacherAvailability(teacherName) {
  const availableDays = preparationState.teacherAvailability[teacherName] || TEACHER_AVAILABILITY_DAYS.slice();
  const unavailableDays = TEACHER_AVAILABILITY_DAYS.filter(day => !availableDays.includes(day));
  
  for (const card of preparationState.cards) {
    if (card.teacher === teacherName) {
      card.teacherUnavailableDays = unavailableDays.slice();
    }
  }
}

/**
 * Creates a Mon–Fri checkbox for a subject card's preferred weekday.
 * Toggles update card.preferredWeekdays immediately for the soft constraint.
 */
function createCardPreferredWeekdayCheckbox(cardId, dayOfWeek, isChecked) {
  const checkboxId = "card_weekday_" + convertToId(cardId + dayOfWeek);
  return $("<input type='checkbox' class='form-check-input card-preferred-weekday-checkbox'/>")
    .prop("id", checkboxId)
    .prop("checked", isChecked)
    .attr("data-card-id", cardId)
    .attr("data-day-of-week", dayOfWeek)
    .attr("title", dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase())
    .on("change", function () {
      const targetCardId = $(this).attr("data-card-id");
      const targetDay = $(this).attr("data-day-of-week");
      const isPreferred = $(this).prop("checked");
      const card = preparationState.cards.find(c => c.id === targetCardId);
      if (!card) {
        return;
      }
      if (!card.preferredWeekdays) {
        card.preferredWeekdays = defaultPreferredWeekdays();
      }
      if (isPreferred) {
        if (!card.preferredWeekdays.includes(targetDay)) {
          card.preferredWeekdays.push(targetDay);
        }
      } else {
        card.preferredWeekdays = card.preferredWeekdays.filter(day => day !== targetDay);
      }
    });
}

/**
 * Adds a two-way parallel link between two subject cards, then refreshes both cells.
 */
function addParallelCardLink(cardId, partnerCardId) {
  if (!cardId || !partnerCardId || cardId === partnerCardId) {
    return;
  }
  const card = preparationState.cards.find(c => c.id === cardId);
  const partner = preparationState.cards.find(c => c.id === partnerCardId);
  if (!card || !partner) {
    return;
  }
  addParallelCardId(card, partnerCardId);
  addParallelCardId(partner, cardId);
  refreshCardParallelSubjectCell(cardId);
  refreshCardParallelSubjectCell(partnerCardId);
}

/**
 * Removes a two-way parallel link between two subject cards, then refreshes both cells.
 */
function removeParallelCardLink(cardId, partnerCardId) {
  const card = preparationState.cards.find(c => c.id === cardId);
  if (card) {
    card.parallelCardIds = (card.parallelCardIds || []).filter(id => id !== partnerCardId);
  }
  const partner = preparationState.cards.find(c => c.id === partnerCardId);
  if (partner) {
    partner.parallelCardIds = (partner.parallelCardIds || []).filter(id => id !== cardId);
  }
  refreshCardParallelSubjectCell(cardId);
  refreshCardParallelSubjectCell(partnerCardId);
}

/** Appends a partner card ID to a card's parallel list if missing. */
function addParallelCardId(card, partnerCardId) {
  if (!card.parallelCardIds) {
    card.parallelCardIds = [];
  }
  if (!card.parallelCardIds.includes(partnerCardId)) {
    card.parallelCardIds.push(partnerCardId);
  }
}

/** Drops removed card IDs from every remaining card's parallel list. */
function unlinkRemovedCardIds(removedIds) {
  const removed = new Set(removedIds || []);
  for (const card of preparationState.cards) {
    card.parallelCardIds = (card.parallelCardIds || []).filter(id => !removed.has(id));
  }
}

/** Replaces the Parallel Subject cell for one card without rebuilding the whole table. */
function refreshCardParallelSubjectCell(cardId) {
  const card = preparationState.cards.find(c => c.id === cardId);
  const $row = $(`#cardTableBody tr[data-card-id="${cardId}"]`);
  if (!card || $row.length === 0) {
    return;
  }
  $row.find("td.card-parallel-subject-cell").replaceWith(createCardParallelSubjectCell(card));
}

/** Dropdown/chip label: Card ID, with subject for identification. */
function formatParallelCardOptionLabel(targetCard) {
  const subjectLabel = targetCard.subjectName ? " — " + targetCard.subjectName : "";
  return targetCard.id + subjectLabel;
}

/**
 * Builds a compact Parallel Subject cell: selected Card IDs as chips plus an Add dropdown.
 */
function createCardParallelSubjectCell(card) {
  const $cell = $("<td class='card-parallel-subject-cell'/>");
  const selectedIds = card.parallelCardIds || [];
  const otherCards = preparationState.cards
    .filter(other => other.id !== card.id)
    .slice()
    .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }));
  const remainingCards = otherCards.filter(other => !selectedIds.includes(other.id));

  const $chips = $("<div class='card-parallel-subject-chips'/>");
  if (selectedIds.length === 0) {
    $chips.append($("<span class='text-muted small'/>").text("None"));
  } else {
    for (const partnerId of selectedIds) {
      const partner = preparationState.cards.find(other => other.id === partnerId);
      const chipLabel = partner ? partner.id : partnerId;
      const chipTitle = partner ? formatParallelCardOptionLabel(partner) : partnerId;
      $chips.append(
        $("<span class='badge rounded-pill bg-info text-dark card-parallel-subject-chip'/>")
          .append($("<span class='card-parallel-subject-chip-label'/>").text(chipLabel).attr("title", chipTitle))
          .append(
            $("<button type='button' class='card-parallel-subject-chip-remove' aria-label='Remove'/>")
              .html("&times;")
              .on("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                removeParallelCardLink(card.id, partnerId);
              })
          )
      );
    }
  }
  $cell.append($chips);

  const placeholder = otherCards.length === 0
    ? "No other cards"
    : (remainingCards.length === 0 ? "All added" : "Add Card ID…");
  const $select = $("<select class='form-select form-select-sm card-parallel-subject-add'/>")
    .append($("<option/>").val("").text(placeholder));
  for (const other of remainingCards) {
    $select.append($("<option/>").val(other.id).text(formatParallelCardOptionLabel(other)));
  }
  $select.prop("disabled", remainingCards.length === 0);
  $select.on("change", function () {
    const partnerId = $(this).val();
    if (!partnerId) {
      return;
    }
    addParallelCardLink(card.id, partnerId);
  });
  $cell.append($select);
  return $cell;
}

function renderStudentGroupList() {
  const $list = $("#studentGroupList").empty();
  for (const group of preparationState.studentGroups) {
    $list.append(
      $(`<li class="list-group-item d-flex justify-content-between align-items-center px-0"/>`)
        .append($("<span/>").text(group))
        .append(
          $(`<button type="button" class="btn btn-outline-danger btn-sm py-0"/>`)
            .text("Remove")
            .on("click", () => removeStudentGroup(group))
        )
    );
  }
}

/** Card ID being edited in the subject card form, or null when creating a new card. */
let editingCardId = null;

/** Selected resource in each assignment column (group / teacher / classroom). */
let selectedAssignmentStudentGroup = null;
let selectedAssignmentTeacher = null;
let selectedAssignmentRoom = null;

/**
 * Keeps assignment list selections valid after resources are added or removed.
 */
function ensureAssignmentSelections() {
  if (!selectedAssignmentStudentGroup || !preparationState.studentGroups.includes(selectedAssignmentStudentGroup)) {
    selectedAssignmentStudentGroup = preparationState.studentGroups.length > 0
      ? preparationState.studentGroups[0]
      : null;
  }
  if (!selectedAssignmentTeacher || !preparationState.teachers.includes(selectedAssignmentTeacher)) {
    selectedAssignmentTeacher = preparationState.teachers.length > 0
      ? preparationState.teachers[0]
      : null;
  }
if (!selectedAssignmentRoom || !preparationState.rooms.some(r => r.name === selectedAssignmentRoom)) {
      selectedAssignmentRoom = preparationState.rooms.length > 0
        ? preparationState.rooms[0].name
        : null;
    }
}

/**
 * Renders a selectable list of groups, teachers, or classrooms for assignment mapping.
 */
function renderAssignmentEntityList(containerSelector, items, selectedItem, onSelect) {
  const $container = $(containerSelector).empty();
  if (items.length === 0) {
    $container.append($(`<div class="list-group-item text-muted small py-2"/>`).text("None defined yet."));
    return;
  }
  for (const item of items) {
    $container.append(
      $(`<button type="button" class="list-group-item list-group-item-action py-2"/>`)
        .toggleClass("active", item === selectedItem)
        .text(item)
        .on("click", () => onSelect(item))
    );
  }
}

/**
 * Renders subject checkboxes for the currently selected group, teacher, or classroom.
 */
function renderSubjectCheckboxesForAssignment(containerSelector, entityLabel, isSubjectChecked, onSubjectToggle) {
  const $container = $(containerSelector).empty();
  if (!entityLabel) {
    $container.append($(`<span class="text-muted small"/>`).text("No resource selected."));
    return;
  }
  if (preparationState.subjects.length === 0) {
    $container.append($(`<span class="text-muted small"/>`).text("Add subjects first."));
    return;
  }
  for (const subject of preparationState.subjects) {
    const checkboxId = "assign_subj_" + convertToId(containerSelector + subject.name);
    const checked = isSubjectChecked(subject);
    $container.append(
      $(`<div class="form-check"/>`)
        .append(
          $(`<input class="form-check-input assignment-subject-checkbox" type="checkbox"/>`)
            .prop("id", checkboxId)
            .prop("checked", checked)
            .attr("data-subject-name", subject.name)
        )
        .append(
          $(`<label class="form-check-label"/>`)
            .prop("for", checkboxId)
            .text(subject.name)
        )
    );
  }
  $container.find(".assignment-subject-checkbox").off("change").on("change", function () {
    const subjectName = $(this).attr("data-subject-name");
    onSubjectToggle(subjectName, $(this).is(":checked"));
    renderCardFormSelects();
  });
}

/**
 * Assigns or unassigns a subject to/from a student group in the underlying subject model.
 */
function setSubjectForStudentGroup(subjectName, groupName, assigned) {
  const subject = preparationState.subjects.find(s => s.name === subjectName);
  if (!subject) {
    return;
  }
  const groups = new Set(subject.studentGroups || []);
  if (assigned) {
    groups.add(groupName);
  } else {
    groups.delete(groupName);
  }
  subject.studentGroups = [...groups];
}

/**
 * Assigns or unassigns a subject to/from a teacher in the underlying subject model.
 */
function setSubjectForTeacher(subjectName, teacherName, assigned) {
  const subject = preparationState.subjects.find(s => s.name === subjectName);
  if (!subject) {
    return;
  }
  const teachers = new Set(subject.teachers || []);
  if (assigned) {
    teachers.add(teacherName);
  } else {
    teachers.delete(teacherName);
  }
  subject.teachers = [...teachers];
}

/**
 * Assigns or unassigns a subject to/from a classroom in the underlying subject model.
 */
function setSubjectForRoom(subjectName, roomName, assigned) {
  const subject = preparationState.subjects.find(s => s.name === subjectName);
  if (!subject) {
    return;
  }
  const rooms = new Set(subject.rooms || []);
  if (assigned) {
    rooms.add(roomName);
  } else {
    rooms.delete(roomName);
  }
  subject.rooms = [...rooms];
}

/**
 * Assigns every subject to the selected student group.
 */
function assignAllSubjectsToSelectedStudentGroup() {
  const group = selectedAssignmentStudentGroup;
  if (!group) {
    showPreparationMessage("Select a student group first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForStudentGroup(subject.name, group, true);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects applied to " + group + ".", "success");
}

/**
 * Clears every subject from the selected student group.
 */
function clearAllSubjectsFromSelectedStudentGroup() {
  const group = selectedAssignmentStudentGroup;
  if (!group) {
    showPreparationMessage("Select a student group first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForStudentGroup(subject.name, group, false);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects cleared from " + group + ".", "success");
}

/**
 * Assigns every subject to the selected teacher.
 */
function assignAllSubjectsToSelectedTeacher() {
  const teacher = selectedAssignmentTeacher;
  if (!teacher) {
    showPreparationMessage("Select a teacher first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForTeacher(subject.name, teacher, true);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects applied to " + teacher + ".", "success");
}

/**
 * Clears every subject from the selected teacher.
 */
function clearAllSubjectsFromSelectedTeacher() {
  const teacher = selectedAssignmentTeacher;
  if (!teacher) {
    showPreparationMessage("Select a teacher first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForTeacher(subject.name, teacher, false);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects cleared from " + teacher + ".", "success");
}

/**
 * Assigns the selected classroom to every subject (no subject restriction for that room).
 */
function assignAllSubjectsToSelectedRoom() {
  const room = selectedAssignmentRoom;
  if (!room) {
    showPreparationMessage("Select a classroom first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForRoom(subject.name, room, true);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects applied to " + room + ".", "success");
}

/**
 * Clears every subject from the selected classroom.
 */
function clearAllSubjectsFromSelectedRoom() {
  const room = selectedAssignmentRoom;
  if (!room) {
    showPreparationMessage("Select a classroom first.", "warning");
    return;
  }
  if (preparationState.subjects.length === 0) {
    showPreparationMessage("Add subjects first.", "warning");
    return;
  }
  for (const subject of preparationState.subjects) {
    setSubjectForRoom(subject.name, room, false);
  }
  renderAssignmentPanel();
  renderCardFormSelects();
  showPreparationMessage("All subjects cleared from " + room + ".", "success");
}

function renderAssignmentPanel() {
  ensureAssignmentSelections();

  renderAssignmentEntityList("#assignmentStudentGroupList", preparationState.studentGroups,
    selectedAssignmentStudentGroup, groupName => {
      selectedAssignmentStudentGroup = groupName;
      renderAssignmentPanel();
    });

  renderAssignmentEntityList("#assignmentTeacherList", preparationState.teachers,
    selectedAssignmentTeacher, teacherName => {
      selectedAssignmentTeacher = teacherName;
      renderAssignmentPanel();
    });

  renderAssignmentEntityList("#assignmentRoomList", preparationState.rooms.map(r => r.name),
    selectedAssignmentRoom, roomName => {
      selectedAssignmentRoom = roomName;
      renderAssignmentPanel();
    });

  const group = selectedAssignmentStudentGroup;
  renderSubjectCheckboxesForAssignment(
    "#assignmentSubjectsForGroup",
    group ? "student group" : null,
    subject => group != null && (subject.studentGroups || []).includes(group),
    (subjectName, checked) => setSubjectForStudentGroup(subjectName, group, checked)
  );

  const teacher = selectedAssignmentTeacher;
  renderSubjectCheckboxesForAssignment(
    "#assignmentSubjectsForTeacher",
    teacher ? "teacher" : null,
    subject => teacher != null && (subject.teachers || []).includes(teacher),
    (subjectName, checked) => setSubjectForTeacher(subjectName, teacher, checked)
  );

  const room = selectedAssignmentRoom;
  renderSubjectCheckboxesForAssignment(
    "#assignmentSubjectsForRoom",
    room ? "classroom" : null,
    subject => room != null && (subject.rooms || []).includes(room),
    (subjectName, checked) => setSubjectForRoom(subjectName, room, checked)
  );
}

function renderCardFormSelects() {
  const preEmptySubjectValue = $("#cardSubjectSelect").val();
  const editingCard = editingCardId == null
    ? null
    : preparationState.cards.find(card => card.id === editingCardId);

  const $subjectSelect = $("#cardSubjectSelect").empty();
  const $groupSelect = $("#cardStudentGroupSelect").empty();
  const $teacherSelect = $("#cardTeacherSelect").empty();
  const $roomCheckboxes = $("#cardRoomCheckboxes").empty();
  const $subjectTypeCheckboxes = $("#cardSubjectTypeCheckboxes").empty();

  for (const subject of preparationState.subjects) {
    $subjectSelect.append($("<option/>").val(subject.name).text(subject.name));
  }

  if (editingCard) {
    $subjectSelect.val(editingCard.subjectName);
    $("#cardDurationInput").val(editingCard.durationInMinutes == null ? "" : editingCard.durationInMinutes);
  } else if (preEmptySubjectValue
      && preparationState.subjects.some(subject => subject.name === preEmptySubjectValue)) {
    // Preserve user selection when the change handler rebuilds dependent dropdowns.
    $subjectSelect.val(preEmptySubjectValue);
  }

  const selectedSubjectName = $subjectSelect.val();
  const subject = preparationState.subjects.find(s => s.name === selectedSubjectName);

  const eligibleGroups = subject ? subject.studentGroups : [];
  const eligibleTeachers = subject ? subject.teachers : [];
  const eligibleRoomNames = subject ? subject.rooms : [];
  const eligibleSubjectTypes = subject ? (subject.types || []) : [];
  const selectedRoomNames = editingCard ? new Set(editingCard.roomNames || []) : null;
  const selectedSubjectTypes = editingCard ? new Set(editingCard.subjectTypes || []) : null;

  for (const group of eligibleGroups) {
    $groupSelect.append($("<option/>").val(group).text(group));
  }
  for (const teacher of eligibleTeachers) {
    $teacherSelect.append($("<option/>").val(teacher).text(teacher));
  }

  if (eligibleTeachers.length > 0) {
    $teacherSelect.prepend($("<option/>").val("").text("(select teacher)"));
  }

  if (eligibleGroups.length === 0) {
    $groupSelect.append($("<option/>").val("").text("(assign groups to subject first)"));
  }
  if (eligibleTeachers.length === 0) {
    $teacherSelect.append($("<option/>").val("").text("(assign teachers to subject first)"));
  }

  if (editingCard) {
    if (eligibleGroups.includes(editingCard.studentGroup)) {
      $groupSelect.val(editingCard.studentGroup);
    }
    if (editingCard.teacher && eligibleTeachers.includes(editingCard.teacher)) {
      $teacherSelect.val(editingCard.teacher);
    } else {
      $teacherSelect.val("");
    }
  }

  for (const roomName of eligibleRoomNames) {
    const checkboxId = "card_room_" + convertToId(roomName);
    const checked = selectedRoomNames == null || selectedRoomNames.has(roomName);
    $roomCheckboxes.append(
      $(`<div class="form-check"/>`)
        .append($(`<input class="form-check-input card-room-checkbox" type="checkbox"/>`)
          .prop("id", checkboxId)
          .prop("checked", checked)
          .attr("data-room-name", roomName))
        .append($(`<label class="form-check-label"/>`).prop("for", checkboxId).text(roomName))
    );
  }
  if (eligibleRoomNames.length === 0) {
    $roomCheckboxes.append($("<span class=\"text-muted\"/>").text("(assign classrooms to subject first)"));
  }

  const $customTypesInput = $("#cardSubjectCustomTypesInput");
  if (eligibleSubjectTypes.length === 0) {
    // Subject has no predefined types: let the user pick example tags and/or enter custom tags on the card.
    const cardTypes = editingCard ? normalizeSubjectTypes(editingCard.subjectTypes) : [];
    const exampleTypeSet = new Set(EXAMPLE_SUBJECT_TYPE_TAGS);
    const selectedExampleTypes = editingCard
      ? new Set(cardTypes.filter(type => exampleTypeSet.has(type)))
      : null;
    const customTypesText = editingCard
      ? cardTypes.filter(type => !exampleTypeSet.has(type)).join(", ")
      : "";

    for (const subjectType of EXAMPLE_SUBJECT_TYPE_TAGS) {
      const checkboxId = "card_type_" + convertToId(subjectType);
      const checked = selectedExampleTypes == null || selectedExampleTypes.has(subjectType);
      $subjectTypeCheckboxes.append(
        $(`<div class="form-check form-check-inline mb-0"/>`)
          .append($(`<input class="form-check-input card-subject-type-checkbox" type="checkbox"/>`)
            .prop("id", checkboxId)
            .prop("checked", checked)
            .attr("data-subject-type", subjectType))
          .append($(`<label class="form-check-label"/>`).prop("for", checkboxId).text(subjectType))
      );
    }
    $customTypesInput.removeClass("d-none").val(customTypesText);
  } else {
    for (const subjectType of eligibleSubjectTypes) {
      const checkboxId = "card_type_" + convertToId(subjectType);
      const checked = selectedSubjectTypes == null || selectedSubjectTypes.has(subjectType);
      $subjectTypeCheckboxes.append(
        $(`<div class="form-check"/>`)
          .append($(`<input class="form-check-input card-subject-type-checkbox" type="checkbox"/>`)
            .prop("id", checkboxId)
            .prop("checked", checked)
            .attr("data-subject-type", subjectType))
          .append($(`<label class="form-check-label"/>`).prop("for", checkboxId).text(subjectType))
      );
    }
    $customTypesInput.addClass("d-none").val("");
  }

  updateCardFormMode();
}

/** Updates create/save button label and cancel visibility for card edit mode. */
function updateCardFormMode() {
  if (editingCardId) {
    $("#addCardButton").text("Save changes");
    $("#cancelCardEditButton").removeClass("d-none");
  } else {
    $("#addCardButton").text("Create subject card");
    $("#cancelCardEditButton").addClass("d-none");
  }
}

/** Loads a subject card into the form for editing. */
function startEditCard(cardId) {
  const card = preparationState.cards.find(c => c.id === cardId);
  if (!card) {
    return;
  }
  editingCardId = cardId;
  renderCardFormSelects();
  showPreparationMessage("Editing card " + cardId + ". Update the form and click Save changes.", "info");
}

/** Clears subject card edit mode and resets the form. */
function cancelCardEdit() {
  editingCardId = null;
  $("#cardDurationInput").val("");
  renderCardFormSelects();
}

/** Formats duration for table display; generated cards may leave duration unset. */
function formatCardDurationLabel(durationInMinutes) {
  return durationInMinutes == null ? "(not set)" : durationInMinutes + " min";
}

/** Formats teacher for table display; generated cards may leave teacher unset. */
function formatCardTeacherLabel(teacher) {
  return teacher == null || teacher === "" ? "(not set)" : teacher;
}

/** Active sort column for the subject cards table; null keeps creation order. */
let cardTableSortColumn = null;

/** Sort direction when cardTableSortColumn is set: "asc" or "desc". */
let cardTableSortDirection = "asc";

/** Sortable subject-card columns (data-sort-key must match card property names). */
const CARD_TABLE_SORTABLE_COLUMNS = [
  { key: "subjectName", label: "Subject" },
  { key: "durationInMinutes", label: "Duration" },
  { key: "studentGroup", label: "Student group" },
  { key: "teacher", label: "Teacher" },
  { key: "subjectTypes", label: "Types" }
];

/**
 * Toggles sort for a subject-card column: first click ascending, second descending,
 * clicking another column starts ascending on that column.
 */
function toggleCardTableSort(columnKey) {
  if (cardTableSortColumn === columnKey) {
    cardTableSortDirection = cardTableSortDirection === "asc" ? "desc" : "asc";
  } else {
    cardTableSortColumn = columnKey;
    cardTableSortDirection = "asc";
  }
  renderCardTable();
}

/** Sentinel so null/empty text fields sort after real values in ascending order. */
const CARD_TABLE_SORT_NULL_LAST = "\uffff";

/** Normalizes a card field for locale-aware string comparison. */
function normalizeCardSortText(value) {
  return value == null || value === "" ? CARD_TABLE_SORT_NULL_LAST : String(value).toLowerCase();
}

/**
 * Compares two cards for the given sort column.
 * Unset duration/teacher sort last when ascending (and first when descending).
 */
function compareCardsForSort(a, b, columnKey) {
  if (columnKey === "durationInMinutes") {
    const aMinutes = a.durationInMinutes == null ? Number.MAX_SAFE_INTEGER : a.durationInMinutes;
    const bMinutes = b.durationInMinutes == null ? Number.MAX_SAFE_INTEGER : b.durationInMinutes;
    return aMinutes - bMinutes;
  }
  if (columnKey === "subjectTypes") {
    return normalizeCardSortText(formatSubjectTypesLabel(a.subjectTypes))
      .localeCompare(normalizeCardSortText(formatSubjectTypesLabel(b.subjectTypes)));
  }
  return normalizeCardSortText(a[columnKey]).localeCompare(normalizeCardSortText(b[columnKey]));
}

/** Returns subject cards in the current table sort order (or creation order when unsorted). */
function getSortedSubjectCards() {
  if (!cardTableSortColumn) {
    return preparationState.cards.slice();
  }
  const directionMultiplier = cardTableSortDirection === "asc" ? 1 : -1;
  return preparationState.cards.slice().sort(
    (a, b) => directionMultiplier * compareCardsForSort(a, b, cardTableSortColumn)
  );
}

/** Updates ▲/▼ indicators on sortable column headers. */
function updateCardTableSortIndicators() {
  for (const column of CARD_TABLE_SORTABLE_COLUMNS) {
    const $header = $(`#cardTableHeaderRow th[data-sort-key="${column.key}"]`);
    const indicator = cardTableSortColumn === column.key
      ? (cardTableSortDirection === "asc" ? " \u25B2" : " \u25BC")
      : "";
    $header.text(column.label + indicator);
  }
}

function renderCardTable() {
  updateCardTableSortIndicators();
  const $tbody = $("#cardTableBody").empty();

  for (const card of getSortedSubjectCards()) {
    const roomLabels = (card.roomNames || []).join(", ");
    const typeLabels = formatSubjectTypesLabel(card.subjectTypes);
    // Ensure preferred weekdays exist for checkbox rendering (legacy cards)
    if (!card.preferredWeekdays) {
      card.preferredWeekdays = defaultPreferredWeekdays();
    }
    const preferredDays = card.preferredWeekdays;
    const $weekdayCell = $("<td class='card-preferred-weekday-cell'/>");
    for (const dayOfWeek of PREFERRED_WEEKDAY_DAYS) {
      $weekdayCell.append(createCardPreferredWeekdayCheckbox(
        card.id, dayOfWeek, preferredDays.includes(dayOfWeek)));
    }

    $tbody.append(
      $("<tr/>")
        .attr("data-card-id", card.id)
        .append($("<td/>").text(card.id))
        .append($("<td/>").text(card.subjectName))
        .append($("<td/>").text(formatCardDurationLabel(card.durationInMinutes)))
        .append($("<td/>").text(card.studentGroup))
        .append($("<td/>").text(formatCardTeacherLabel(card.teacher)))
        .append($("<td/>").text(typeLabels))
        .append($("<td/>").text(roomLabels || "(none)"))
        .append($weekdayCell)
        .append(createCardParallelSubjectCell(card))
        .append(
          $("<td/>").append(
            $(`<button type="button" class="btn btn-outline-secondary btn-sm py-0 me-1"/>`)
              .text("Copy")
              .on("click", () => copyCard(card.id)),
            $(`<button type="button" class="btn btn-outline-primary btn-sm py-0 me-1"/>`)
              .text("Edit")
              .on("click", () => startEditCard(card.id)),
            $(`<button type="button" class="btn btn-outline-danger btn-sm py-0"/>`)
              .text("Remove")
              .on("click", () => removeCard(card.id))
          )
        )
    );
  }
}

function isValidDurationMinutes(duration) {
  return !isNaN(duration) && duration >= SLOT_MINUTES && duration % SLOT_MINUTES === 0;
}

function addSubject() {
  const name = $("#newSubjectNameInput").val().trim();
  const types = getSubjectTypesFromAddForm();
  if (!name) {
    showPreparationMessage("Enter a subject name.", "warning");
    return;
  }
  if (preparationState.subjects.some(subject => subject.name === name)) {
    showPreparationMessage("Subject already exists.", "warning");
    return;
  }
  preparationState.subjects.push({
    name: name,
    types: types,
    studentGroups: [],
    teachers: [],
    rooms: []
  });
  $("#newSubjectNameInput").val("");
  clearNewSubjectTypeForm();
  sanitizeAllCardSubjectTypes();
  renderPreparationUi();
}

function addRoom() {
    const name = $("#newRoomNameInput").val().trim();
    const priority = parseInt($("#newRoomPriorityInput").val()) || 0;
    if (!name) {
      showPreparationMessage("Enter a classroom name.", "warning");
      return;
    }
    if (preparationState.rooms.some(r => r.name === name)) {
      showPreparationMessage("Classroom already exists.", "warning");
      return;
    }
    preparationState.rooms.push({ name: name, priority: priority });
    $("#newRoomNameInput").val("");
    $("#newRoomPriorityInput").val("0");
    renderPreparationUi();
  }

function addTeacher() {
  const name = $("#newTeacherNameInput").val().trim();
  if (!name) {
    showPreparationMessage("Enter a teacher name.", "warning");
    return;
  }
  if (preparationState.teachers.includes(name)) {
    showPreparationMessage("Teacher already exists.", "warning");
    return;
  }
  preparationState.teachers.push(name);
  preparationState.teacherAvailability[name] = TEACHER_AVAILABILITY_DAYS.slice();
  $("#newTeacherNameInput").val("");
  renderPreparationUi();
}

function addStudentGroup() {
  const name = $("#newStudentGroupNameInput").val().trim();
  if (!name) {
    showPreparationMessage("Enter a student group name.", "warning");
    return;
  }
  if (preparationState.studentGroups.includes(name)) {
    showPreparationMessage("Student group already exists.", "warning");
    return;
  }
  preparationState.studentGroups.push(name);
  $("#newStudentGroupNameInput").val("");
  renderPreparationUi();
}

function removeSubject(subjectName) {
  const removedIds = preparationState.cards
    .filter(c => c.subjectName === subjectName)
    .map(c => c.id);
  preparationState.subjects = preparationState.subjects.filter(s => s.name !== subjectName);
  preparationState.cards = preparationState.cards.filter(c => c.subjectName !== subjectName);
  unlinkRemovedCardIds(removedIds);
  renderPreparationUi();
}

function removeRoom(roomName) {
    preparationState.rooms = preparationState.rooms.filter(r => r.name !== roomName);
    for (const subject of preparationState.subjects) {
      subject.rooms = (subject.rooms || []).filter(name => name !== roomName);
    }
    for (const card of preparationState.cards) {
      card.roomNames = (card.roomNames || []).filter(name => name !== roomName);
    }
    renderPreparationUi();
  }

function removeTeacher(teacherName) {
  const removedIds = preparationState.cards
    .filter(c => c.teacher === teacherName)
    .map(c => c.id);
  preparationState.teachers = preparationState.teachers.filter(t => t !== teacherName);
  for (const subject of preparationState.subjects) {
    subject.teachers = (subject.teachers || []).filter(t => t !== teacherName);
  }
  preparationState.cards = preparationState.cards.filter(c => c.teacher !== teacherName);
  delete preparationState.teacherAvailability[teacherName];
  unlinkRemovedCardIds(removedIds);
  renderPreparationUi();
}

function removeStudentGroup(groupName) {
  const removedIds = preparationState.cards
    .filter(c => c.studentGroup === groupName)
    .map(c => c.id);
  preparationState.studentGroups = preparationState.studentGroups.filter(g => g !== groupName);
  for (const subject of preparationState.subjects) {
    subject.studentGroups = (subject.studentGroups || []).filter(g => g !== groupName);
  }
  preparationState.cards = preparationState.cards.filter(c => c.studentGroup !== groupName);
  unlinkRemovedCardIds(removedIds);
  renderPreparationUi();
}

function saveCard() {
  const subjectName = $("#cardSubjectSelect").val();
  const duration = parseInt($("#cardDurationInput").val(), 10);
  const studentGroup = $("#cardStudentGroupSelect").val();
  const teacher = $("#cardTeacherSelect").val();
  const roomNames = [];
  $("#cardRoomCheckboxes .card-room-checkbox:checked").each(function () {
    roomNames.push($(this).attr("data-room-name"));
  });
  const subjectTypes = getSelectedCardSubjectTypesFromForm();

  if (!subjectName) {
    showPreparationMessage("Select a subject.", "warning");
    return;
  }
  if (!isValidDurationMinutes(duration)) {
    showPreparationMessage("Duration must be a positive multiple of " + SLOT_MINUTES + " minutes.", "warning");
    return;
  }
  if (!studentGroup) {
    showPreparationMessage("Select a student group.", "warning");
    return;
  }
  if (!teacher) {
    showPreparationMessage("Select a teacher.", "warning");
    return;
  }
  if (roomNames.length === 0) {
    showPreparationMessage("Select at least one eligible classroom.", "warning");
    return;
  }

  if (editingCardId) {
    const card = preparationState.cards.find(c => c.id === editingCardId);
    if (card) {
      card.subjectName = subjectName;
      card.durationInMinutes = duration;
      card.studentGroup = studentGroup;
      card.teacher = teacher;
      card.subjectTypes = subjectTypes;
      card.roomNames = roomNames;
      // Preserve existing preferred weekdays when editing other fields
      if (!card.preferredWeekdays) {
        card.preferredWeekdays = defaultPreferredWeekdays();
      }
      if (!card.parallelCardIds) {
        card.parallelCardIds = [];
      }
      // Teacher may have changed; copy that teacher's current weekday availability
      applyTeacherAvailabilityToCard(card);
    }
    editingCardId = null;
    showPreparationMessage("Subject card updated.", "success");
  } else {
    const newCard = {
      id: formatPreparationId(nextCardNumericId++),
      subjectName: subjectName,
      durationInMinutes: duration,
      studentGroup: studentGroup,
      teacher: teacher,
      subjectTypes: subjectTypes,
      roomNames: roomNames,
      preferredWeekdays: defaultPreferredWeekdays(),
      parallelCardIds: []
    };
    applyTeacherAvailabilityToCard(newCard);
    preparationState.cards.push(newCard);
    showPreparationMessage("Subject card created.", "success");
  }

  $("#cardDurationInput").val("");
  renderPreparationUi();
}

/** Duplicates a subject card with a new ID; user can edit the copy afterward. */
function copyCard(cardId) {
  const sourceCard = preparationState.cards.find(card => card.id === cardId);
  if (!sourceCard) {
    return;
  }
  const copiedCard = {
    id: formatPreparationId(nextCardNumericId++),
    subjectName: sourceCard.subjectName,
    durationInMinutes: sourceCard.durationInMinutes == null ? null : sourceCard.durationInMinutes,
    studentGroup: sourceCard.studentGroup,
    teacher: sourceCard.teacher == null || sourceCard.teacher === "" ? null : sourceCard.teacher,
    subjectTypes: (sourceCard.subjectTypes || []).slice(),
    roomNames: (sourceCard.roomNames || []).slice(),
    preferredWeekdays: normalizePreferredWeekdays(sourceCard.preferredWeekdays),
    parallelCardIds: []
  };
  applyTeacherAvailabilityToCard(copiedCard);
  preparationState.cards.push(copiedCard);
  showPreparationMessage("Subject card copied as " + copiedCard.id + ".", "success");
  renderPreparationUi();
}

function removeCard(cardId) {
  if (editingCardId === cardId) {
    editingCardId = null;
  }
  preparationState.cards = preparationState.cards.filter(c => c.id !== cardId);
  unlinkRemovedCardIds([cardId]);
  renderPreparationUi();
}

/**
 * Returns true when a card already exists for the same subject and student group.
 */
function hasSubjectCardFor(subjectName, studentGroup) {
  return preparationState.cards.some(card =>
    card.subjectName === subjectName && card.studentGroup === studentGroup);
}

/**
 * Creates subject cards for every subject assigned to each student group via eligibility mappings.
 * Duration and teacher are left unset; eligible classrooms are pre-filled from subject mappings.
 */
function generateSubjectCards() {
  let createdCount = 0;
  let skippedDuplicateCount = 0;
  let skippedIncompleteCount = 0;

  for (const studentGroup of preparationState.studentGroups) {
    for (const subject of preparationState.subjects) {
      if (!(subject.studentGroups || []).includes(studentGroup)) {
        continue;
      }
      if (hasSubjectCardFor(subject.name, studentGroup)) {
        skippedDuplicateCount++;
        continue;
      }

      const eligibleRooms = subject.rooms || [];
      if (eligibleRooms.length === 0) {
        skippedIncompleteCount++;
        continue;
      }

      preparationState.cards.push({
        id: formatPreparationId(nextCardNumericId++),
        subjectName: subject.name,
        durationInMinutes: null,
        studentGroup: studentGroup,
        teacher: null,
        subjectTypes: (subject.types || []).slice(),
        roomNames: eligibleRooms.slice(),
        // Generated cards default to available on all weekdays
        preferredWeekdays: defaultPreferredWeekdays(),
        // Generated cards start with no parallel pairing
        parallelCardIds: []
      });
      createdCount++;
    }
  }

  if (createdCount === 0) {
    if (preparationState.studentGroups.length === 0 || preparationState.subjects.length === 0) {
      alert("⚠️ Warning: Add student groups and subjects before generating cards.");
    } else if (skippedDuplicateCount === 0 && skippedIncompleteCount === 0) {
      alert("⚠️ Warning: No subject-to-student-group assignments found. Configure Subject assignments first.\n\n💡 Tip: Go to 'Subject assignments' panel and select a resource (student group, teacher, or classroom) to see available subjects.");
    } else {
      const message = "No new cards generated. " + skippedDuplicateCount + " already exist, " + skippedIncompleteCount + " skipped (assign a classroom to each subject).";
      let tip = "";
      if (skippedDuplicateCount > 0) {
        tip += "💡 Tip: Remove existing cards to regenerate them with updated assignments.\n";
      }
      if (skippedIncompleteCount > 0) {
        tip += "💡 Tip: Go to 'Subject assignments' panel to assign classrooms to each subject.";
      }
      if (tip) {
        alert("⚠️ Warning: " + message + "\n\n" + tip);
      } else {
        alert("⚠️ Warning: " + message);
      }
    }
  } else {
    let message = "✅ Generated " + createdCount + " subject card(s). Set duration and teacher on each card.";
    if (skippedDuplicateCount > 0) {
      message += " Skipped " + skippedDuplicateCount + " duplicate(s).";
    }
    if (skippedIncompleteCount > 0) {
      message += " Skipped " + skippedIncompleteCount + " without classroom mapping.";
    }
    alert(message + "\n\n💡 Tip: Click on cards to edit duration, teacher, and eligible classrooms.");
  }

  cancelCardEdit();
  renderPreparationUi();
}

/**
 * Extracts timetable from workspace JSON for Demo UI import.
 * Exported on window for app.js.
 */
function extractTimetableFromPreparedJson(jsonObject) {
  if (jsonObject.format === PREPARATION_WORKSPACE_FORMAT && jsonObject.timetable) {
    return jsonObject.timetable;
  }
  if (jsonObject.timeslots && jsonObject.lessons && jsonObject.rooms) {
    return jsonObject;
  }
  throw new Error("File does not contain a timetable. Upload a full workspace JSON.");
}

/** Expose cache key and builder for app.js Demo UI import. */
window.PREPARATION_CACHE_KEY = PREPARATION_CACHE_KEY;
window.PREPARATION_WORKSPACE_FORMAT = PREPARATION_WORKSPACE_FORMAT;
window.loadPreparationFromCacheObject = loadPreparationFromCacheObject;
window.extractTimetableFromPreparedJson = extractTimetableFromPreparedJson;
window.loadDemoDatasetIntoPreparation = loadDemoDatasetIntoPreparation;
window.buildWorkspaceJsonFromTimetable = buildWorkspaceJsonFromTimetable;
window.saveWorkspaceFromTimetableToCache = saveWorkspaceFromTimetableToCache;
window.downloadJsonFile = downloadJsonFile;

$(document).ready(function () {
  renderPreparationUi();

  renderNewSubjectExampleTypeCheckboxes();
  $("#addSubjectButton").click(addSubject);
  $("#addRoomButton").click(addRoom);
  $("#addTeacherButton").click(addTeacher);
  $("#addStudentGroupButton").click(addStudentGroup);
  $("#addCardButton").click(saveCard);
  $("#cancelCardEditButton").click(cancelCardEdit);
  $("#generateSubjectCardsButton").click(generateSubjectCards);

  // Sort subject cards by clicking Subject, Duration, Student group, or Teacher headers.
  $("#cardTableHeaderRow").on("click", "th.card-table-sortable", function () {
    toggleCardTableSort($(this).attr("data-sort-key"));
  });
  $("#assignmentGroupApplyAllButton").click(assignAllSubjectsToSelectedStudentGroup);
  $("#assignmentGroupClearAllButton").click(clearAllSubjectsFromSelectedStudentGroup);
  $("#assignmentTeacherApplyAllButton").click(assignAllSubjectsToSelectedTeacher);
  $("#assignmentTeacherClearAllButton").click(clearAllSubjectsFromSelectedTeacher);
  $("#assignmentRoomApplyAllButton").click(assignAllSubjectsToSelectedRoom);
  $("#assignmentRoomClearAllButton").click(clearAllSubjectsFromSelectedRoom);

  $("#cardSubjectSelect").change(function () {
    if (editingCardId) {
      editingCardId = null;
    }
    renderCardFormSelects();
  });

  $("#downloadWorkspaceButton").click(function () {
    downloadJsonFile(buildWorkspaceJson(), "preparation-workspace.json");
    showPreparationMessage("Workspace JSON downloaded.", "success");
  });

  $("#uploadWorkspaceButton").click(function () {
    $("#uploadWorkspaceInput").click();
  });
  $("#uploadWorkspaceInput").change(function () {
    readJsonFile(this, function (json) {
      try {
        applyWorkspaceJson(json);
        showPreparationMessage("Workspace JSON loaded.", "success");
      } catch (error) {
        showPreparationMessage(error.message, "danger");
      }
    });
  });

  $("#saveToCacheButton").click(savePreparationToCache);

  $("#loadFromCacheButton").click(function () {
    try {
      const cached = loadPreparationFromCacheObject();
      if (!cached) {
        showPreparationMessage("No workspace found in browser cache.", "warning");
        return;
      }
      applyWorkspaceJson(cached);
      showPreparationMessage("Workspace loaded from browser cache.", "success");
    } catch (error) {
      showPreparationMessage("Failed to load from cache: " + error.message, "danger");
    }
  });

  $("#clearPreparationCacheButton").click(clearPreparationCacheAndReset);
});