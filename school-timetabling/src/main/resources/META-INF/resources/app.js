var autoRefreshIntervalId = null;
const dateTimeFormatter = JSJoda.DateTimeFormatter.ofPattern('HH:mm')

let demoDataId = null;
let scheduleId = null;
let loadedSchedule = null;

/** Default soft weight when a constraint is enabled (matches HardSoftScore.ONE_SOFT). */
const DEFAULT_SOFT_CONSTRAINT_WEIGHT = 1;

/** Minimum allowed soft constraint weight in the UI. */
const MIN_SOFT_CONSTRAINT_WEIGHT = 1;

/** Maximum allowed soft constraint weight in the UI. */
const MAX_SOFT_CONSTRAINT_WEIGHT = 100;

/** Atomic scheduling slot length in minutes for Demo UI summaries (must match Timeslot.SLOT_MINUTES). */
const DEMO_SLOT_MINUTES = 30;

/** Soft constraints the user can enable/disable before solving. `name` must match TimetableConstraintProvider. */
const SOFT_CONSTRAINTS = [
  {
    id: "teacherRoomStability",
    name: "Teacher room stability",
    label: "Keep each teacher in one classroom",
    labelZh: "每位教師盡量固定在同一課室",
    helpWhen: "Same teacher is assigned to different rooms",
    helpContribution: "−weight per pair"
  },
  {
    id: "studentRoomStability",
    name: "Student room stability",
    label: "Keep each class in one classroom",
    labelZh: "每個班別盡量固定在同一課室",
    helpWhen: "Same student group is assigned to different rooms",
    helpContribution: "−weight per pair"
  },
  {
    id: "teacherTimeEfficiency",
    name: "Teacher time efficiency",
    label: "Give teachers back-to-back lessons",
    labelZh: "教師課堂盡量連續排列，減少空堂",
    helpWhen: "Same teacher has consecutive lessons on the same day",
    helpContribution: "+weight per pair"
  },
  {
    id: "studentTimeEfficiency",
    name: "Student time efficiency",
    label: "Give classes back-to-back lessons",
    labelZh: "班別課堂盡量連續排列，減少空堂",
    helpWhen: "Same student group has consecutive lessons on the same day",
    helpContribution: "+weight per pair"
  },
  {
    id: "studentGroupSubjectVariety",
    name: "Student group subject variety",
    label: "Avoid same subject back-to-back for a class",
    labelZh: "避免班別連續上同一科目",
    helpWhen: "Same subject is scheduled in consecutive slots for a group",
    helpContribution: "−weight per pair"
  },
  {
    id: "studentGroupSubjectTypeVariety",
    name: "Student group subject type variety",
    label: "Avoid same type of subject back-to-back for a class",
    labelZh: "避免班別連續上同一類型的科目",
    helpWhen: "Back-to-back lessons for a group share at least one subject type tag",
    helpContribution: "−weight per pair"
  },
  {
    id: "goodLunchtimeTeacher",
    name: "Good lunchtime for teacher",
    label: "Give teachers a proper lunch break",
    labelZh: "教師要有足夠午餐休息時間",
    helpWhen: "Teacher lacks a 2-hour lunch gap around 13:00–13:30",
    helpContribution: "−weight per teacher/day"
  },
  {
    id: "goodLunchtimeStudentGroup",
    name: "Good lunchtime for student group",
    label: "Give classes a proper lunch break",
    labelZh: "班別要有足夠午餐休息時間",
    helpWhen: "Student group lacks a 2-hour lunch gap around 13:00–13:30",
    helpContribution: "−weight per group/day"
  },
  {
    id: "roomPriority",
    name: "Room priority",
    label: "Prefer higher-priority classrooms",
    labelZh: "優先使用優先度較高的課室",
    helpWhen: "Lesson is assigned to a lower-priority room",
    helpContribution: "+priority × weight per lesson"
  },
  {
    id: "teacherAvailability",
    name: "Teacher availability",
    label: "Respect teacher availability days",
    labelZh: "避開教師不可用嘅日子",
    defaultChecked: true,
    helpWhen: "Lesson is scheduled on a day the teacher marked unavailable",
    helpContribution: "−weight per lesson"
  },
  {
    id: "preferredWeekday",
    name: "Preferred weekday",
    label: "Prefer subject preferred weekdays",
    labelZh: "科目盡量安排喺偏好嘅平日",
    defaultChecked: true,
    helpWhen: "Lesson is scheduled on a day outside the subject card preferred weekdays",
    helpContribution: "−weight per lesson"
  },
  {
    id: "parallelSubject",
    name: "Parallel subject",
    label: "Keep parallel subjects on the same timeslot",
    labelZh: "平行科目盡量安排喺同一時段",
    defaultChecked: true,
    helpWhen: "Linked subject cards are not on the same weekday and start time",
    helpContribution: "−weight per pair"
  }
];

let roomMap = null;
let timeslotMap = null;

/** Preserved By Weekday tab selections across schedule re-renders. */
let selectedWeekdayRoom = null;
let selectedWeekdayTeacher = null;
let selectedWeekdayStudentGroup = null;

/** Party type values for the By Filter tab multi-select. */
const FILTER_PARTY_TYPE_TEACHER = "teacher";
const FILTER_PARTY_TYPE_STUDENT_GROUP = "studentGroup";

/** Filter mode values for the By Filter tab. */
const FILTER_MODE_COMMON_FREE = "commonFree";
const FILTER_MODE_REPLACEMENT = "replacement";

/** Entity view types for drag-and-drop scheduling in Group 1 grids. */
const ENTITY_VIEW_ROOM = "room";
const ENTITY_VIEW_TEACHER = "teacher";
const ENTITY_VIEW_STUDENT_GROUP = "studentGroup";

/** Export pop-out mode: room | teacher | studentGroup (default room). */
let selectedExportMode = ENTITY_VIEW_ROOM;

/** Export gallery column count: 2, 3, or 4 (default 3). */
let selectedExportColumns = 3;

/** Export gallery zoom percent (50–150, default 100). */
let selectedExportZoom = 100;
const EXPORT_ZOOM_MIN = 50;
const EXPORT_ZOOM_MAX = 150;
const EXPORT_ZOOM_STEP = 10;

/** Fixed rem sizes so every export weekday table shares the same column widths. */
const EXPORT_TIME_COL_REM = 4.5;
const EXPORT_DAY_COL_REM = 5.5;
const EXPORT_CARD_PADDING_REM = 1.5;

/** Lesson id currently being dragged in an entity view (null when not dragging). */
let draggedLessonId = null;

/** Preserved By Filter tab selections across schedule re-renders. */
let selectedFilterDay = null;
let selectedFilterMode = FILTER_MODE_COMMON_FREE;
let selectedFilterTeachers = [];
let selectedFilterStudentGroups = [];
let selectedFilterTargetTeacher = null;
let selectedFilterReplacementTeachers = [];

/** Session storage keys for schedule pop-out windows (Export / By weekday / By filter). */
const SCHEDULE_POPOUT_STORAGE_KEY = "schedulePopout.timetable";
const SCHEDULE_POPOUT_STATE_KEY = "schedulePopout.viewState";
const SCHEDULE_POPOUT_UPDATED_KEY = "schedulePopout.updatedAt";

/** localStorage key for collapsed state of the unassigned-lessons sidebar. */
const UNASSIGNED_SIDEBAR_COLLAPSED_KEY = "demo.unassignedSidebarCollapsed";

/** localStorage key for the current AI Scheduler timetable snapshot. */
const SCHEDULER_TIMETABLE_CACHE_KEY = "school-timetabling-scheduler-timetable";

/** Tracks open pop-out windows so we can focus or refresh them instead of opening duplicates. */
const schedulePopoutWindows = {
  export: null,
  weekday: null,
  filter: null
};

/** Mon–Fri column order for weekly timetable views. */
const WEEKDAY_COLUMN_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

/** Base64-encodes a string for stable grid column keys (defined early for renderSchedule). */
function convertToId(str) {
  return btoa(str).replace(/=/g, "");
}

/** Resolves a lesson reference field that may be an id string or embedded object. */
function extractId(value) {
  if (value == null) {
    return value;
  }
  if (typeof value === "object") {
    return value.id;
  }
  return value;
}

// Color Picker: Based on https://venngage.com/blog/color-blind-friendly-palette/
const BG_COLORS = ["#009E73","#0072B2","#D55E00","#000000","#CC79A7","#E69F00","#F0E442","#F6768E","#C10020","#A6BDD7","#803E75","#007D34","#56B4E9","#999999","#8DD3C7","#FFD92F","#B3DE69","#FB8072","#80B1D3","#B15928","#CAB2D6","#1B9E77","#E7298A","#6A3D9A"];
const FG_COLORS = ["#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#000000","#000000","#FFFFFF","#FFFFFF","#000000","#FFFFFF","#FFFFFF","#FFFFFF","#000000","#000000","#000000","#000000","#FFFFFF","#000000","#FFFFFF","#000000","#FFFFFF","#FFFFFF","#FFFFFF"];
let COLOR_MAP = new Map()
let nextColorIndex = 0

function pickColor(object) {
  let color = COLOR_MAP.get(object);
  if (color !== undefined) {
    return color;
  }
  let index = nextColorIndex++;
  color = {bg : BG_COLORS[index], fg: FG_COLORS[index]};
  COLOR_MAP.set(object,color);
  return color;
}

$(document).ready(function () {
  if (isSchedulePopoutPage()) {
    initSchedulePopout();
    return;
  }

  $("#solveButton").click(function () {
    solve();
  });
  $("#resetButton").click(function () {
    resetTimetable();
  });
  $("#stopSolvingButton").click(function () {
    stopSolving();
  });
  $("#analyzeButton").click(function () {
    analyze();
  });

  setupAjax();
  renderSoftConstraintCheckboxes();
  bindSoftConstraintWeightControls();
  initUnassignedSidebar();
  initCustomLessonCardForm();
  initEditLessonCardModal();
  renderScoreDisplay(null);
  fetchDemoData();

  // Timetable cache, file import/export, and subject-card transfer with Preparation.
  $("#saveScheduleToCacheButton").click(saveScheduleToCache);
  $("#loadScheduleFromCacheButton").click(loadScheduleFromCache);
  $("#clearSubjectCardsButton").click(clearAllSubjectCards);

  $("#loadPreparedFromCacheButton").click(function () {
    loadPreparedTimetableFromCache();
  });
  $("#savePreparedToCacheButton").click(function () {
    savePreparedSubjectCardsToCache();
  });
  $("#downloadPreparedWorkspaceButton").click(function () {
    downloadPreparedSubjectCardsJson();
  });
  $("#loadPreparedFromFileButton").click(function () {
    $("#loadPreparedFromFileInput").click();
  });
  $("#loadPreparedFromFileInput").change(function () {
    loadPreparedTimetableFromFile(this);
  });

  $("#downloadScheduleJsonButton").click(function () {
    downloadScheduledTimetableJson();
  });
  $("#uploadScheduleJsonButton").click(function () {
    $("#uploadScheduleJsonInput").click();
  });
  $("#uploadScheduleJsonInput").change(function () {
    uploadScheduledTimetableFromFile(this);
  });

  // Group 2 views open in a separate pop-out window.
  $("#byExportTab").click(function () {
    openSchedulePopout("export");
  });
  $("#byWeekdayTab").click(function () {
    openSchedulePopout("weekday");
  });
  $("#byFilterTab").click(function () {
    openSchedulePopout("filter");
  });

  // Click a highlighted lesson card to see which constraints it violates.
  $(document).on("click", ".timetable-lesson-card-violation, .timetable-lesson-card-violation-soft", function (event) {
    if ($(event.target).closest(".lesson-card-action-btn").length > 0) {
      return;
    }
    const lessonId = $(this).attr("data-lesson-id");
    if (loadedSchedule == null || lessonId == null) {
      return;
    }
    const lesson = loadedSchedule.lessons.find(l => l.id === lessonId);
    if (lesson != null) {
      showLessonViolationModal(lesson);
    }
  });

  // Return a placed lesson to Unassigned Lessons.
  $(document).on("click", ".lesson-card-unassign-btn", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (isSolverRunning()) {
      return;
    }
    const lessonId = $(this).closest(".timetable-lesson-card").attr("data-lesson-id");
    const lesson = findLessonById(lessonId);
    if (lesson == null || !isLessonAssigned(lesson)) {
      return;
    }
    unassignLessonManually(lesson);
    refreshScoreAfterManualMove();
  });

  // Pin or unpin a placed lesson so it stays fixed during manual moves and solving.
  $(document).on("click", ".lesson-card-pin-btn", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (isSolverRunning()) {
      return;
    }
    const lessonId = $(this).closest(".timetable-lesson-card").attr("data-lesson-id");
    toggleLessonPin(lessonId);
  });

  // Open the edit popup for an unassigned subject card.
  $(document).on("click", ".lesson-card-edit-btn", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (isSolverRunning()) {
      return;
    }
    const lessonId = $(this).closest(".timetable-lesson-card").attr("data-lesson-id");
    showEditLessonCardModal(lessonId);
  });

  // Remove an unassigned lesson from the sidebar after user confirmation.
  $(document).on("click", ".lesson-card-remove-btn", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (isSolverRunning()) {
      return;
    }
    const lessonId = $(this).closest(".timetable-lesson-card").attr("data-lesson-id");
    removeUnassignedLesson(lessonId);
  });

  // Keep pin / edit / remove clicks from starting a card drag.
  $(document).on("mousedown", ".lesson-card-action-btn", function (event) {
    event.stopPropagation();
  });

  // Drag-and-drop manual scheduling in Group 1 entity views (By room / teacher / student group).
  $(document).on("mousedown", ".timetable-lesson-draggable", function () {
    // Clear a stuck drag-active state from an aborted prior drag (grid cards stop responding otherwise).
    $("body").removeClass("timetable-entity-drag-active");
  });
  $(document).on("dragstart", ".timetable-lesson-draggable", function (event) {
    // Action buttons sit on the draggable card; ignore drags that start on them.
    if ($(event.target).closest(".lesson-card-action-btn").length > 0) {
      event.preventDefault();
      return;
    }
    draggedLessonId = $(this).attr("data-lesson-id");
    event.originalEvent.dataTransfer.setData("text/plain", draggedLessonId);
    event.originalEvent.dataTransfer.effectAllowed = "move";
    $(this).addClass("timetable-lesson-dragging");
    // Defer until after dragstart completes; sync disable breaks grid-placed cards inside .timetable-lesson.
    requestAnimationFrame(function () {
      $("body").addClass("timetable-entity-drag-active");
    });
  });
  $(document).on("dragend", ".timetable-lesson-draggable", function () {
    draggedLessonId = null;
    $("body").removeClass("timetable-entity-drag-active");
    $(".timetable-lesson-dragging").removeClass("timetable-lesson-dragging");
    $(".timetable-drop-target").removeClass("timetable-drop-target");
  });
  $(document).on("dragover", ".timetable-grid-cell[data-view-type]", function (event) {
    if (draggedLessonId == null || isSolverRunning()) {
      return;
    }
    const lesson = findLessonById(draggedLessonId);
    const $cell = $(this);
    const validation = validateManualDropAssignment(
      lesson,
      $cell.attr("data-view-type"),
      $cell.attr("data-column-key"),
      $cell.attr("data-column-label"),
      timeslotMap.get($cell.attr("data-timeslot-id"))
    );
    if (!validation.valid) {
      return;
    }
    event.preventDefault();
    event.originalEvent.dataTransfer.dropEffect = "move";
    $cell.addClass("timetable-drop-target");
  });
  $(document).on("dragleave", ".timetable-grid-cell[data-view-type]", function () {
    $(this).removeClass("timetable-drop-target");
  });
  $(document).on("drop", ".timetable-grid-cell[data-view-type]", function (event) {
    event.preventDefault();
    $(this).removeClass("timetable-drop-target");
    $("body").removeClass("timetable-entity-drag-active");
    if (draggedLessonId == null || isSolverRunning()) {
      return;
    }
    handleEntityViewLessonDrop($(this));
  });
});

/** True when this page is a schedule pop-out (Export, By weekday, or By filter). */
function isSchedulePopoutPage() {
  const view = window.SCHEDULE_POPOUT_VIEW;
  return view === "export" || view === "weekday" || view === "filter";
}

/** Persists Export / By weekday / By filter control selections for pop-out windows. */
function saveSchedulePopoutViewState() {
  sessionStorage.setItem(SCHEDULE_POPOUT_STATE_KEY, JSON.stringify({
    selectedExportMode,
    selectedExportColumns,
    selectedExportZoom,
    selectedWeekdayRoom,
    selectedWeekdayTeacher,
    selectedWeekdayStudentGroup,
    selectedFilterDay,
    selectedFilterMode,
    selectedFilterTeachers,
    selectedFilterStudentGroups,
    selectedFilterTargetTeacher,
    selectedFilterReplacementTeachers
  }));
}

/** Restores Export / By weekday / By filter control selections from session storage. */
function loadSchedulePopoutViewState() {
  const raw = sessionStorage.getItem(SCHEDULE_POPOUT_STATE_KEY);
  if (raw == null) {
    return;
  }
  try {
    const state = JSON.parse(raw);
    const exportMode = state.selectedExportMode;
    if (exportMode === ENTITY_VIEW_ROOM || exportMode === ENTITY_VIEW_TEACHER || exportMode === ENTITY_VIEW_STUDENT_GROUP) {
      selectedExportMode = exportMode;
    }
    const columns = Number(state.selectedExportColumns);
    if (columns === 2 || columns === 3 || columns === 4) {
      selectedExportColumns = columns;
    }
    const zoom = Number(state.selectedExportZoom);
    if (!Number.isNaN(zoom) && zoom >= EXPORT_ZOOM_MIN && zoom <= EXPORT_ZOOM_MAX) {
      selectedExportZoom = zoom;
    }
    selectedWeekdayRoom = state.selectedWeekdayRoom ?? null;
    selectedWeekdayTeacher = state.selectedWeekdayTeacher ?? null;
    selectedWeekdayStudentGroup = state.selectedWeekdayStudentGroup ?? null;
    selectedFilterDay = state.selectedFilterDay ?? null;
    selectedFilterMode = state.selectedFilterMode ?? FILTER_MODE_COMMON_FREE;
    selectedFilterTeachers = state.selectedFilterTeachers ?? [];
    selectedFilterStudentGroups = state.selectedFilterStudentGroups ?? [];
    selectedFilterTargetTeacher = state.selectedFilterTargetTeacher ?? null;
    selectedFilterReplacementTeachers = state.selectedFilterReplacementTeachers ?? [];
  } catch (error) {
    console.warn("Could not restore schedule pop-out view state.", error);
  }
}

/** Writes the current timetable to session storage so pop-out windows can read it. */
function persistScheduleForPopouts(timetable) {
  if (timetable == null) {
    return;
  }
  sessionStorage.setItem(SCHEDULE_POPOUT_STORAGE_KEY, JSON.stringify(timetable));
  sessionStorage.setItem(SCHEDULE_POPOUT_UPDATED_KEY, String(Date.now()));
}

/** Loads the timetable from session storage into the pop-out page. */
function loadScheduleFromPopoutStorage() {
  const raw = sessionStorage.getItem(SCHEDULE_POPOUT_STORAGE_KEY);
  if (raw == null) {
    return false;
  }
  try {
    loadedSchedule = JSON.parse(raw);
    COLOR_MAP = new Map();
    nextColorIndex = 0;
    updateScheduleMap(loadedSchedule);
    return true;
  } catch (error) {
    console.warn("Could not load timetable for schedule pop-out.", error);
    return false;
  }
}

/** Opens or focuses a schedule pop-out window for the given view. */
function openSchedulePopout(view) {
  if (loadedSchedule == null) {
    alert("Load or solve a timetable first.");
    return;
  }
  saveSchedulePopoutViewState();
  persistScheduleForPopouts(loadedSchedule);

  const existingWindow = schedulePopoutWindows[view];
  if (existingWindow != null && !existingWindow.closed) {
    existingWindow.focus();
    existingWindow.postMessage({ type: "scheduleUpdated" }, window.location.origin);
    return;
  }

  const popout = window.open(
    "/schedule-popout.html?view=" + encodeURIComponent(view),
    "schedulePopout_" + view,
    "width=1280,height=900,resizable=yes,scrollbars=yes"
  );
  if (popout == null) {
    alert("Pop-up blocked. Allow pop-ups for this site to open schedule views.");
    return;
  }
  schedulePopoutWindows[view] = popout;
}

/** Notifies open pop-out windows that the main timetable was updated. */
function notifySchedulePopouts() {
  for (const view of ["export", "weekday", "filter"]) {
    const popout = schedulePopoutWindows[view];
    if (popout != null && !popout.closed) {
      popout.postMessage({ type: "scheduleUpdated" }, window.location.origin);
    }
  }
}

/** Binds weekday, filter, and export controls used inside schedule pop-out windows. */
function bindScheduleViewControls() {
  $("#weekdayRoomSelect, #weekdayTeacherSelect, #weekdayStudentGroupSelect").change(function () {
    selectedWeekdayRoom = $("#weekdayRoomSelect").val();
    selectedWeekdayTeacher = $("#weekdayTeacherSelect").val();
    selectedWeekdayStudentGroup = $("#weekdayStudentGroupSelect").val();
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      renderWeekdayView(loadedSchedule);
    }
  });

  // Export mode pills: Room / Teacher / Student group
  $(document).on("click", ".export-mode-btn", function () {
    const mode = $(this).attr("data-export-mode");
    if (mode !== ENTITY_VIEW_ROOM && mode !== ENTITY_VIEW_TEACHER && mode !== ENTITY_VIEW_STUDENT_GROUP) {
      return;
    }
    selectedExportMode = mode;
    $(".export-mode-btn").removeClass("active");
    $(this).addClass("active");
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      renderExportView(loadedSchedule);
    }
  });
  // Export layout: 2 × n / 3 × n / 4 × n
  $(document).on("click", ".export-columns-btn", function () {
    const columns = Number($(this).attr("data-export-columns"));
    if (columns !== 2 && columns !== 3 && columns !== 4) {
      return;
    }
    selectedExportColumns = columns;
    applyExportLayoutControls();
    saveSchedulePopoutViewState();
  });
  $("#exportZoomInButton").click(function () {
    setExportZoom(selectedExportZoom + EXPORT_ZOOM_STEP);
  });
  $("#exportZoomOutButton").click(function () {
    setExportZoom(selectedExportZoom - EXPORT_ZOOM_STEP);
  });
  $("#exportZoomResetButton").click(function () {
    setExportZoom(100);
  });
  $("#exportPrintButton").click(function () {
    window.print();
  });
  $("#exportCsvButton").click(function () {
    downloadExportCsv();
  });
  $("#exportExcelButton").click(function () {
    downloadExportExcel();
  });
  $("#exportPngZipButton").click(function () {
    downloadExportPngZip();
  });
  $("#exportHtmlButton").click(function () {
    downloadExportHtml();
  });

  $("#filterDaySelect, #filterModeSelect").change(function () {
    selectedFilterDay = $("#filterDaySelect").val();
    selectedFilterMode = $("#filterModeSelect").val() || FILTER_MODE_COMMON_FREE;
    updateFilterControlsVisibility();
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      populateFilterReplacementSelects(loadedSchedule);
      syncFilterStateFromControls();
      renderFilterView(loadedSchedule);
    }
  });
  $("#filterTeacherSelect, #filterStudentGroupSelect").change(function () {
    syncFilterStateFromControls();
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      renderFilterView(loadedSchedule);
    }
  });
  $("#filterTargetTeacherSelect").change(function () {
    selectedFilterTargetTeacher = $("#filterTargetTeacherSelect").val() || null;
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      populateFilterReplacementTeacherSelect(loadedSchedule);
      syncFilterStateFromControls();
      renderFilterView(loadedSchedule);
    }
  });
  $("#filterReplacementTeacherSelect").change(function () {
    syncFilterStateFromControls();
    saveSchedulePopoutViewState();
    if (loadedSchedule != null) {
      renderFilterView(loadedSchedule);
    }
  });

  $(document).on("click", ".timetable-lesson-card-violation, .timetable-lesson-card-violation-soft", function () {
    const lessonId = $(this).attr("data-lesson-id");
    if (loadedSchedule == null || lessonId == null) {
      return;
    }
    const lesson = loadedSchedule.lessons.find(l => l.id === lessonId);
    if (lesson != null) {
      showLessonViolationModal(lesson);
    }
  });
}

/** Renders the active view inside a schedule pop-out window. */
function renderSchedulePopoutView() {
  const view = window.SCHEDULE_POPOUT_VIEW;
  if (loadedSchedule == null || loadedSchedule.timeslots == null || loadedSchedule.timeslots.length === 0) {
    $("#schedulePopoutEmpty").removeClass("d-none");
    $("#exportPopoutContent, #weekdayPopoutContent, #filterPopoutContent").addClass("d-none");
    return;
  }

  $("#schedulePopoutEmpty").addClass("d-none");
  if (view === "export") {
    $("#exportPopoutContent").removeClass("d-none");
    $("#weekdayPopoutContent, #filterPopoutContent").addClass("d-none");
    syncExportModeButtons();
    applyExportLayoutControls();
    renderExportView(loadedSchedule);
  } else if (view === "weekday") {
    $("#weekdayPopoutContent").removeClass("d-none");
    $("#exportPopoutContent, #filterPopoutContent").addClass("d-none");
    populateWeekdaySelectors(loadedSchedule);
    renderWeekdayView(loadedSchedule);
  } else if (view === "filter") {
    $("#filterPopoutContent").removeClass("d-none");
    $("#exportPopoutContent, #weekdayPopoutContent").addClass("d-none");
    populateFilterControls(loadedSchedule);
    renderFilterView(loadedSchedule);
  }
}

/** Bootstraps a schedule pop-out page (Export, By weekday, or By filter). */
function initSchedulePopout() {
  const view = window.SCHEDULE_POPOUT_VIEW;
  if (view === "export") {
    document.title = "Export — VTC AI Timetabling";
    $("#schedulePopoutTitle").text("Export");
    $("#schedulePopoutSubtitle").text("Export all room, teacher, or student group weekly timetables.");
  } else if (view === "weekday") {
    document.title = "View weekday — VTC AI Timetabling";
    $("#schedulePopoutTitle").text("View weekday");
    $("#schedulePopoutSubtitle").text("Room, teacher, and student group weekly timetables.");
  } else if (view === "filter") {
    document.title = "Apply filter — VTC AI Timetabling";
    $("#schedulePopoutTitle").text("Apply filter");
    $("#schedulePopoutSubtitle").text("Common free time and replacement teacher search.");
  } else {
    $("#schedulePopoutTitle").text("Unknown schedule view");
    $("#schedulePopoutSubtitle").text("Use ?view=export, ?view=weekday, or ?view=filter in the URL.");
    $("#schedulePopoutEmpty").removeClass("d-none");
    return;
  }

  bindScheduleViewControls();
  loadSchedulePopoutViewState();
  loadScheduleFromPopoutStorage();
  renderSchedulePopoutView();

  window.addEventListener("storage", function (event) {
    if (event.key === SCHEDULE_POPOUT_STORAGE_KEY || event.key === SCHEDULE_POPOUT_UPDATED_KEY) {
      if (loadScheduleFromPopoutStorage()) {
        loadSchedulePopoutViewState();
        renderSchedulePopoutView();
      }
    } else if (event.key === SCHEDULE_POPOUT_STATE_KEY) {
      loadSchedulePopoutViewState();
      renderSchedulePopoutView();
    }
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (event.data != null && event.data.type === "scheduleUpdated") {
      if (loadScheduleFromPopoutStorage()) {
        renderSchedulePopoutView();
      }
    }
  });
}

/** Builds a bilingual label element for one soft constraint (English + Traditional Chinese). */
function buildSoftConstraintLabelElement(constraint) {
  return $(`<span class="soft-constraint-display-label"/>`)
    .append($(`<span class="soft-constraint-display-label-en"/>`).text(constraint.label))
    .append($(`<span class="soft-constraint-display-label-zh"/>`).text(constraint.labelZh));
}

/** Finds a soft constraint definition by solver constraint name. */
function findSoftConstraintByName(constraintName) {
  return SOFT_CONSTRAINTS.find(constraint => constraint.name === constraintName);
}

/** Returns the DOM id for a soft constraint checkbox. */
function getSoftConstraintCheckboxId(constraintId) {
  return "softConstraint_" + constraintId;
}

/** Returns the DOM id for a soft constraint weight input. */
function getSoftConstraintWeightInputId(constraintId) {
  return "softConstraintWeight_" + constraintId;
}

/**
 * Normalizes a user-entered soft weight to a positive integer within allowed bounds.
 * Invalid or empty values fall back to {@link DEFAULT_SOFT_CONSTRAINT_WEIGHT}.
 */
function normalizeSoftConstraintWeight(rawValue) {
  const parsed = parseInt(String(rawValue).trim(), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_SOFT_CONSTRAINT_WEIGHT;
  }
  return Math.min(MAX_SOFT_CONSTRAINT_WEIGHT, Math.max(MIN_SOFT_CONSTRAINT_WEIGHT, parsed));
}

/** Enables or disables the weight input for one soft constraint row. */
function updateSoftConstraintWeightInputState(constraintId) {
  const checkboxId = getSoftConstraintCheckboxId(constraintId);
  const weightInputId = getSoftConstraintWeightInputId(constraintId);
  const enabled = $(`#${checkboxId}`).is(":checked");
  $(`#${weightInputId}`).prop("disabled", !enabled);
}

/**
 * Renders one unchecked checkbox plus weight input per soft constraint.
 * Check a constraint and set its weight before solving; unchecked constraints are disabled.
 */
function renderSoftConstraintCheckboxes() {
  const $container = $("#softConstraintCheckboxes");
  $container.empty();
  
  // Support multiple soft constraints marked defaultChecked (e.g. Teacher availability + Preferred weekday)
  SOFT_CONSTRAINTS.forEach(constraint => {
    const checkboxId = getSoftConstraintCheckboxId(constraint.id);
    const weightInputId = getSoftConstraintWeightInputId(constraint.id);
    const isChecked = Boolean(constraint.defaultChecked);
    $container.append($(`<div class="col"/>`).append(
      $(`<div class="soft-constraint-row"/>`).append(
        $(`<div class="form-check soft-constraint-check"/>`).append(
          $(`<input class="form-check-input soft-constraint-checkbox" type="checkbox"/>`)
            .prop("id", checkboxId)
            .prop("checked", isChecked)
            .attr("data-constraint-id", constraint.id)
            .attr("data-constraint-name", constraint.name),
          $(`<label class="form-check-label soft-constraint-display-label"/>`)
            .prop("for", checkboxId)
            .append($(`<span class="soft-constraint-display-label-en"/>`).text(constraint.label))
            .append($(`<span class="soft-constraint-display-label-zh"/>`).text(constraint.labelZh))
        ),
        $(`<div class="soft-constraint-weight"/>`).append(
          $(`<label class="soft-constraint-weight-label visually-hidden"/>`)
            .prop("for", weightInputId)
            .text("Weight for " + constraint.label),
          $(`<input class="form-control form-control-sm soft-constraint-weight-input" type="number"/>`)
            .prop("id", weightInputId)
            .attr("data-constraint-id", constraint.id)
            .attr("min", MIN_SOFT_CONSTRAINT_WEIGHT)
            .attr("max", MAX_SOFT_CONSTRAINT_WEIGHT)
            .attr("step", 1)
            .attr("inputmode", "numeric")
            .prop("disabled", !isChecked)
            .val(isChecked ? DEFAULT_SOFT_CONSTRAINT_WEIGHT : DEFAULT_SOFT_CONSTRAINT_WEIGHT)
        )
      )
    ));
  });
}

/** Binds checkbox/weight interactions for the soft constraint panel. */
function bindSoftConstraintWeightControls() {
  $(document).on("change", ".soft-constraint-checkbox", function () {
    const constraintId = $(this).attr("data-constraint-id");
    updateSoftConstraintWeightInputState(constraintId);
  });

  $(document).on("change blur", ".soft-constraint-weight-input", function () {
    const normalized = normalizeSoftConstraintWeight($(this).val());
    $(this).val(normalized);
  });
}

/**
 * Applies soft-constraint checkbox and weight selections to the timetable JSON payload.
 * Unchecked constraints are disabled (0hard/0soft). Checked constraints use 0hard/Nsoft when N != 1.
 */
function applySoftConstraintSelectionToSchedule(schedule) {
  const overrides = {};
  SOFT_CONSTRAINTS.forEach(constraint => {
    const checkboxId = getSoftConstraintCheckboxId(constraint.id);
    const weightInputId = getSoftConstraintWeightInputId(constraint.id);
    const checked = $(`#${checkboxId}`).is(":checked");
    if (!checked) {
      overrides[constraint.name] = "0hard/0soft";
      return;
    }
    const weight = normalizeSoftConstraintWeight($(`#${weightInputId}`).val());
    if (weight !== DEFAULT_SOFT_CONSTRAINT_WEIGHT) {
      overrides[constraint.name] = "0hard/" + weight + "soft";
    }
  });
  if (Object.keys(overrides).length === 0) {
    delete schedule.constraintWeightOverrides;
  } else {
    schedule.constraintWeightOverrides = overrides;
  }
  return schedule;
}

/**
 * Converts embedded lesson timeslot/room objects back to id strings before API calls.
 * Jackson on the server expects @JsonIdentityReference ids, not full nested objects.
 */
function normalizeScheduleReferencesForApi(schedule) {
  for (const lesson of schedule.lessons || []) {
    if (lesson.timeslot != null && typeof lesson.timeslot === "object") {
      lesson.timeslot = extractId(lesson.timeslot);
    }
    if (lesson.room != null && typeof lesson.room === "object") {
      lesson.room = extractId(lesson.room);
    }
  }
  return schedule;
}

function setupAjax() {
  $.ajaxSetup({
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json,text/plain', // plain text is required by solve() returning UUID of the solver job
    }
  });

  // Extend jQuery to support $.put() and $.delete()
  jQuery.each(["put", "delete"], function (i, method) {
    jQuery[method] = function (url, data, callback, type) {
      if (jQuery.isFunction(data)) {
        type = type || callback;
        callback = data;
        data = undefined;
      }
      return jQuery.ajax({
        url: url,
        type: method,
        dataType: type,
        data: data,
        success: callback
      });
    };
  });
}

/** True when the Preparation tab is the active main workflow tab. */
function isPreparationTabActive() {
  return $("#preparation").hasClass("active") || $("#navPreparation").hasClass("active");
}

function fetchDemoData() {
  $.get("/demo-data", function (data) {
    data.forEach(item => {
      $("#testDataButton").append($('<a id="' + item + 'TestData" class="dropdown-item" href="#">' + item + '</a>'));

      $("#" + item + "TestData").click(function (event) {
        event.preventDefault();
        switchDataDropDownItemActive(item);

        // On Preparation, load sample datasets into the authoring workspace instead of AI Scheduler.
        if (isPreparationTabActive()) {
          if (typeof window.loadDemoDatasetIntoPreparation === "function") {
            window.loadDemoDatasetIntoPreparation(item);
          } else {
            alert("Preparation module not loaded.");
          }
          return;
        }

        scheduleId = null;
        demoDataId = item;
        refreshSchedule();
      });
    });

    // Clear action below the dataset list so users can unload the current timetable.
    $("#testDataButton").append($('<div class="dropdown-divider"></div>'));
    $("#testDataButton").append(
      $('<a id="clearSampleData" class="dropdown-item text-danger" href="#">Clear all</a>')
    );
    $("#clearSampleData").click(function (event) {
      event.preventDefault();
      clearLoadedSampleData();
    });

    // AI Scheduler starts empty; datasets load only when the user picks one from Sample Data.
    renderClearedScheduleView();
  }).fail(function (xhr, ajaxOptions, thrownError) {
    // disable this page as there is no data
    let $demo = $("#demo");
    $demo.empty();
    $demo.html("<h1><p align=\"center\">No test data available</p></h1>")
  });
}

function switchDataDropDownItemActive(newItem) {
  activeCssClass = "active";
  $("#testDataButton > a." + activeCssClass).removeClass(activeCssClass);
  if (newItem != null) {
    $("#" + newItem + "TestData").addClass(activeCssClass);
  }
}

/**
 * Clears the currently loaded sample or custom timetable and resets Demo UI to an empty state.
 * Stops an active solver job first when one is running.
 */
function clearLoadedSampleData() {
  if (!confirm("Clear the loaded timetable and return to an empty workspace?")) {
    return;
  }

  const resetUi = function () {
    scheduleId = null;
    demoDataId = null;
    loadedSchedule = null;
    roomMap = new Map();
    timeslotMap = new Map();
    COLOR_MAP = new Map();
    nextColorIndex = 0;
    switchDataDropDownItemActive(null);
    renderClearedScheduleView();
    // Keep open schedule pop-out windows in sync with the cleared workspace.
    const emptyTimetable = { name: "", timeslots: [], rooms: [], lessons: [] };
    sessionStorage.setItem(SCHEDULE_POPOUT_STORAGE_KEY, JSON.stringify(emptyTimetable));
    sessionStorage.setItem(SCHEDULE_POPOUT_UPDATED_KEY, String(Date.now()));
    notifySchedulePopouts();
  };

  if (scheduleId != null) {
    $.delete("/timetables/" + scheduleId, function () {
      refreshSolvingButtons(false);
      resetUi();
    }).fail(function (xhr) {
      showError("Stop solving failed.", xhr);
      resetUi();
    });
    return;
  }

  refreshSolvingButtons(false);
  resetUi();
}

/** Renders Demo UI when no timetable is loaded. */
function renderClearedScheduleView() {
  $("body").removeClass("timetable-entity-drag-active");
  $(".timetable-lesson-dragging").removeClass("timetable-lesson-dragging");
  $(".timetable-drop-target").removeClass("timetable-drop-target");
  refreshSolvingButtons(false);
  renderScoreDisplay(null);
  $("#info").text("No sample data loaded. Choose a dataset from Sample Data or load prepared JSON.");

  $("#timetableByRoom").empty();
  $("#timetableByTeacher").empty();
  $("#timetableByStudentGroup").empty();

  const unassignedLessons = $("#unassignedLessons");
  unassignedLessons.empty();
  unassignedLessons.append(
    $('<div class="unassigned-sidebar-empty"/>')
      .append($('<p class="text-muted mb-0"/>').text("Load sample data or upload a timetable to begin."))
  );
  updateUnassignedLessonCount(0);
  refreshCustomLessonCardDatalists({ lessons: [], rooms: [], timeslots: [] });
}

function refreshSchedule() {
  let path = "/timetables/" + scheduleId;
  if (scheduleId === null) {
    if (demoDataId === null) {
      alert("Please select a test data set.");
      return;
    }

    path = "/demo-data/" + demoDataId;
  }

  $.getJSON(path, function (schedule) {
    loadedSchedule = schedule;
    updateScheduleMap(schedule);
    renderSchedule(schedule);
  })
    .fail(function (xhr, ajaxOptions, thrownError) {
      showError("Getting the timetable has failed.", xhr);
      refreshSolvingButtons(false);
    });
}

/**
 * Loads a custom timetable into Demo UI without fetching from the server.
 * Clears demo dataset selection and any active solver job.
 */
function loadCustomTimetable(timetable, sourceLabel) {
  scheduleId = null;
  demoDataId = null;
  switchDataDropDownItemActive(null);
  loadedSchedule = timetable;
  updateScheduleMap(timetable);
  renderSchedule(timetable);
  persistScheduleForPopouts(timetable);
  refreshSolvingButtons(isSolverRunning());
  if (sourceLabel) {
    const lessonCount = (timetable.lessons || []).length;
    $("#info").text("Loaded " + sourceLabel + " (" + lessonCount + " subject cards).");
  }
}

/** Exposed for Chat to Schedule tab to push agent timetables into Demo UI. */
window.loadCustomTimetable = loadCustomTimetable;

/**
 * Saves the current AI Scheduler timetable to browser cache.
 */
function saveScheduleToCache() {
  if (loadedSchedule == null) {
    alert("No timetable loaded. Load or solve a timetable first.");
    return;
  }
  try {
    localStorage.setItem(SCHEDULER_TIMETABLE_CACHE_KEY, JSON.stringify(loadedSchedule));
    alert("Timetable project saved to browser cache.");
  } catch (error) {
    alert("Failed to save to cache: " + error.message);
  }
}

/**
 * Loads a previously cached AI Scheduler timetable from browser cache.
 */
function loadScheduleFromCache() {
  const raw = localStorage.getItem(SCHEDULER_TIMETABLE_CACHE_KEY);
  if (!raw) {
    alert("No timetable project found in browser cache.");
    return;
  }
  try {
    const timetable = JSON.parse(raw);
    if (timetable.timeslots == null || timetable.lessons == null || timetable.rooms == null) {
      throw new Error("Cached data does not contain a valid timetable.");
    }
    loadCustomTimetable(timetable, "browser cache");
  } catch (error) {
    alert("Failed to load from cache: " + error.message);
  }
}

/**
 * Removes every subject card (lesson) from the current timetable while keeping timeslots and rooms.
 */
function clearAllSubjectCards() {
  if (loadedSchedule == null) {
    alert("No timetable loaded.");
    return;
  }
  if (!window.confirm("Clear all subject cards from the current timetable?")) {
    return;
  }
  if (isSolverRunning()) {
    alert("Stop solving before clearing subject cards.");
    return;
  }
  loadedSchedule.lessons = [];
  updateScheduleMap(loadedSchedule);
  renderSchedule(loadedSchedule);
  persistScheduleForPopouts(loadedSchedule);
  renderScoreDisplay(loadedSchedule.score || null);
  $("#info").text("All subject cards cleared.");
}

/**
 * Loads subject cards from browser cache (full workspace JSON saved on the Preparation tab
 * or by Save in the AI Scheduler subject-cards group).
 */
function loadPreparedTimetableFromCache() {
  if (typeof loadPreparationFromCacheObject !== "function") {
    alert("Preparation module not loaded.");
    return;
  }
  try {
    const cached = loadPreparationFromCacheObject();
    if (!cached) {
      alert("No subject cards found in browser cache. Save a workspace on the Preparation tab, or use Save in the subject-cards group first.");
      return;
    }
    const timetable = extractTimetableFromPreparedJson(cached);
    loadCustomTimetable(timetable, cached.name || "subject cards from cache");
  } catch (error) {
    alert("Failed to load from cache: " + error.message);
  }
}

/**
 * Saves the current scheduler lessons as a Preparation workspace in browser cache
 * so the Preparation tab can load and edit the same subject cards.
 */
function savePreparedSubjectCardsToCache() {
  if (loadedSchedule == null) {
    alert("No timetable loaded. Load or create subject cards first.");
    return;
  }
  if (typeof saveWorkspaceFromTimetableToCache !== "function") {
    alert("Preparation module not loaded.");
    return;
  }
  const cacheKey = window.PREPARATION_CACHE_KEY;
  const existing = cacheKey ? localStorage.getItem(cacheKey) : null;
  if (existing && !window.confirm(
    "Replace the Preparation workspace in browser cache with the current subject cards?"
  )) {
    return;
  }
  try {
    const workspace = saveWorkspaceFromTimetableToCache(loadedSchedule);
    const cardCount = (loadedSchedule.lessons || []).length;
    $("#info").text("Saved " + cardCount + " subject cards to Preparation cache.");
    alert("Subject cards saved to browser cache for the Preparation tab (" + (workspace.preparation.cards || []).length + " cards).");
  } catch (error) {
    alert("Failed to save subject cards: " + error.message);
  }
}

/**
 * Downloads the current scheduler lessons as a Preparation workspace JSON file.
 */
function downloadPreparedSubjectCardsJson() {
  if (loadedSchedule == null) {
    alert("No timetable loaded. Load or create subject cards first.");
    return;
  }
  if (typeof buildWorkspaceJsonFromTimetable !== "function") {
    alert("Preparation module not loaded.");
    return;
  }
  try {
    const workspace = buildWorkspaceJsonFromTimetable(loadedSchedule);
    const filename = "preparation-workspace.json";
    if (typeof downloadJsonFile === "function") {
      downloadJsonFile(workspace, filename);
    } else {
      const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }
    const cardCount = (loadedSchedule.lessons || []).length;
    $("#info").text("Downloaded " + cardCount + " subject cards as workspace JSON.");
  } catch (error) {
    alert("Failed to download subject cards: " + error.message);
  }
}

/**
 * Loads subject cards from a user-selected workspace or timetable JSON file.
 */
function loadPreparedTimetableFromFile(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const json = JSON.parse(event.target.result);
      const timetable = extractTimetableFromPreparedJson(json);
      loadCustomTimetable(timetable, file.name);
    } catch (error) {
      alert("Failed to load file: " + error.message);
    }
    fileInput.value = "";
  };
  reader.onerror = function () {
    alert("Failed to read file.");
    fileInput.value = "";
  };
  reader.readAsText(file);
}

/**
 * Builds a safe filename for exporting the current Demo UI timetable as JSON.
 */
function buildScheduleJsonFilename() {
  const baseName = demoDataId
    || (loadedSchedule != null && loadedSchedule.name ? loadedSchedule.name : "timetable");
  return String(baseName).trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    + "-schedule.json";
}

/**
 * Triggers a browser download of the currently loaded scheduled timetable JSON.
 */
function downloadScheduledTimetableJson() {
  if (loadedSchedule == null) {
    alert("No timetable loaded. Solve, load demo data, or upload a timetable first.");
    return;
  }
  const filename = buildScheduleJsonFilename();
  if (typeof downloadJsonFile === "function") {
    downloadJsonFile(loadedSchedule, filename);
  } else {
    const blob = new Blob([JSON.stringify(loadedSchedule, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
  alert("Downloaded: " + filename);
}

/**
 * Loads a timetable JSON file exported from Demo UI (raw timetable or workspace wrapper).
 */
function uploadScheduledTimetableFromFile(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const json = JSON.parse(event.target.result);
      const timetable = typeof extractTimetableFromPreparedJson === "function"
        ? extractTimetableFromPreparedJson(json)
        : json;
      if (timetable.timeslots == null || timetable.lessons == null || timetable.rooms == null) {
        throw new Error("File does not contain a valid timetable (timeslots, lessons, rooms).");
      }
      loadCustomTimetable(timetable, file.name);
      alert("Uploaded timetable: " + file.name);
    } catch (error) {
      alert("Failed to load timetable JSON: " + error.message);
    }
    fileInput.value = "";
  };
  reader.onerror = function () {
    alert("Failed to read file.");
    fileInput.value = "";
  };
  reader.readAsText(file);
}

function updateScheduleMap(timetable) {
  roomMap = new Map();
  timeslotMap = new Map();

  for (const roomEntry of timetable.rooms || []) {
    const room = typeof roomEntry === "object" ? roomEntry : { id: roomEntry, name: roomEntry };
    roomMap.set(room.id, room);
  }

  for (const timeslotEntry of timetable.timeslots || []) {
    const timeslot = typeof timeslotEntry === "object"
      ? timeslotEntry
      : { id: timeslotEntry, startTime: null, endTime: null, dayOfWeek: null };
    timeslotMap.set(timeslot.id, timeslot);
  }

  // Also index timeslots embedded on assigned lessons (e.g. after JSON round-trip).
  for (const lesson of timetable.lessons || []) {
    if (lesson.timeslot != null && typeof lesson.timeslot === "object" && lesson.timeslot.id != null) {
      timeslotMap.set(lesson.timeslot.id, lesson.timeslot);
    }
    if (lesson.room != null && typeof lesson.room === "object" && lesson.room.id != null) {
      roomMap.set(lesson.room.id, lesson.room);
    }
  }
}

/** Lesson length in minutes; defaults to 60 when omitted from JSON. */
function getLessonDurationMinutes(lesson) {
  return lesson.durationInMinutes == null ? 60 : lesson.durationInMinutes;
}

/** Number of 30-minute rows a lesson occupies. */
function getDurationSlotCount(lesson) {
  return getLessonDurationMinutes(lesson) / DEMO_SLOT_MINUTES;
}

/** Formats a minute total as a readable hour label, e.g. "6 hours" or "1.5 hours". */
function formatHoursLabel(totalMinutes) {
  const hours = totalMinutes / 60;
  const valueLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return `${valueLabel} ${hours === 1 ? "hour" : "hours"}`;
}

/** Sums lesson durations across the timetable (defaults missing durations to 60 minutes). */
function getTotalLessonMinutes(timetable) {
  return (timetable.lessons || []).reduce(
    (total, lesson) => total + getLessonDurationMinutes(lesson),
    0
  );
}

/** Total schedulable time represented by all timeslots (each slot is SLOT_MINUTES long). */
function getTotalTimeslotMinutes(timetable) {
  return (timetable.timeslots || []).length * DEMO_SLOT_MINUTES;
}

/**
 * Builds the dataset summary shown under the page title, including hour totals
 * so slot counts and lesson counts are easier to compare.
 */
function buildDatasetInfoText(timetable) {
  const lessonCount = timetable.lessons.length;
  const roomCount = timetable.rooms.length;
  const timeslotCount = timetable.timeslots.length;
  const lessonHoursLabel = formatHoursLabel(getTotalLessonMinutes(timetable));
  const timeslotHoursLabel = formatHoursLabel(getTotalTimeslotMinutes(timetable));
  return `This dataset has ${lessonCount} lessons (${lessonHoursLabel}) and ${roomCount} rooms `
    + `which need to be allocated to ${timeslotCount} timeslots (${timeslotHoursLabel}).`;
}

/** Human-readable duration label, e.g. 1h, 2.5h, 3h. */
function formatDurationLabel(durationMinutes) {
  const hours = durationMinutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
}

/** Returns violations array for a lesson (empty when none). */
function getLessonViolations(lesson) {
  return lesson.violations == null ? [] : lesson.violations;
}

/** True when the lesson has at least one hard-level violation. */
function hasHardViolations(lesson) {
  return getLessonViolations(lesson).some(v => v.scoreLevel === "hard");
}

/** Resolves the display name for a lesson's assigned room (null when unassigned). */
function getLessonRoomLabel(lesson) {
  if (lesson == null || lesson.room == null) {
    return null;
  }
  const room = roomMap.get(extractId(lesson.room));
  if (room != null && room.name != null) {
    return room.name;
  }
  const roomId = extractId(lesson.room);
  return roomId == null ? null : String(roomId);
}

function buildLessonCard(lesson, color, options) {
  options = options || {};
  const durationMinutes = getLessonDurationMinutes(lesson);
  const violations = getLessonViolations(lesson);
  const roomLabel = getLessonRoomLabel(lesson);
  const detailParts = [];
  if (roomLabel != null) {
    detailParts.push(roomLabel);
  }
  detailParts.push(formatDurationLabel(durationMinutes));
  detailParts.push(lesson.studentGroup);
  const $card = $(`<div class="card h-100 position-relative" style="background-color: ${color.bg};color: ${color.fg}"/>`)
    .append($(`<div class="card-body p-2"/>`)
      .append($(`<h5 class="card-title mb-1"/>`).text(lesson.subject))
      .append($(`<p class="card-text ms-2 mb-1"/>`)
        .append($(`<em/>`).text(`by ${lesson.teacher}`)))
      .append($(`<small class="ms-2 mt-1 card-text align-bottom float-end"/>`).text(lesson.id))
      .append($(`<p class="card-text ms-2 mb-0"/>`)
        .text(detailParts.join(" · "))));

  if (violations.length > 0) {
    const badgeClass = hasHardViolations(lesson) ? "bg-danger" : "bg-warning text-dark";
    $card.append($(`<span class="badge ${badgeClass} lesson-violation-badge"/>`)
      .append($(`<i class="fas fa-exclamation-triangle me-1"/>`))
      .append(String(violations.length)));
  }

  if (options.showAssignedActions) {
    const pinned = isLessonPinned(lesson);
    const $actions = $(`<div class="lesson-card-actions"/>`);
    $actions.append($(`<button type="button" class="btn btn-sm btn-light lesson-card-action-btn lesson-card-unassign-btn" title="Return to Unassigned Lessons"/>`)
      .append($(`<i class="fas fa-rotate-left"/>`)));
    $actions.append($(`<button type="button" class="btn btn-sm btn-light lesson-card-action-btn lesson-card-pin-btn${pinned ? " active" : ""}" title="${pinned ? "Unpin lesson" : "Pin lesson in this timeslot"}"/>`)
      .append($(`<i class="fas fa-thumbtack"/>`)));
    $card.append($actions);
  }

  if (options.showUnassignedActions) {
    const $actions = $(`<div class="lesson-card-actions lesson-card-actions-unassigned"/>`);
    // Edit opens a popup so the unassigned subject card can be updated in place.
    $actions.append($(`<button type="button" class="btn btn-sm btn-light lesson-card-action-btn lesson-card-edit-btn" title="Edit unassigned lesson"/>`)
      .append($(`<i class="fas fa-pen"/>`)));
    $actions.append($(`<button type="button" class="btn btn-sm btn-light lesson-card-action-btn lesson-card-remove-btn" title="Remove unassigned lesson"/>`)
      .append($(`<i class="fas fa-trash-can"/>`)));
    $card.append($actions);
  }

  const $wrapper = $(`<div class="timetable-lesson-card"/>`)
    .attr("data-lesson-id", lesson.id);
  if (options.showAssignedActions && isLessonPinned(lesson)) {
    $wrapper.addClass("timetable-lesson-card-pinned");
  }
  if (options.draggable) {
    $wrapper.addClass("timetable-lesson-draggable")
      .attr("draggable", "true")
      .attr("title", "Drag to assign on the timetable");
  }
  if (violations.length > 0) {
    $wrapper.addClass(hasHardViolations(lesson) ? "timetable-lesson-card-violation" : "timetable-lesson-card-violation-soft")
      .attr("title", "Click to view constraint violations");
  }
  $wrapper.append($card);
  return $wrapper;
}

/** Opens a modal listing every constraint violation for the clicked lesson. */
function showLessonViolationModal(lesson) {
  const violations = getLessonViolations(lesson);
  $("#lessonViolationModalLabel").text(`Constraint violations — ${lesson.subject} (${lesson.id})`);
  const $content = $("#lessonViolationModalContent");
  $content.empty();

  if (violations.length === 0) {
    $content.text("No violations for this lesson.");
  } else {
    const $table = $(`<table class="table table-sm"/>`);
    const $thead = $(`<thead/>`).append($(`<tr/>`)
      .append($(`<th/>`).text("Level"))
      .append($(`<th/>`).text("Constraint"))
      .append($(`<th/>`).text("Details"))
      .append($(`<th/>`).text("Related lessons")));
    $table.append($thead);
    const $tbody = $(`<tbody/>`);
    violations.forEach(violation => {
      const levelBadge = violation.scoreLevel === "hard"
        ? `<span class="badge bg-danger">hard</span>`
        : `<span class="badge bg-warning text-dark">soft</span>`;
      const related = (violation.relatedLessonIds == null || violation.relatedLessonIds.length === 0)
        ? "—"
        : violation.relatedLessonIds.join(", ");
      $tbody.append($(`<tr/>`)
        .append($(`<td/>`).html(levelBadge))
        .append($(`<td/>`).text(violation.constraintName))
        .append($(`<td/>`).text(violation.message))
        .append($(`<td/>`).text(related)));
    });
    $table.append($tbody);
    $content.append($table);
  }

  const modalInstance = new bootstrap.Modal("#lessonViolationModal");
  modalInstance.show();
}

/**
 * Returns the concrete 30-minute slots occupied by a lesson.
 * This uses wall-clock interval overlap, so a 2.5h lesson starting at 08:30 occupies the
 * 08:30, 09:00, 09:30, 10:00, and 10:30 rows.
 */
function getOccupiedTimeslotIds(timetable, startTimeslot, lesson) {
  const LocalTime = JSJoda.LocalTime;
  const lessonStart = LocalTime.parse(startTimeslot.startTime);
  const lessonEnd = lessonStart.plusMinutes(getLessonDurationMinutes(lesson));

  return timetable.timeslots
    .map(timeslotIdx => timeslotMap.get(extractId(timeslotIdx)))
    .filter(timeslot => {
      const slotStart = LocalTime.parse(timeslot.startTime);
      const slotEnd = LocalTime.parse(timeslot.endTime);
      return timeslot.dayOfWeek === startTimeslot.dayOfWeek
        && slotStart.compareTo(lessonEnd) < 0
        && lessonStart.compareTo(slotEnd) < 0;
    })
    .map(timeslot => timeslot.id);
}

/**
 * Formats a timeslot row label, e.g. "Monday 08:30 - 09:00".
 */
function formatTimeslotLabel(timeslot) {
  const LocalTime = JSJoda.LocalTime;
  const dayLabel = timeslot.dayOfWeek.charAt(0) + timeslot.dayOfWeek.slice(1).toLowerCase();
  const start = LocalTime.parse(timeslot.startTime).format(dateTimeFormatter);
  const end = LocalTime.parse(timeslot.endTime).format(dateTimeFormatter);
  return `${dayLabel} ${start} - ${end}`;
}

/** CSS class for weekday tint on Timeslot column labels (Mon–Fri). */
function getTimeslotDayCssClass(dayOfWeek) {
  switch (dayOfWeek) {
    case "MONDAY": return "timeslot-day-monday";
    case "TUESDAY": return "timeslot-day-tuesday";
    case "WEDNESDAY": return "timeslot-day-wednesday";
    case "THURSDAY": return "timeslot-day-thursday";
    case "FRIDAY": return "timeslot-day-friday";
    default: return "";
  }
}

/** True when this timeslot row is the mandatory hard lunch block (13:00–13:30). */
function isHardLunchTimeslot(timeslot) {
  return timeslot.startTime === "13:00:00";
}

/**
 * Maps each timeslot id to its 1-based grid row index (row 1 is the header row).
 */
function buildTimeslotRowIndexMap(timetable) {
  const rowIndexByTimeslotId = new Map();
  timetable.timeslots.forEach((timeslotIdx, index) => {
    const timeslot = timeslotMap.get(extractId(timeslotIdx));
    rowIndexByTimeslotId.set(timeslot.id, index + 2);
  });
  return rowIndexByTimeslotId;
}

/** Places ECA half-day blocks across all columns in a timetable grid. */
function placeEcaBlocksOnGrid(timetable, $grid, rowIndexByTimeslotId, colCount, startColumn = 2) {
  if (!timetable.ecaBlocks || timetable.ecaBlocks.length === 0 || colCount === 0) {
    return;
  }
  for (const block of timetable.ecaBlocks) {
    const rows = (block.timeslotIds || [])
      .map(id => rowIndexByTimeslotId.get(id))
      .filter(row => row != null)
      .sort((a, b) => a - b);
    if (rows.length === 0) {
      continue;
    }
    const startRow = rows[0];
    const rowSpan = rows[rows.length - 1] - startRow + 1;

    $grid.append(
      $('<div class="timetable-eca-block"/>')
        .text(block.label || "ECA")
        .attr("title", "Extra-Curricular Activity — no regular lessons scheduled")
        .css({
          gridRow: startRow + " / span " + rowSpan,
          gridColumn: `${startColumn} / span ${colCount}`
        })
    );
  }
}

/**
 * Calculates CSS grid placement for a lesson: start row, row span, and truncation flag.
 * Row span equals the number of visible 30-minute rows the lesson occupies.
 */
function getLessonGridPlacement(timetable, startTimeslot, lesson, rowIndexByTimeslotId) {
  const occupiedTimeslotIds = getOccupiedTimeslotIds(timetable, startTimeslot, lesson);
  const expectedSpan = getDurationSlotCount(lesson);
  if (occupiedTimeslotIds.length === 0) {
    return null;
  }
  const occupiedRows = occupiedTimeslotIds
    .map(id => rowIndexByTimeslotId.get(id))
    .filter(row => row != null)
    .sort((a, b) => a - b);
  if (occupiedRows.length === 0) {
    return null;
  }
  const startRow = occupiedRows[0];
  const rowSpan = occupiedRows[occupiedRows.length - 1] - startRow + 1;
  const truncated = occupiedRows.length < expectedSpan || rowSpan < expectedSpan;

  return { startRow, rowSpan, truncated };
}

/**
 * Builds the CSS grid skeleton: sticky header, one fixed-height row per timeslot, and background cells.
 * When viewType is set, cells receive drop-target metadata for manual drag-and-drop scheduling.
 */
function buildTimetableGrid($container, timetable, columnHeaders, viewType) {
  const timeslots = timetable.timeslots.map(timeslotIdx => timeslotMap.get(extractId(timeslotIdx)));
  const rowCount = timeslots.length;
  const colCount = columnHeaders.length;

  const $grid = $('<div class="timetable-grid"/>');
  $grid.css({
    gridTemplateColumns: `minmax(11rem, auto) repeat(${colCount}, minmax(9rem, 1fr))`,
    gridTemplateRows: `auto repeat(${rowCount}, var(--timetable-slot-height))`
  });

  $grid.append($('<div class="timetable-grid-header timetable-grid-corner"/>').text('Timeslot')
    .css({ gridRow: 1, gridColumn: 1 }));

columnHeaders.forEach((header, colIndex) => {
      const $header = $('<div class="timetable-grid-header"/>').css({ gridRow: 1, gridColumn: colIndex + 2 });
      $header.append($('<span/>').text(header.label));
      if (header.extraContent != null) {
        const $extraContent = typeof header.extraContent === 'function' ? header.extraContent() : header.extraContent;
        if ($extraContent) {
          $header.append($extraContent);
          attachRoomPriorityEditor($extraContent, header.key);
        }
      }
      $grid.append($header);
    });

  timeslots.forEach((timeslot, rowIndex) => {
    const gridRow = rowIndex + 2;
    const dayCssClass = getTimeslotDayCssClass(timeslot.dayOfWeek);
    const $label = $('<div class="timetable-grid-timeslot-label"/>')
      .addClass(dayCssClass)
      .text(formatTimeslotLabel(timeslot))
      .css({ gridRow, gridColumn: 1 });
    if (isHardLunchTimeslot(timeslot)) {
      $label.addClass("timeslot-lunch-hard");
    }
    $grid.append($label);

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
      const header = columnHeaders[colIndex];
      const $cell = $('<div class="timetable-grid-cell timetable-drop-cell"/>')
        .css({ gridRow, gridColumn: colIndex + 2 });
      if (viewType != null) {
        $cell.attr("data-view-type", viewType)
          .attr("data-timeslot-id", timeslot.id)
          .attr("data-column-key", header.key)
          .attr("data-column-label", header.label);
      }
      $grid.append($cell);
    }
  });

  $container.append($grid);
  return { $grid, rowIndexByTimeslotId: buildTimeslotRowIndexMap(timetable) };
}

/** Returns sorted weekdays present in the loaded timetable. */
function getUniqueWeekdaysFromTimetable(timetable) {
  const daySet = new Set();
  for (const timeslotIdx of timetable.timeslots) {
    daySet.add(timeslotMap.get(extractId(timeslotIdx)).dayOfWeek);
  }
  return WEEKDAY_COLUMN_ORDER.filter(day => daySet.has(day));
}

/** Returns unique time-of-day rows (start/end) sorted chronologically for weekly grids. */
function getUniqueTimeRowsFromTimetable(timetable) {
  const rowByStartTime = new Map();
  for (const timeslotIdx of timetable.timeslots) {
    const timeslot = timeslotMap.get(extractId(timeslotIdx));
    if (!rowByStartTime.has(timeslot.startTime)) {
      rowByStartTime.set(timeslot.startTime, {
        startTime: timeslot.startTime,
        endTime: timeslot.endTime
      });
    }
  }
  return Array.from(rowByStartTime.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Formats a weekly-grid row label, e.g. "08:30 - 09:00". */
function formatTimeRowLabel(timeRow) {
  const start = JSJoda.LocalTime.parse(timeRow.startTime).format(dateTimeFormatter);
  const end = JSJoda.LocalTime.parse(timeRow.endTime).format(dateTimeFormatter);
  return start + " - " + end;
}

/** Human-readable weekday column header, e.g. "Monday". */
function formatWeekdayColumnLabel(dayOfWeek) {
  return dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
}

/**
 * Builds a weekly CSS grid: time rows × weekday columns.
 * Returns maps from startTime and dayOfWeek to 1-based grid indices.
 */
function buildWeekdayTimetableGrid($container, weekdays, timeRows) {
  const rowCount = timeRows.length;
  const colCount = weekdays.length;

  const $grid = $('<div class="timetable-grid"/>');
  $grid.css({
    gridTemplateColumns: "minmax(7rem, auto) repeat(" + colCount + ", minmax(9rem, 1fr))",
    gridTemplateRows: "auto repeat(" + rowCount + ", var(--timetable-slot-height))"
  });

  $grid.append($('<div class="timetable-grid-header timetable-grid-corner"/>').text("Time")
    .css({ gridRow: 1, gridColumn: 1 }));

  const colIndexByDay = new Map();
  weekdays.forEach((dayOfWeek, colIndex) => {
    const gridColumn = colIndex + 2;
    colIndexByDay.set(dayOfWeek, gridColumn);
    $grid.append(
      $('<div class="timetable-grid-header"/>')
        .addClass(getTimeslotDayCssClass(dayOfWeek))
        .text(formatWeekdayColumnLabel(dayOfWeek))
        .css({ gridRow: 1, gridColumn: gridColumn })
    );
  });

  const rowIndexByStartTime = new Map();
  timeRows.forEach((timeRow, rowIndex) => {
    const gridRow = rowIndex + 2;
    rowIndexByStartTime.set(timeRow.startTime, gridRow);
    const $label = $('<div class="timetable-grid-timeslot-label"/>')
      .text(formatTimeRowLabel(timeRow))
      .css({ gridRow: gridRow, gridColumn: 1 });
    if (timeRow.startTime === "13:00:00") {
      $label.addClass("timeslot-lunch-hard");
    }
    $grid.append($label);

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
      $grid.append($('<div class="timetable-grid-cell"/>')
        .css({ gridRow: gridRow, gridColumn: colIndex + 2 }));
    }
  });

  $container.append($grid);
  return { $grid, rowIndexByStartTime, colIndexByDay };
}

/** Grid placement for a lesson on a weekly weekday-column grid. */
function getWeekdayGridPlacement(timetable, startTimeslot, lesson, rowIndexByStartTime) {
  const expectedSpan = getDurationSlotCount(lesson);

  const LocalTime = JSJoda.LocalTime;
  const lessonStart = LocalTime.parse(startTimeslot.startTime);
  const lessonEnd = lessonStart.plusMinutes(getLessonDurationMinutes(lesson));
  const occupiedRows = [];

  for (const timeslotEntry of timetable.timeslots) {
    const timeslot = timeslotMap.get(extractId(timeslotEntry));
    if (timeslot == null || timeslot.dayOfWeek !== startTimeslot.dayOfWeek) {
      continue;
    }
    const slotStart = LocalTime.parse(timeslot.startTime);
    const slotEnd = LocalTime.parse(timeslot.endTime);
    if (slotStart.compareTo(lessonEnd) < 0 && lessonStart.compareTo(slotEnd) < 0) {
      const row = rowIndexByStartTime.get(timeslot.startTime);
      if (row != null) {
        occupiedRows.push(row);
      }
    }
  }

  if (occupiedRows.length === 0) {
    return null;
  }

  occupiedRows.sort((a, b) => a - b);
  const startRow = occupiedRows[0];
  const rowSpan = occupiedRows[occupiedRows.length - 1] - startRow + 1;
  const truncated = occupiedRows.length < expectedSpan || rowSpan < expectedSpan;
  return { startRow, rowSpan, truncated };
}

/** Places ECA blocks in the matching weekday column, spanning reserved time rows. */
function placeEcaBlocksOnWeekdayGrid(timetable, $grid, rowIndexByStartTime, colIndexByDay) {
  if (!timetable.ecaBlocks || timetable.ecaBlocks.length === 0) {
    return;
  }
  for (const block of timetable.ecaBlocks) {
    const gridColumn = colIndexByDay.get(block.dayOfWeek);
    if (gridColumn == null) {
      continue;
    }
    const rows = (block.timeslotIds || [])
      .map(id => timeslotMap.get(id))
      .filter(timeslot => timeslot != null)
      .map(timeslot => rowIndexByStartTime.get(timeslot.startTime))
      .filter(row => row != null)
      .sort((a, b) => a - b);
    if (rows.length === 0) {
      continue;
    }
    const startRow = rows[0];
    const rowSpan = rows[rows.length - 1] - startRow + 1;
    $grid.append(
      $('<div class="timetable-eca-block"/>')
        .text(block.label || "ECA")
        .attr("title", "Extra-Curricular Activity — no regular lessons scheduled")
        .css({
          gridRow: startRow + " / span " + rowSpan,
          gridColumn: gridColumn
        })
    );
  }
}

/** Populates By Weekday room/teacher/group selectors; preserves selection when still valid. */
function populateWeekdaySelectors(timetable) {
  const rooms = timetable.rooms
    .map(roomIdx => roomMap.get(extractId(roomIdx)))
    .filter(room => room != null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const teachers = [...new Set(timetable.lessons.map(lesson => lesson.teacher))].sort();
  const studentGroups = [...new Set(timetable.lessons.map(lesson => lesson.studentGroup))].sort();

  const $roomSelect = $("#weekdayRoomSelect").empty();
  for (const room of rooms) {
    $roomSelect.append($("<option/>").val(room.id).text(room.name));
  }

  const $teacherSelect = $("#weekdayTeacherSelect").empty();
  for (const teacher of teachers) {
    $teacherSelect.append($("<option/>").val(teacher).text(teacher));
  }

  const $groupSelect = $("#weekdayStudentGroupSelect").empty();
  for (const group of studentGroups) {
    $groupSelect.append($("<option/>").val(group).text(group));
  }

  if (selectedWeekdayRoom != null && rooms.some(room => room.id === selectedWeekdayRoom)) {
    $roomSelect.val(selectedWeekdayRoom);
  } else if (rooms.length > 0) {
    $roomSelect.val(rooms[0].id);
  }
  if (selectedWeekdayTeacher != null && teachers.includes(selectedWeekdayTeacher)) {
    $teacherSelect.val(selectedWeekdayTeacher);
  } else if (teachers.length > 0) {
    $teacherSelect.val(teachers[0]);
  }
  if (selectedWeekdayStudentGroup != null && studentGroups.includes(selectedWeekdayStudentGroup)) {
    $groupSelect.val(selectedWeekdayStudentGroup);
  } else if (studentGroups.length > 0) {
    $groupSelect.val(studentGroups[0]);
  }

  selectedWeekdayRoom = $roomSelect.val() || null;
  selectedWeekdayTeacher = $teacherSelect.val() || null;
  selectedWeekdayStudentGroup = $groupSelect.val() || null;
}

/** Returns true when a lesson belongs to the given weekday entity (room / teacher / group). */
function lessonMatchesWeekdayEntity(lesson, mode, entityKey) {
  if (lesson == null || entityKey == null) {
    return false;
  }
  if (mode === ENTITY_VIEW_ROOM) {
    const room = roomMap.get(extractId(lesson.room));
    return room != null && room.id === entityKey;
  }
  if (mode === ENTITY_VIEW_TEACHER) {
    return lesson.teacher === entityKey;
  }
  if (mode === ENTITY_VIEW_STUDENT_GROUP) {
    return lesson.studentGroup === entityKey;
  }
  return false;
}

/**
 * Builds one weekday (Mon–Fri × time) grid for a single room, teacher, or student group.
 * Reused by View weekday and the Export gallery.
 */
function renderOneWeekdayEntityGrid(timetable, $container, mode, entityKey) {
  $container.empty();
  if (timetable == null || timetable.timeslots == null || timetable.timeslots.length === 0 || entityKey == null) {
    return null;
  }

  const weekdays = getUniqueWeekdaysFromTimetable(timetable);
  const timeRows = getUniqueTimeRowsFromTimetable(timetable);
  if (weekdays.length === 0 || timeRows.length === 0) {
    return null;
  }

  const grid = buildWeekdayTimetableGrid($container, weekdays, timeRows);
  placeEcaBlocksOnWeekdayGrid(timetable, grid.$grid, grid.rowIndexByStartTime, grid.colIndexByDay);

  for (const lesson of timetable.lessons) {
    if (lesson.timeslot == null || lesson.room == null) {
      continue;
    }
    if (!lessonMatchesWeekdayEntity(lesson, mode, entityKey)) {
      continue;
    }
    const timeslot = timeslotMap.get(extractId(lesson.timeslot));
    if (timeslot == null) {
      continue;
    }
    const color = pickColor(lesson.subject);
    const lessonElement = buildLessonCard(lesson, color);
    const placement = getWeekdayGridPlacement(timetable, timeslot, lesson, grid.rowIndexByStartTime);
    const gridColumn = grid.colIndexByDay.get(timeslot.dayOfWeek);
    if (placement != null && gridColumn != null) {
      placeLessonOnGrid(grid.$grid, lessonElement, placement.startRow, gridColumn,
        placement.rowSpan, placement.truncated);
    }
  }
  return grid;
}

/** Lists exportable entities for the given mode (sorted labels + keys). */
function listExportEntities(timetable, mode) {
  if (timetable == null) {
    return [];
  }
  if (mode === ENTITY_VIEW_ROOM) {
    return (timetable.rooms || [])
      .map(roomIdx => roomMap.get(extractId(roomIdx)))
      .filter(room => room != null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(room => ({ key: room.id, label: room.name }));
  }
  if (mode === ENTITY_VIEW_TEACHER) {
    return [...new Set((timetable.lessons || []).map(lesson => lesson.teacher))]
      .filter(name => name != null && name !== "")
      .sort()
      .map(name => ({ key: name, label: name }));
  }
  if (mode === ENTITY_VIEW_STUDENT_GROUP) {
    return [...new Set((timetable.lessons || []).map(lesson => lesson.studentGroup))]
      .filter(name => name != null && name !== "")
      .sort()
      .map(name => ({ key: name, label: name }));
  }
  return [];
}

/** Syncs Export mode pill active state from selectedExportMode. */
function syncExportModeButtons() {
  $(".export-mode-btn").removeClass("active");
  $(`.export-mode-btn[data-export-mode="${selectedExportMode}"]`).addClass("active");
}

/** Applies column layout and zoom controls to the Export gallery UI. */
function applyExportLayoutControls() {
  $(".export-columns-btn").removeClass("active");
  $(`.export-columns-btn[data-export-columns="${selectedExportColumns}"]`).addClass("active");
  $("#exportTimetableGallery").attr("data-export-columns", String(selectedExportColumns));
  applyExportZoom();
}

/** Clamps and applies Export gallery zoom; updates the percent label. */
function setExportZoom(zoomPercent) {
  selectedExportZoom = Math.min(EXPORT_ZOOM_MAX, Math.max(EXPORT_ZOOM_MIN, zoomPercent));
  applyExportZoom();
  saveSchedulePopoutViewState();
}

/** Writes the current zoom percent onto the gallery (CSS zoom) and label. */
function applyExportZoom() {
  $("#exportTimetableGallery").css("zoom", selectedExportZoom / 100);
  $("#exportZoomLabel").text(selectedExportZoom + "%");
}

/** Fixed card width (rem) so every export table is the same size for a given weekday count. */
function getExportCardWidthRem(weekdayCount) {
  const days = Math.max(1, weekdayCount);
  // Grid content width + horizontal card padding (border-box)
  return EXPORT_TIME_COL_REM + days * EXPORT_DAY_COL_REM + EXPORT_CARD_PADDING_REM;
}

/** Forces every export weekday grid to use the same fixed time/day column widths. */
function standardizeExportGridSize($card, weekdayCount) {
  const days = Math.max(1, weekdayCount);
  const gridWidthRem = EXPORT_TIME_COL_REM + days * EXPORT_DAY_COL_REM;
  const template = EXPORT_TIME_COL_REM + "rem repeat(" + days + ", " + EXPORT_DAY_COL_REM + "rem)";
  $card.css("width", getExportCardWidthRem(days) + "rem");
  $card.find(".timetable-grid").css({
    width: gridWidthRem + "rem",
    minWidth: gridWidthRem + "rem",
    maxWidth: gridWidthRem + "rem",
    gridTemplateColumns: template
  });
}

/** Human-readable label for the current export mode (used in filenames). */
function getExportModeFileLabel(mode) {
  if (mode === ENTITY_VIEW_TEACHER) {
    return "teacher";
  }
  if (mode === ENTITY_VIEW_STUDENT_GROUP) {
    return "student-group";
  }
  return "room";
}

/** Renders all entity weekly grids for the active Export mode in a multi-column gallery. */
function renderExportView(timetable) {
  const $gallery = $("#exportTimetableGallery");
  $gallery.empty();
  applyExportLayoutControls();
  if (timetable == null || timetable.timeslots == null || timetable.timeslots.length === 0) {
    return;
  }

  const entities = listExportEntities(timetable, selectedExportMode);
  if (entities.length === 0) {
    $gallery.append($('<p class="text-muted"/>').text("No entities to export for this view."));
    return;
  }

  const weekdayCount = getUniqueWeekdaysFromTimetable(timetable).length;
  const cardWidthRem = getExportCardWidthRem(weekdayCount);
  $gallery.css("--export-card-width", cardWidthRem + "rem");

  for (const entity of entities) {
    const $card = $('<div class="export-timetable-card"/>')
      .attr("data-export-entity-key", entity.key)
      .attr("data-export-entity-label", entity.label);
    $card.append($('<h2 class="export-timetable-card-title h6 mb-2"/>').text(entity.label));
    const $gridWrapper = $('<div class="timetable-grid-wrapper export-timetable-grid-wrapper"/>');
    $card.append($gridWrapper);
    $gallery.append($card);
    renderOneWeekdayEntityGrid(timetable, $gridWrapper, selectedExportMode, entity.key);
    // Normalize widths so every table matches (time + equal weekday columns)
    standardizeExportGridSize($card, weekdayCount);
  }
}

/** Triggers download of a Blob as a named file. */
function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Escapes a CSV field (quotes when needed). */
function escapeCsvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

/** Computes lesson end time string (HH:mm) from start timeslot + duration. */
function getLessonEndTimeString(startTimeslot, lesson) {
  if (startTimeslot == null || startTimeslot.startTime == null) {
    return "";
  }
  const LocalTime = JSJoda.LocalTime;
  return LocalTime.parse(startTimeslot.startTime)
    .plusMinutes(getLessonDurationMinutes(lesson))
    .format(dateTimeFormatter);
}

/** Compact lesson label for one export timetable cell (matches on-page card info). */
function formatExportLessonCellText(lesson, mode) {
  const roomLabel = getLessonRoomLabel(lesson);
  const parts = [lesson.subject];
  if (mode === ENTITY_VIEW_ROOM) {
    parts.push("by " + lesson.teacher);
    parts.push(lesson.studentGroup);
  } else if (mode === ENTITY_VIEW_TEACHER) {
    parts.push(lesson.studentGroup);
    if (roomLabel != null) {
      parts.push(roomLabel);
    }
  } else {
    parts.push("by " + lesson.teacher);
    if (roomLabel != null) {
      parts.push(roomLabel);
    }
  }
  return parts.filter(part => part != null && part !== "").join(" | ");
}

/** Map key for one weekday × time-row cell in the export timetable spreadsheet. */
function makeExportTimetableCellKey(dayOfWeek, startTime) {
  return dayOfWeek + "|" + startTime;
}

/**
 * Builds spreadsheet rows as weekly timetable grids (Time × Mon–Fri), one block per entity.
 * Matches the Export webpage layout; entities are separated by a blank row.
 */
function buildExportSpreadsheetRows(timetable, mode) {
  const rows = [];
  if (timetable == null || timetable.timeslots == null || timetable.timeslots.length === 0) {
    return rows;
  }

  const weekdays = getUniqueWeekdaysFromTimetable(timetable);
  const timeRows = getUniqueTimeRowsFromTimetable(timetable);
  const entities = listExportEntities(timetable, mode);
  if (weekdays.length === 0 || timeRows.length === 0 || entities.length === 0) {
    return rows;
  }

  for (const entity of entities) {
    // Blank separator between entity timetable blocks
    if (rows.length > 0) {
      rows.push([]);
    }
    // Entity title (same as the card heading on the webpage)
    rows.push([entity.label]);
    // Header row: Time + weekday columns
    rows.push(["Time"].concat(weekdays.map(formatWeekdayColumnLabel)));

    // cellKey -> list of cell text fragments (lessons / ECA)
    const cellTexts = new Map();

    const addCellText = function (dayOfWeek, startTime, text) {
      if (dayOfWeek == null || startTime == null || text == null || text === "") {
        return;
      }
      const key = makeExportTimetableCellKey(dayOfWeek, startTime);
      if (!cellTexts.has(key)) {
        cellTexts.set(key, []);
      }
      const list = cellTexts.get(key);
      if (!list.includes(text)) {
        list.push(text);
      }
    };

    // Place lessons into every occupied timeslot cell (mirrors spanning cards on the grid)
    for (const lesson of timetable.lessons) {
      if (lesson.timeslot == null || lesson.room == null) {
        continue;
      }
      if (!lessonMatchesWeekdayEntity(lesson, mode, entity.key)) {
        continue;
      }
      const startTimeslot = timeslotMap.get(extractId(lesson.timeslot));
      if (startTimeslot == null) {
        continue;
      }
      const label = formatExportLessonCellText(lesson, mode);
      for (const timeslotId of getOccupiedTimeslotIds(timetable, startTimeslot, lesson)) {
        const occupied = timeslotMap.get(timeslotId);
        if (occupied != null) {
          addCellText(occupied.dayOfWeek, occupied.startTime, label);
        }
      }
    }

    // ECA blocks appear on weekday grids for every entity (same as the webpage)
    if (timetable.ecaBlocks != null) {
      for (const block of timetable.ecaBlocks) {
        const ecaLabel = "ECA: " + (block.label || "ECA");
        for (const timeslotId of block.timeslotIds || []) {
          const timeslot = timeslotMap.get(timeslotId);
          if (timeslot != null) {
            addCellText(timeslot.dayOfWeek, timeslot.startTime, ecaLabel);
          }
        }
      }
    }

    // One spreadsheet row per time-of-day row
    for (const timeRow of timeRows) {
      const row = [formatTimeRowLabel(timeRow)];
      for (const dayOfWeek of weekdays) {
        const texts = cellTexts.get(makeExportTimetableCellKey(dayOfWeek, timeRow.startTime)) || [];
        row.push(texts.join(" / "));
      }
      rows.push(row);
    }
  }
  return rows;
}

/** Downloads all entity timetables for the current export mode as CSV (grid layout). */
function downloadExportCsv() {
  if (loadedSchedule == null) {
    alert("No timetable loaded.");
    return;
  }
  const rows = buildExportSpreadsheetRows(loadedSchedule, selectedExportMode);
  const csv = rows.map(row => row.map(escapeCsvField).join(",")).join("\r\n");
  const filename = "timetable-" + getExportModeFileLabel(selectedExportMode) + ".csv";
  downloadBlobFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** Downloads all entity timetables for the current export mode as an Excel workbook (.xlsx). */
function downloadExportExcel() {
  if (loadedSchedule == null) {
    alert("No timetable loaded.");
    return;
  }
  if (typeof XLSX === "undefined") {
    alert("Excel library is still loading. Wait a moment and try again.");
    return;
  }
  const rows = buildExportSpreadsheetRows(loadedSchedule, selectedExportMode);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Timetable");
  const filename = "timetable-" + getExportModeFileLabel(selectedExportMode) + ".xlsx";
  XLSX.writeFile(workbook, filename);
}

/** Sanitizes a string for use as a PNG filename inside a ZIP. */
function sanitizeExportFilename(label) {
  return String(label).replace(/[\\/:*?"<>|]+/g, "_").trim() || "timetable";
}

/** Captures each export card as PNG and downloads them as a ZIP archive. */
async function downloadExportPngZip() {
  if (loadedSchedule == null) {
    alert("No timetable loaded.");
    return;
  }
  if (typeof html2canvas === "undefined" || typeof JSZip === "undefined") {
    alert("PNG export libraries are still loading. Wait a moment and try again.");
    return;
  }

  const cards = document.querySelectorAll("#exportTimetableGallery .export-timetable-card");
  if (cards.length === 0) {
    alert("Nothing to export.");
    return;
  }

  const $button = $("#exportPngZipButton");
  const originalLabel = $button.html();
  $button.prop("disabled", true).text("Generating PNGs…");

  try {
    const zip = new JSZip();
    let index = 1;
    for (const card of cards) {
      const label = card.getAttribute("data-export-entity-label") || ("entity-" + index);
      const canvas = await html2canvas(card, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true
      });
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const padded = String(index).padStart(2, "0");
      zip.file(padded + "-" + sanitizeExportFilename(label) + ".png", base64, { base64: true });
      index += 1;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlobFile(blob, "timetable-" + getExportModeFileLabel(selectedExportMode) + "-pngs.zip");
  } catch (error) {
    console.error("PNG ZIP export failed.", error);
    alert("Failed to generate PNG ZIP: " + (error && error.message ? error.message : error));
  } finally {
    $button.prop("disabled", false).html(originalLabel);
  }
}

/** Downloads a standalone HTML file containing the current export gallery. */
async function downloadExportHtml() {
  if (loadedSchedule == null) {
    alert("No timetable loaded.");
    return;
  }
  const gallery = document.getElementById("exportTimetableGallery");
  if (gallery == null || gallery.children.length === 0) {
    alert("Nothing to export.");
    return;
  }

  let sharedCss = "";
  try {
    const response = await fetch("/timetable-shared.css");
    if (response.ok) {
      sharedCss = await response.text();
    }
  } catch (error) {
    console.warn("Could not load timetable-shared.css for HTML export.", error);
  }

  const modeLabel = getExportModeFileLabel(selectedExportMode);
  const title = "Exported " + modeLabel + " timetables";
  const html = "<!DOCTYPE html>\n"
    + "<html lang=\"en\">\n<head>\n"
    + "<meta charset=\"UTF-8\">\n"
    + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    + "<title>" + title + "</title>\n"
    + "<style>\n"
    + sharedCss + "\n"
    + "body { font-family: system-ui, sans-serif; margin: 1rem; color: #212529; }\n"
    + ".export-standalone-title { margin-bottom: 1rem; }\n"
    + ".card { border: 1px solid rgba(0,0,0,.125); border-radius: 0.25rem; }\n"
    + ".card-body { flex: 1 1 auto; }\n"
    + ".h-100 { height: 100%; }\n"
    + ".mb-0 { margin-bottom: 0; }\n"
    + ".mb-1 { margin-bottom: 0.25rem; }\n"
    + ".ms-2 { margin-left: 0.5rem; }\n"
    + ".mt-1 { margin-top: 0.25rem; }\n"
    + ".p-2 { padding: 0.5rem; }\n"
    + ".position-relative { position: relative; }\n"
    + ".float-end { float: right; }\n"
    + "</style>\n</head>\n<body>\n"
    + "<h1 class=\"export-standalone-title h4\">" + title + "</h1>\n"
    + gallery.outerHTML + "\n"
    + "</body>\n</html>\n";

  downloadBlobFile(new Blob([html], { type: "text/html;charset=utf-8" }), "timetable-" + modeLabel + ".html");
}

/** Renders weekly timetable grids for the selected room, teacher, and student group. */
function renderWeekdayView(timetable) {
  const $roomContainer = $("#timetableByWeekdayRoom");
  const $teacherContainer = $("#timetableByWeekdayTeacher");
  const $groupContainer = $("#timetableByWeekdayStudentGroup");
  $roomContainer.empty();
  $teacherContainer.empty();
  $groupContainer.empty();

  if (timetable == null || timetable.timeslots.length === 0) {
    return;
  }

  const roomId = $("#weekdayRoomSelect").val();
  const teacherName = $("#weekdayTeacherSelect").val();
  const studentGroupName = $("#weekdayStudentGroupSelect").val();
  selectedWeekdayRoom = roomId;
  selectedWeekdayTeacher = teacherName;
  selectedWeekdayStudentGroup = studentGroupName;

  if (roomId != null) {
    renderOneWeekdayEntityGrid(timetable, $roomContainer, ENTITY_VIEW_ROOM, roomId);
  }
  if (teacherName != null) {
    renderOneWeekdayEntityGrid(timetable, $teacherContainer, ENTITY_VIEW_TEACHER, teacherName);
  }
  if (studentGroupName != null) {
    renderOneWeekdayEntityGrid(timetable, $groupContainer, ENTITY_VIEW_STUDENT_GROUP, studentGroupName);
  }
}

/** Shows common-free or replacement controls based on the selected filter mode. */
function updateFilterControlsVisibility() {
  const isReplacement = selectedFilterMode === FILTER_MODE_REPLACEMENT;
  $("#filterCommonFreeControls").toggleClass("d-none", isReplacement);
  $("#filterReplacementControls").toggleClass("d-none", !isReplacement);
}

/** Returns all timeslot ids occupied by a teacher's lessons on one weekday. */
function getTeacherBusyTimeslotIdsOnDay(timetable, teacherName, dayOfWeek) {
  const busyIds = new Set();
  for (const lesson of getLessonsForPartyOnDay(timetable, FILTER_PARTY_TYPE_TEACHER, teacherName, dayOfWeek)) {
    const startTimeslot = timeslotMap.get(extractId(lesson.timeslot));
    for (const timeslotId of getOccupiedTimeslotIds(timetable, startTimeslot, lesson)) {
      busyIds.add(timeslotId);
    }
  }
  return busyIds;
}

/**
 * Returns timeslot ids to highlight for one replacement teacher:
 * target teacher is teaching, potential teacher is free, and slot is not ECA-blocked.
 */
function getReplacementHighlightTimeslotIds(timetable, targetBusyIds, potentialTeacher, dayTimeslots) {
  const highlighted = new Set();
  for (const timeslot of dayTimeslots) {
    if (!targetBusyIds.has(timeslot.id)) {
      continue;
    }
    if (isEcaBlockedTimeslot(timetable, timeslot.id)) {
      continue;
    }
    if (!isPartyBusyAtTimeslot(timetable, FILTER_PARTY_TYPE_TEACHER, potentialTeacher, timeslot)) {
      highlighted.add(timeslot.id);
    }
  }
  return highlighted;
}

/** Returns sorted teacher or student group names available in the timetable. */
function getFilterParties(timetable, partyType) {
  if (partyType === FILTER_PARTY_TYPE_STUDENT_GROUP) {
    return [...new Set(timetable.lessons.map(lesson => lesson.studentGroup))].sort();
  }
  return [...new Set(timetable.lessons.map(lesson => lesson.teacher))].sort();
}

/** Stable column key for a teacher or student group (avoids name collisions across types). */
function makeFilterPartyKey(partyType, partyName) {
  return partyType + ":" + partyName;
}

/** Normalizes a multi-select value to a string array. */
function normalizeMultiSelectValue(value) {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** Column header label distinguishing teachers from student groups. */
function formatFilterPartyHeader(party) {
  if (party.type === FILTER_PARTY_TYPE_TEACHER) {
    return party.name + " (teacher)";
  }
  return party.name + " (group)";
}

/** Builds the combined selected-party list from preserved teacher and group selections. */
function getSelectedFilterParties() {
  const parties = [];
  for (const name of selectedFilterTeachers) {
    parties.push({
      type: FILTER_PARTY_TYPE_TEACHER,
      name,
      key: makeFilterPartyKey(FILTER_PARTY_TYPE_TEACHER, name)
    });
  }
  for (const name of selectedFilterStudentGroups) {
    parties.push({
      type: FILTER_PARTY_TYPE_STUDENT_GROUP,
      name,
      key: makeFilterPartyKey(FILTER_PARTY_TYPE_STUDENT_GROUP, name)
    });
  }
  return parties;
}

/** Returns assigned lessons for one party on a specific weekday. */
function getLessonsForPartyOnDay(timetable, partyType, partyName, dayOfWeek) {
  return timetable.lessons.filter(lesson => {
    if (lesson.timeslot == null || lesson.room == null) {
      return false;
    }
    const timeslot = timeslotMap.get(extractId(lesson.timeslot));
    if (timeslot.dayOfWeek !== dayOfWeek) {
      return false;
    }
    return partyType === FILTER_PARTY_TYPE_TEACHER
      ? lesson.teacher === partyName
      : lesson.studentGroup === partyName;
  });
}

/** True when the party has an assigned lesson overlapping the given timeslot. */
function isPartyBusyAtTimeslot(timetable, partyType, partyName, timeslot) {
  for (const lesson of getLessonsForPartyOnDay(timetable, partyType, partyName, timeslot.dayOfWeek)) {
    const startTimeslot = timeslotMap.get(extractId(lesson.timeslot));
    const occupiedTimeslotIds = getOccupiedTimeslotIds(timetable, startTimeslot, lesson);
    if (occupiedTimeslotIds.includes(timeslot.id)) {
      return true;
    }
  }
  return false;
}

/** True when the timeslot is reserved by an ECA half-day block. */
function isEcaBlockedTimeslot(timetable, timeslotId) {
  if (timetable.ecaBlocks == null || timetable.ecaBlocks.length === 0) {
    return false;
  }
  return timetable.ecaBlocks.some(block => (block.timeslotIds || []).includes(timeslotId));
}

/** True when every selected party is free and the slot is not blocked by ECA. */
function isCommonFreeTimeslot(timetable, parties, timeslot) {
  if (parties.length === 0) {
    return false;
  }
  if (isEcaBlockedTimeslot(timetable, timeslot.id)) {
    return false;
  }
  return parties.every(party => !isPartyBusyAtTimeslot(timetable, party.type, party.name, timeslot));
}

/** Returns timeslots for one weekday, sorted chronologically. */
function getTimeslotsForDay(timetable, dayOfWeek) {
  return timetable.timeslots
    .map(timeslotIdx => timeslotMap.get(extractId(timeslotIdx)))
    .filter(timeslot => timeslot.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Reads current By Filter control values into preserved state variables. */
function syncFilterStateFromControls() {
  selectedFilterDay = $("#filterDaySelect").val() || null;
  selectedFilterMode = $("#filterModeSelect").val() || FILTER_MODE_COMMON_FREE;
  selectedFilterTeachers = normalizeMultiSelectValue($("#filterTeacherSelect").val());
  selectedFilterStudentGroups = normalizeMultiSelectValue($("#filterStudentGroupSelect").val());
  selectedFilterTargetTeacher = $("#filterTargetTeacherSelect").val() || null;
  selectedFilterReplacementTeachers = normalizeMultiSelectValue($("#filterReplacementTeacherSelect").val());
}

/** Populates weekday and mode-specific controls; preserves valid selections. */
function populateFilterControls(timetable) {
  const weekdays = getUniqueWeekdaysFromTimetable(timetable);
  const $daySelect = $("#filterDaySelect").empty();
  for (const dayOfWeek of weekdays) {
    $daySelect.append($("<option/>").val(dayOfWeek).text(formatWeekdayColumnLabel(dayOfWeek)));
  }

  if (selectedFilterDay != null && weekdays.includes(selectedFilterDay)) {
    $daySelect.val(selectedFilterDay);
  } else if (weekdays.length > 0) {
    $daySelect.val(weekdays[0]);
  }

  if (selectedFilterMode === FILTER_MODE_REPLACEMENT) {
    $("#filterModeSelect").val(FILTER_MODE_REPLACEMENT);
  } else {
    $("#filterModeSelect").val(FILTER_MODE_COMMON_FREE);
    selectedFilterMode = FILTER_MODE_COMMON_FREE;
  }

  populateFilterTeacherSelect(timetable);
  populateFilterStudentGroupSelect(timetable);
  populateFilterReplacementSelects(timetable);
  updateFilterControlsVisibility();
  syncFilterStateFromControls();
}

/** Populates the teacher multi-select and preserves valid selections. */
function populateFilterTeacherSelect(timetable) {
  const teachers = getFilterParties(timetable, FILTER_PARTY_TYPE_TEACHER);
  const $teacherSelect = $("#filterTeacherSelect").empty();
  for (const teacherName of teachers) {
    $teacherSelect.append($("<option/>").val(teacherName).text(teacherName));
  }

  const validSelection = selectedFilterTeachers.filter(name => teachers.includes(name));
  if (validSelection.length > 0) {
    $teacherSelect.val(validSelection);
  } else if (teachers.length > 0 && selectedFilterTeachers.length === 0
      && selectedFilterStudentGroups.length === 0) {
    // Default to the first teacher when nothing is selected yet.
    $teacherSelect.val([teachers[0]]);
  }
}

/** Populates the student group multi-select and preserves valid selections. */
function populateFilterStudentGroupSelect(timetable) {
  const studentGroups = getFilterParties(timetable, FILTER_PARTY_TYPE_STUDENT_GROUP);
  const $groupSelect = $("#filterStudentGroupSelect").empty();
  for (const groupName of studentGroups) {
    $groupSelect.append($("<option/>").val(groupName).text(groupName));
  }

  const validSelection = selectedFilterStudentGroups.filter(name => studentGroups.includes(name));
  if (validSelection.length > 0) {
    $groupSelect.val(validSelection);
  }
}

/** Populates target and potential replacement teacher selects. */
function populateFilterReplacementSelects(timetable) {
  const teachers = getFilterParties(timetable, FILTER_PARTY_TYPE_TEACHER);
  const $targetSelect = $("#filterTargetTeacherSelect").empty();
  for (const teacherName of teachers) {
    $targetSelect.append($("<option/>").val(teacherName).text(teacherName));
  }

  if (selectedFilterTargetTeacher != null && teachers.includes(selectedFilterTargetTeacher)) {
    $targetSelect.val(selectedFilterTargetTeacher);
  } else if (teachers.length > 0) {
    $targetSelect.val(teachers[0]);
    selectedFilterTargetTeacher = teachers[0];
  }

  populateFilterReplacementTeacherSelect(timetable);
}

/** Populates potential replacement teachers (excludes the selected target teacher). */
function populateFilterReplacementTeacherSelect(timetable) {
  const teachers = getFilterParties(timetable, FILTER_PARTY_TYPE_TEACHER);
  const targetTeacher = $("#filterTargetTeacherSelect").val() || selectedFilterTargetTeacher;
  const candidates = teachers.filter(name => name !== targetTeacher);
  const $replacementSelect = $("#filterReplacementTeacherSelect").empty();
  for (const teacherName of candidates) {
    $replacementSelect.append($("<option/>").val(teacherName).text(teacherName));
  }

  const validSelection = selectedFilterReplacementTeachers.filter(name => candidates.includes(name));
  if (validSelection.length > 0) {
    $replacementSelect.val(validSelection);
  } else if (candidates.length > 0 && selectedFilterReplacementTeachers.length === 0) {
    $replacementSelect.val([candidates[0]]);
  }
}

/**
 * Builds a single-day filter grid.
 * options.lastColumnLabel: optional trailing column (e.g. "Common free"); omit for replacement mode.
 * options.rowHighlightTimeslotIds: highlights time label + last column (common free mode).
 * options.highlightByPartyKey: Map partyKey -> Set timeslotId for per-column highlights (replacement mode).
 * options.highlightCellClass: CSS class for highlighted cells (default filter-common-free).
 * options.headerClassByPartyKey: optional Map partyKey -> header CSS class.
 */
function buildFilterDayGrid($container, dayTimeslots, parties, options) {
  options = options || {};
  const lastColumnLabel = options.lastColumnLabel || null;
  const rowHighlightTimeslotIds = options.rowHighlightTimeslotIds || new Set();
  const highlightByPartyKey = options.highlightByPartyKey || new Map();
  const highlightCellClass = options.highlightCellClass || "filter-common-free";
  const headerClassByPartyKey = options.headerClassByPartyKey || new Map();

  const rowCount = dayTimeslots.length;
  const hasLastColumn = lastColumnLabel != null;
  const lastDataColumn = parties.length + 1;
  const lastColumn = hasLastColumn ? parties.length + 2 : lastDataColumn;

  let gridColumns = "minmax(7rem, auto) repeat(" + parties.length + ", minmax(9rem, 1fr))";
  if (hasLastColumn) {
    gridColumns += " minmax(7rem, auto)";
  }

  const $grid = $('<div class="timetable-grid"/>');
  $grid.css({
    gridTemplateColumns: gridColumns,
    gridTemplateRows: "auto repeat(" + rowCount + ", var(--timetable-slot-height))"
  });

  $grid.append($('<div class="timetable-grid-header timetable-grid-corner"/>').text("Time")
    .css({ gridRow: 1, gridColumn: 1 }));

  const colIndexByParty = new Map();
  parties.forEach((party, colIndex) => {
    const gridColumn = colIndex + 2;
    colIndexByParty.set(party.key, gridColumn);
    const headerLabel = party.headerLabel != null ? party.headerLabel : formatFilterPartyHeader(party);
    const $header = $('<div class="timetable-grid-header"/>')
      .text(headerLabel)
      .css({ gridRow: 1, gridColumn: gridColumn });
    const headerClass = headerClassByPartyKey.get(party.key);
    if (headerClass != null) {
      $header.addClass(headerClass);
    }
    $grid.append($header);
  });

  if (hasLastColumn) {
    $grid.append(
      $('<div class="timetable-grid-header filter-common-free-header"/>')
        .text(lastColumnLabel)
        .css({ gridRow: 1, gridColumn: lastColumn })
    );
  }

  const rowIndexByTimeslotId = new Map();
  dayTimeslots.forEach((timeslot, rowIndex) => {
    const gridRow = rowIndex + 2;
    rowIndexByTimeslotId.set(timeslot.id, gridRow);
    const isRowHighlighted = rowHighlightTimeslotIds.has(timeslot.id);
    const timeRow = { startTime: timeslot.startTime, endTime: timeslot.endTime };
    const $label = $('<div class="timetable-grid-timeslot-label"/>')
      .text(formatTimeRowLabel(timeRow))
      .css({ gridRow: gridRow, gridColumn: 1 });
    if (isHardLunchTimeslot(timeslot)) {
      $label.addClass("timeslot-lunch-hard");
    }
    if (isRowHighlighted) {
      $label.addClass(highlightCellClass);
    }
    $grid.append($label);

    parties.forEach((party, colIndex) => {
      const partyHighlights = highlightByPartyKey.get(party.key);
      const isPartyHighlighted = partyHighlights != null && partyHighlights.has(timeslot.id);
      const $cell = $('<div class="timetable-grid-cell"/>')
        .css({ gridRow: gridRow, gridColumn: colIndex + 2 });
      if (isPartyHighlighted) {
        $cell.addClass(highlightCellClass);
      }
      $grid.append($cell);
    });

    if (hasLastColumn) {
      const $lastCell = $('<div class="timetable-grid-cell"/>')
        .css({ gridRow: gridRow, gridColumn: lastColumn });
      if (isRowHighlighted) {
        $lastCell.addClass(highlightCellClass);
      }
      $grid.append($lastCell);
    }
  });

  $container.append($grid);
  return { $grid, rowIndexByTimeslotId, colIndexByParty, lastColumn };
}

/** Places ECA blocks across all data columns on the filter grid. */
function placeEcaBlocksOnFilterGrid(timetable, dayOfWeek, $grid, rowIndexByTimeslotId, lastColumn) {
  if (!timetable.ecaBlocks || timetable.ecaBlocks.length === 0) {
    return;
  }
  for (const block of timetable.ecaBlocks) {
    if (block.dayOfWeek !== dayOfWeek) {
      continue;
    }
    const rows = (block.timeslotIds || [])
      .map(id => rowIndexByTimeslotId.get(id))
      .filter(row => row != null)
      .sort((a, b) => a - b);
    if (rows.length === 0) {
      continue;
    }
    const startRow = rows[0];
    const rowSpan = rows[rows.length - 1] - startRow + 1;
    $grid.append(
      $('<div class="timetable-eca-block"/>')
        .text(block.label || "ECA")
        .attr("title", "Extra-Curricular Activity — no regular lessons scheduled")
        .css({
          gridRow: startRow + " / span " + rowSpan,
          gridColumn: "2 / span " + (lastColumn - 1)
        })
    );
  }
}

/** Updates the common-free summary message above the filter grid. */
function updateCommonFreeFilterSummary(dayOfWeek, parties, commonFreeCount) {
  const dayLabel = formatWeekdayColumnLabel(dayOfWeek);
  if (parties.length === 0) {
    $("#filterSummary").text("Select at least one teacher or student group to find common free time.");
    return;
  }
  const teacherCount = parties.filter(party => party.type === FILTER_PARTY_TYPE_TEACHER).length;
  const groupCount = parties.filter(party => party.type === FILTER_PARTY_TYPE_STUDENT_GROUP).length;
  const partyParts = [];
  if (teacherCount > 0) {
    partyParts.push(teacherCount + " teacher" + (teacherCount === 1 ? "" : "s"));
  }
  if (groupCount > 0) {
    partyParts.push(groupCount + " student group" + (groupCount === 1 ? "" : "s"));
  }
  const slotLabel = commonFreeCount === 1 ? "slot" : "slots";
  $("#filterSummary").text(
    commonFreeCount + " common free " + slotLabel + " on " + dayLabel +
    " for " + partyParts.join(" and ") + ".");
}

/** Updates the replacement summary message above the filter grid. */
function updateReplacementFilterSummary(dayOfWeek, targetTeacher, replacementTeachers, targetLessonSlotCount, highlightCounts) {
  const dayLabel = formatWeekdayColumnLabel(dayOfWeek);
  if (targetTeacher == null) {
    $("#filterSummary").text("Select a target teacher for replacement search.");
    return;
  }
  if (replacementTeachers.length === 0) {
    $("#filterSummary").text("Select at least one potential replacement teacher.");
    return;
  }
  const slotLabel = targetLessonSlotCount === 1 ? "slot" : "slots";
  const parts = replacementTeachers.map((name, index) => {
    const count = highlightCounts[index];
    return name + ": " + count + " free";
  });
  $("#filterSummary").text(
    targetTeacher + " has " + targetLessonSlotCount + " lesson " + slotLabel + " on " + dayLabel +
    ". Replacement windows — " + parts.join("; ") + ".");
}

/** Places lessons for selected filter grid columns on the chosen weekday. */
function placeFilterGridLessons(timetable, dayOfWeek, grid, parties) {
  const partyKeys = new Set(parties.map(party => party.key));
  for (const lesson of timetable.lessons) {
    if (lesson.timeslot == null || lesson.room == null) {
      continue;
    }
    const timeslot = timeslotMap.get(extractId(lesson.timeslot));
    if (timeslot.dayOfWeek !== dayOfWeek) {
      continue;
    }

    const teacherKey = makeFilterPartyKey(FILTER_PARTY_TYPE_TEACHER, lesson.teacher);
    const groupKey = makeFilterPartyKey(FILTER_PARTY_TYPE_STUDENT_GROUP, lesson.studentGroup);
    const placement = getLessonGridPlacement(timetable, timeslot, lesson, grid.rowIndexByTimeslotId);
    if (placement == null) {
      continue;
    }

    const color = pickColor(lesson.subject);
    const lessonElement = buildLessonCard(lesson, color);

    if (partyKeys.has(teacherKey)) {
      const teacherColumn = grid.colIndexByParty.get(teacherKey);
      if (teacherColumn != null) {
        placeLessonOnGrid(grid.$grid, lessonElement, placement.startRow, teacherColumn,
          placement.rowSpan, placement.truncated);
      }
    }

    if (partyKeys.has(groupKey)) {
      const groupColumn = grid.colIndexByParty.get(groupKey);
      if (groupColumn != null) {
        placeLessonOnGrid(grid.$grid, lessonElement, placement.startRow, groupColumn,
          placement.rowSpan, placement.truncated);
      }
    }
  }
}

/** Renders common-free mode for the By Filter tab. */
function renderCommonFreeFilterView(timetable, dayOfWeek, dayTimeslots, $container) {
  const parties = getSelectedFilterParties();
  if (parties.length === 0) {
    updateCommonFreeFilterSummary(dayOfWeek, parties, 0);
    return;
  }

  const commonFreeTimeslotIds = new Set();
  for (const timeslot of dayTimeslots) {
    if (isCommonFreeTimeslot(timetable, parties, timeslot)) {
      commonFreeTimeslotIds.add(timeslot.id);
    }
  }

  const grid = buildFilterDayGrid($container, dayTimeslots, parties, {
    lastColumnLabel: "Common free",
    rowHighlightTimeslotIds: commonFreeTimeslotIds,
    highlightCellClass: "filter-common-free"
  });
  placeEcaBlocksOnFilterGrid(timetable, dayOfWeek, grid.$grid, grid.rowIndexByTimeslotId, grid.lastColumn);
  placeFilterGridLessons(timetable, dayOfWeek, grid, parties);
  updateCommonFreeFilterSummary(dayOfWeek, parties, commonFreeTimeslotIds.size);
}

/** Renders replacement mode for the By Filter tab. */
function renderReplacementFilterView(timetable, dayOfWeek, dayTimeslots, $container) {
  const targetTeacher = selectedFilterTargetTeacher;
  const replacementTeachers = selectedFilterReplacementTeachers;

  if (targetTeacher == null) {
    updateReplacementFilterSummary(dayOfWeek, null, [], 0, []);
    return;
  }
  if (replacementTeachers.length === 0) {
    updateReplacementFilterSummary(dayOfWeek, targetTeacher, [], 0, []);
    return;
  }

  const targetBusyIds = getTeacherBusyTimeslotIdsOnDay(timetable, targetTeacher, dayOfWeek);
  const parties = [{
    type: FILTER_PARTY_TYPE_TEACHER,
    name: targetTeacher,
    key: makeFilterPartyKey(FILTER_PARTY_TYPE_TEACHER, targetTeacher),
    headerLabel: targetTeacher + " (target)"
  }];

  const highlightByPartyKey = new Map();
  const headerClassByPartyKey = new Map();
  const highlightCounts = [];

  for (const replacementTeacher of replacementTeachers) {
    const partyKey = makeFilterPartyKey(FILTER_PARTY_TYPE_TEACHER, replacementTeacher);
    const highlightIds = getReplacementHighlightTimeslotIds(
      timetable, targetBusyIds, replacementTeacher, dayTimeslots);
    highlightByPartyKey.set(partyKey, highlightIds);
    headerClassByPartyKey.set(partyKey, "filter-replacement-header");
    highlightCounts.push(highlightIds.size);
    parties.push({
      type: FILTER_PARTY_TYPE_TEACHER,
      name: replacementTeacher,
      key: partyKey,
      headerLabel: replacementTeacher + " (replacement)"
    });
  }

  const grid = buildFilterDayGrid($container, dayTimeslots, parties, {
    highlightByPartyKey,
    headerClassByPartyKey,
    highlightCellClass: "filter-replacement-available"
  });
  placeEcaBlocksOnFilterGrid(timetable, dayOfWeek, grid.$grid, grid.rowIndexByTimeslotId, grid.lastColumn);
  placeFilterGridLessons(timetable, dayOfWeek, grid, parties);
  updateReplacementFilterSummary(
    dayOfWeek, targetTeacher, replacementTeachers, targetBusyIds.size, highlightCounts);
}

/** Renders the By Filter single-day availability grid for the active filter mode. */
function renderFilterView(timetable) {
  const $container = $("#timetableByFilter");
  $container.empty();

  if (timetable == null || timetable.timeslots.length === 0) {
    $("#filterSummary").text("Load or solve a timetable to use By Filter.");
    return;
  }

  syncFilterStateFromControls();
  updateFilterControlsVisibility();
  const dayOfWeek = selectedFilterDay;

  if (dayOfWeek == null) {
    $("#filterSummary").text("No weekday available in this timetable.");
    return;
  }

  const dayTimeslots = getTimeslotsForDay(timetable, dayOfWeek);
  if (dayTimeslots.length === 0) {
    $("#filterSummary").text("No timeslots on the selected weekday.");
    return;
  }

  if (selectedFilterMode === FILTER_MODE_REPLACEMENT) {
    renderReplacementFilterView(timetable, dayOfWeek, dayTimeslots, $container);
  } else {
    renderCommonFreeFilterView(timetable, dayOfWeek, dayTimeslots, $container);
  }
}

/**
 * Places a lesson card on the grid using grid-row span so visual height matches duration.
 */
function placeLessonOnGrid($grid, lessonElement, gridRow, gridColumn, rowSpan, truncated) {
  // Row span + align-self:stretch fills the grid area; avoid minHeight that can bleed over 1px grid lines.
  const $wrapper = $('<div class="timetable-lesson"/>')
    .css({
      gridRow: `${gridRow} / span ${rowSpan}`,
      gridColumn
    });
  if (truncated) {
    $wrapper.addClass('timetable-lesson-truncated')
      .attr('title', 'Lesson extends beyond visible schedule rows; card height may be clipped.');
  }
  $wrapper.append(lessonElement.clone(true));
  $grid.append($wrapper);
}

/** True when the solver is actively running for the current schedule job. */
function isSolverRunning() {
  return loadedSchedule != null
    && loadedSchedule.solverStatus != null
    && loadedSchedule.solverStatus !== "NOT_SOLVING";
}

/** True when the lesson is pinned and must keep its current assignment. */
function isLessonPinned(lesson) {
  return lesson != null && lesson.pinned === true;
}

/** True when the lesson has both a timeslot and room (shown on the timetable grid). */
function isLessonAssigned(lesson) {
  return lesson != null && lesson.timeslot != null && lesson.room != null;
}

/** Clears assignment fields so the lesson returns to Unassigned Lessons. */
function unassignLessonManually(lesson) {
  lesson.timeslot = null;
  lesson.room = null;
  // An unassigned card has no teacher/group grid column placement.
  lesson.manualTeacherPlacement = null;
  lesson.manualStudentGroupPlacement = null;
  lesson.pinned = false;
  lesson.violations = [];
}

/**
 * Returns every assigned lesson in the loaded timetable to Unassigned Lessons.
 * Pinned lessons are unassigned as well; the score is recalculated afterwards.
 */
function resetTimetable() {
  if (loadedSchedule == null || isSolverRunning()) {
    return;
  }
  const assignedLessons = loadedSchedule.lessons.filter(isLessonAssigned);
  if (assignedLessons.length === 0) {
    return;
  }
  const confirmed = window.confirm(
    "Return all " + assignedLessons.length + " assigned lesson(s) to Unassigned?"
  );
  if (!confirmed) {
    return;
  }
  assignedLessons.forEach(unassignLessonManually);
  refreshScoreAfterManualMove();
}

/** Toggles pin state for a placed lesson and re-renders the schedule. */
function toggleLessonPin(lessonId) {
  const lesson = findLessonById(lessonId);
  if (lesson == null || !isLessonAssigned(lesson)) {
    return;
  }
  lesson.pinned = !isLessonPinned(lesson);
  renderSchedule(loadedSchedule);
}

/**
 * True when a pinned lesson in the target column overlaps the dropped lesson's duration window.
 * Drops onto pinned occupied slots are rejected instead of displacing the pinned card.
 */
function hasPinnedOverlapInTargetColumn(movedLesson, viewType, columnKey, columnLabel, startTimeslot) {
  const occupiedIds = new Set(getOccupiedTimeslotIds(loadedSchedule, startTimeslot, movedLesson));
  for (const lesson of loadedSchedule.lessons) {
    if (lesson.id === movedLesson.id || !isLessonPinned(lesson) || lesson.timeslot == null) {
      continue;
    }
    if (!isLessonInEntityColumn(lesson, viewType, columnKey, columnLabel)) {
      continue;
    }
    const lessonStart = timeslotMap.get(extractId(lesson.timeslot));
    if (lessonStart == null) {
      continue;
    }
    const lessonOccupiedIds = getOccupiedTimeslotIds(loadedSchedule, lessonStart, lesson);
    if (lessonOccupiedIds.some(id => occupiedIds.has(id))) {
      return true;
    }
  }
  return false;
}

/** Finds a lesson in the loaded schedule by planning id. */
function findLessonById(lessonId) {
  if (loadedSchedule == null || lessonId == null) {
    return null;
  }
  return loadedSchedule.lessons.find(lesson => lesson.id === lessonId) || null;
}

/**
 * Removes an unassigned lesson from the current timetable after user confirmation.
 * Assigned lessons cannot be removed through this action.
 */
function removeUnassignedLesson(lessonId) {
  if (loadedSchedule == null) {
    return;
  }
  const lesson = findLessonById(lessonId);
  if (lesson == null || isLessonAssigned(lesson)) {
    return;
  }
  const confirmed = window.confirm(
    "Remove unassigned lesson " + lesson.subject + " (" + lesson.id + ")?"
  );
  if (!confirmed) {
    return;
  }
  loadedSchedule.lessons = loadedSchedule.lessons.filter(item => item.id !== lessonId);
  updateScheduleMap(loadedSchedule);
  renderSchedule(loadedSchedule);
}

/** Lesson ID currently shown in the unassigned-card edit popup. */
let editingUnassignedLessonId = null;

/** Bootstrap modal instance for editing an unassigned subject card. */
let editLessonCardModal = null;

/** Binds the unassigned-card edit popup form. */
function initEditLessonCardModal() {
  const modalElement = document.getElementById("editLessonCardModal");
  if (modalElement == null) {
    return;
  }
  editLessonCardModal = new bootstrap.Modal(modalElement);
  $("#editLessonCardForm").submit(function (event) {
    event.preventDefault();
    saveEditedLessonCard();
  });
  $(modalElement).on("hidden.bs.modal", function () {
    editingUnassignedLessonId = null;
  });
}

/** Short weekday label for compact checkboxes, e.g. "Mon". */
function formatWeekdayShortLabel(dayOfWeek) {
  return formatWeekdayColumnLabel(dayOfWeek).slice(0, 3);
}

/** Builds Mon–Fri preferred-weekday checkboxes for the edit popup. */
function fillEditLessonPreferredWeekdays(selectedDays) {
  const selected = new Set(selectedDays || []);
  const $container = $("#editLessonPreferredWeekdays").empty();
  for (const dayOfWeek of WEEKDAY_COLUMN_ORDER) {
    const checkboxId = "editLessonWeekday_" + dayOfWeek;
    const $item = $(`<div class="form-check"/>`);
    $item.append($(`<input class="form-check-input" type="checkbox"/>`)
      .attr("id", checkboxId)
      .attr("value", dayOfWeek)
      .prop("checked", selected.has(dayOfWeek)));
    $item.append($(`<label class="form-check-label"/>`)
      .attr("for", checkboxId)
      .text(formatWeekdayShortLabel(dayOfWeek)));
    $container.append($item);
  }
}

/** Builds eligible-classroom checkboxes from rooms on the loaded timetable. */
function fillEditLessonRoomCheckboxes(lesson) {
  const $container = $("#editLessonRoomCheckboxes").empty();
  const rooms = loadedSchedule?.rooms || [];
  if (rooms.length === 0) {
    $container.append($(`<div class="text-muted small"/>`).text("No classrooms in this timetable."));
    return;
  }
  const allowedIds = lesson.allowedRoomIds || [];
  // Empty allowedRoomIds means every room is eligible.
  const checkAll = allowedIds.length === 0;
  const allowedSet = new Set(allowedIds);
  for (const room of rooms) {
    const roomId = extractId(room);
    const roomName = room.name || String(roomId);
    const checkboxId = "editLessonRoom_" + convertToId(String(roomId));
    const $item = $(`<div class="form-check"/>`);
    $item.append($(`<input class="form-check-input" type="checkbox"/>`)
      .attr("id", checkboxId)
      .attr("value", roomId)
      .prop("checked", checkAll || allowedSet.has(roomId)));
    $item.append($(`<label class="form-check-label"/>`)
      .attr("for", checkboxId)
      .text(roomName));
    $container.append($item);
  }
}

/** Builds parallel-subject checkboxes for every other lesson in the timetable. */
function fillEditLessonParallelCheckboxes(lesson) {
  const $container = $("#editLessonParallelCheckboxes").empty();
  const others = (loadedSchedule?.lessons || []).filter(item => item.id !== lesson.id);
  if (others.length === 0) {
    $container.append($(`<div class="text-muted small"/>`).text("No other subject cards to link."));
    return;
  }
  const linkedIds = new Set(lesson.parallelCardIds || []);
  for (const other of others) {
    const checkboxId = "editLessonParallel_" + convertToId(String(other.id));
    const label = other.subject + " — " + other.studentGroup + " (" + other.id + ")";
    const $item = $(`<div class="form-check"/>`);
    $item.append($(`<input class="form-check-input" type="checkbox"/>`)
      .attr("id", checkboxId)
      .attr("value", other.id)
      .prop("checked", linkedIds.has(other.id)));
    $item.append($(`<label class="form-check-label"/>`)
      .attr("for", checkboxId)
      .text(label));
    $container.append($item);
  }
}

/**
 * Opens the edit popup for an unassigned subject card.
 * Assigned lessons cannot be edited through this action.
 */
function showEditLessonCardModal(lessonId) {
  if (loadedSchedule == null) {
    return;
  }
  const lesson = findLessonById(lessonId);
  if (lesson == null || isLessonAssigned(lesson)) {
    return;
  }
  editingUnassignedLessonId = lessonId;
  $("#editLessonCardModalLabel").text("Edit subject card — " + lesson.subject + " (" + lesson.id + ")");
  $("#editLessonSubjectInput").val(lesson.subject || "");
  $("#editLessonSubjectTypesInput").val((lesson.subjectTypes || []).join(", "));
  $("#editLessonTeacherInput").val(lesson.teacher || "");
  $("#editLessonStudentGroupInput").val(lesson.studentGroup || "");
  $("#editLessonDurationInput").val(getLessonDurationMinutes(lesson));
  // Missing preferredWeekdays defaults to all weekdays, matching Preparation cards.
  const preferredDays = lesson.preferredWeekdays == null
    ? WEEKDAY_COLUMN_ORDER.slice()
    : lesson.preferredWeekdays;
  fillEditLessonPreferredWeekdays(preferredDays);
  fillEditLessonRoomCheckboxes(lesson);
  fillEditLessonParallelCheckboxes(lesson);
  refreshCustomLessonCardDatalists(loadedSchedule);
  if (editLessonCardModal != null) {
    editLessonCardModal.show();
  }
}

/** Copies teacher-unavailable days from another lesson with the same teacher name. */
function findTeacherUnavailableDays(teacherName, excludeLessonId) {
  const other = (loadedSchedule?.lessons || []).find(item =>
    item.id !== excludeLessonId
    && item.teacher === teacherName
    && Array.isArray(item.teacherUnavailableDays));
  return other == null ? [] : other.teacherUnavailableDays.slice();
}

/**
 * Keeps parallel-subject links two-way when the edited card's partners change.
 */
function syncLessonParallelLinks(lesson, selectedPartnerIds) {
  const previousIds = lesson.parallelCardIds || [];
  const nextIds = selectedPartnerIds.slice();
  for (const oldId of previousIds) {
    if (nextIds.includes(oldId)) {
      continue;
    }
    const partner = findLessonById(oldId);
    if (partner != null) {
      partner.parallelCardIds = (partner.parallelCardIds || []).filter(id => id !== lesson.id);
    }
  }
  for (const newId of nextIds) {
    const partner = findLessonById(newId);
    if (partner == null) {
      continue;
    }
    if (partner.parallelCardIds == null) {
      partner.parallelCardIds = [];
    }
    if (!partner.parallelCardIds.includes(lesson.id)) {
      partner.parallelCardIds.push(lesson.id);
    }
  }
  lesson.parallelCardIds = nextIds;
}

/**
 * Applies the edit-popup form to the unassigned lesson and re-renders the Demo UI.
 */
function saveEditedLessonCard() {
  if (loadedSchedule == null || editingUnassignedLessonId == null) {
    return;
  }
  if (isSolverRunning()) {
    showWarning("Solver is running", "Stop solving before editing subject cards.");
    return;
  }
  const lesson = findLessonById(editingUnassignedLessonId);
  if (lesson == null || isLessonAssigned(lesson)) {
    showWarning("Cannot edit", "Only unassigned subject cards can be edited.");
    return;
  }

  const subject = $("#editLessonSubjectInput").val().trim();
  const teacher = $("#editLessonTeacherInput").val().trim();
  const studentGroup = $("#editLessonStudentGroupInput").val().trim();
  const subjectTypes = parseCustomLessonSubjectTypes($("#editLessonSubjectTypesInput").val());
  const durationRaw = $("#editLessonDurationInput").val().trim();
  const durationInMinutes = durationRaw === "" ? 60 : parseInt(durationRaw, 10);
  const preferredWeekdays = $("#editLessonPreferredWeekdays input[type='checkbox']:checked")
    .map(function () { return this.value; })
    .get();
  const allowedRoomIds = $("#editLessonRoomCheckboxes input[type='checkbox']:checked")
    .map(function () { return this.value; })
    .get();
  const parallelCardIds = $("#editLessonParallelCheckboxes input[type='checkbox']:checked")
    .map(function () { return this.value; })
    .get();

  if (!subject) {
    showWarning("Missing subject", "Enter a subject name.");
    return;
  }
  if (!teacher) {
    showWarning("Missing teacher", "Enter a teacher name.");
    return;
  }
  if (!studentGroup) {
    showWarning("Missing student group", "Enter a student group.");
    return;
  }
  if (!isValidCustomLessonDurationMinutes(durationInMinutes)) {
    showWarning("Invalid duration", "Duration must be a positive multiple of " + DEMO_SLOT_MINUTES + " minutes.");
    return;
  }
  if ((loadedSchedule.rooms || []).length > 0 && allowedRoomIds.length === 0) {
    showWarning("Missing classroom", "Select at least one eligible classroom.");
    return;
  }

  const previousTeacher = lesson.teacher;
  lesson.subject = subject;
  lesson.teacher = teacher;
  lesson.studentGroup = studentGroup;
  lesson.durationInMinutes = durationInMinutes;
  lesson.subjectTypes = subjectTypes;
  lesson.preferredWeekdays = preferredWeekdays;
  lesson.allowedRoomIds = allowedRoomIds;
  // When the teacher identity changes, inherit unavailable days from that teacher's other cards.
  if (teacher !== previousTeacher) {
    lesson.teacherUnavailableDays = findTeacherUnavailableDays(teacher, lesson.id);
  }
  syncLessonParallelLinks(lesson, parallelCardIds);

  if (editLessonCardModal != null) {
    editLessonCardModal.hide();
  }
  updateScheduleMap(loadedSchedule);
  renderSchedule(loadedSchedule);
}

/** True when a lesson may use the given room (respects allowedRoomIds when set). */
function isValidLessonRoom(lesson, room) {
  if (lesson == null || room == null) {
    return false;
  }
  if (lesson.allowedRoomIds == null || lesson.allowedRoomIds.length === 0) {
    return true;
  }
  return lesson.allowedRoomIds.includes(room.id);
}

/**
 * Validates a manual drag-and-drop target before mutating the schedule.
 * Only blocks structural conflicts (pinned overlap, room eligibility). Lunch-spanning and
 * duration-overrun placements are allowed; hard violations are labeled after drop via score refresh.
 */
function validateManualDropAssignment(lesson, viewType, columnKey, columnLabel, timeslot) {
  if (lesson == null || timeslot == null || viewType == null) {
    return { valid: false, message: "Invalid drop target." };
  }
  if (hasPinnedOverlapInTargetColumn(lesson, viewType, columnKey, columnLabel, timeslot)) {
    return {
      valid: false,
      message: "A pinned lesson already occupies part of this time window in the target column."
    };
  }
  if (viewType === ENTITY_VIEW_ROOM) {
    const room = roomMap.get(columnKey);
    if (!isValidLessonRoom(lesson, room)) {
      return { valid: false, message: `${lesson.subject} is not allowed in ${columnLabel}.` };
    }
  }
  return { valid: true, message: null };
}

/** Returns the teacher column used for display without changing the lesson's fixed teacher identity. */
function getLessonTeacherPlacement(lesson) {
  return lesson.manualTeacherPlacement || lesson.teacher;
}

/** Returns the student-group column used for display without changing the lesson's fixed group identity. */
function getLessonStudentGroupPlacement(lesson) {
  return lesson.manualStudentGroupPlacement || lesson.studentGroup;
}

/** True when a lesson belongs to the dropped target column for the active entity view. */
function isLessonInEntityColumn(lesson, viewType, columnKey, columnLabel) {
  if (viewType === ENTITY_VIEW_ROOM) {
    const room = roomMap.get(extractId(lesson.room));
    return room != null && room.id === columnKey;
  }
  if (viewType === ENTITY_VIEW_TEACHER) {
    return getLessonTeacherPlacement(lesson) === columnLabel;
  }
  if (viewType === ENTITY_VIEW_STUDENT_GROUP) {
    return getLessonStudentGroupPlacement(lesson) === columnLabel;
  }
  return false;
}

/**
 * Assigns a default room when a lesson has a timeslot but no room yet
 * (needed so entity views other than By room can still show assigned cards).
 */
function assignDefaultRoomIfNeeded(lesson) {
  if (lesson.room != null) {
    return;
  }
  const rooms = (loadedSchedule.rooms || [])
    .map(roomEntry => roomMap.get(extractId(roomEntry)))
    .filter(room => room != null);
  if (rooms.length === 0) {
    return;
  }
  if (lesson.allowedRoomIds != null && lesson.allowedRoomIds.length > 0) {
    const allowedSet = new Set(lesson.allowedRoomIds);
    const eligible = rooms.filter(room => allowedSet.has(room.id));
    if (eligible.length > 0) {
      lesson.room = eligible[0];
      return;
    }
  }
  lesson.room = rooms[0];
}

/**
 * Applies a manual drag-and-drop move in an entity view:
 * updates the assignable room or UI-only teacher/group placement and start timeslot.
 * Fixed teacher and student-group card identities are never changed by dragging.
 */
function applyManualLessonMove(lesson, viewType, columnKey, columnLabel, timeslot) {
  lesson.timeslot = timeslot;
  if (viewType === ENTITY_VIEW_ROOM) {
    lesson.room = roomMap.get(columnKey) || null;
  } else if (viewType === ENTITY_VIEW_TEACHER) {
    lesson.manualTeacherPlacement = columnLabel === lesson.teacher ? null : columnLabel;
    assignDefaultRoomIfNeeded(lesson);
  } else if (viewType === ENTITY_VIEW_STUDENT_GROUP) {
    lesson.manualStudentGroupPlacement = columnLabel === lesson.studentGroup ? null : columnLabel;
    assignDefaultRoomIfNeeded(lesson);
  }
}

/**
 * Unassigns other lessons in the same target column whose duration overlaps the moved lesson.
 * Overlapping cards return to Unassigned Lessons (timeslot and room cleared).
 */
function unassignOverlappingLessonsInTargetColumn(movedLesson, viewType, columnKey, columnLabel, startTimeslot) {
  const occupiedIds = new Set(getOccupiedTimeslotIds(loadedSchedule, startTimeslot, movedLesson));
  for (const lesson of loadedSchedule.lessons) {
    if (lesson.id === movedLesson.id || lesson.timeslot == null) {
      continue;
    }
    if (!isLessonInEntityColumn(lesson, viewType, columnKey, columnLabel)) {
      continue;
    }
    const lessonStart = timeslotMap.get(extractId(lesson.timeslot));
    if (lessonStart == null) {
      continue;
    }
    const lessonOccupiedIds = getOccupiedTimeslotIds(loadedSchedule, lessonStart, lesson);
    const overlaps = lessonOccupiedIds.some(id => occupiedIds.has(id));
    if (overlaps) {
      if (isLessonPinned(lesson)) {
        continue;
      }
      unassignLessonManually(lesson);
    }
  }
}

/** Handles drop on an entity-view grid cell: move lesson, unassign overlaps, refresh score. */
function handleEntityViewLessonDrop($cell) {
  const lesson = findLessonById(draggedLessonId);
  if (lesson == null) {
    return;
  }
  const viewType = $cell.attr("data-view-type");
  const timeslotId = $cell.attr("data-timeslot-id");
  const columnKey = $cell.attr("data-column-key");
  const columnLabel = $cell.attr("data-column-label");
  const timeslot = timeslotMap.get(timeslotId);
  if (timeslot == null || viewType == null) {
    return;
  }

  const validation = validateManualDropAssignment(lesson, viewType, columnKey, columnLabel, timeslot);
  if (!validation.valid) {
    showWarning("Cannot assign lesson here", validation.message);
    draggedLessonId = null;
    return;
  }

  // Displace overlapping cards in the target column, then assign the dropped lesson.
  unassignOverlappingLessonsInTargetColumn(lesson, viewType, columnKey, columnLabel, timeslot);
  applyManualLessonMove(lesson, viewType, columnKey, columnLabel, timeslot);
  refreshScoreAfterManualMove();
  draggedLessonId = null;
}

/**
 * Sends the current timetable to the backend for score recalculation and violation labeling,
 * then re-renders all Demo UI views from the returned timetable JSON.
 */
function refreshScoreAfterManualMove() {
  if (loadedSchedule == null) {
    return;
  }
  const schedulePayload = normalizeScheduleReferencesForApi(
    applySoftConstraintSelectionToSchedule($.extend(true, {}, loadedSchedule)));
  $.ajax({
    url: "/timetables/score",
    type: "PUT",
    contentType: "application/json",
    data: JSON.stringify(schedulePayload),
    success: function (updatedSchedule) {
      loadedSchedule = updatedSchedule;
      updateScheduleMap(updatedSchedule);
      renderSchedule(updatedSchedule);
    },
    error: function (xhr) {
      showError("Score refresh after manual move failed.", xhr);
      renderSchedule(loadedSchedule);
    }
  });
}

/** Updates the unassigned-lesson count badge in the sidebar header. */
function updateUnassignedLessonCount(count) {
  const $badge = $("#unassignedLessonCount");
  if ($badge.length === 0) {
    return;
  }
  $badge.text(count);
  $badge.toggleClass("bg-success", count === 0);
  $badge.toggleClass("bg-secondary", count > 0);
}

/** Applies expanded or collapsed styling to the unassigned-lessons sidebar. */
function applyUnassignedSidebarCollapsed(collapsed) {
  const $workspace = $("#demoScheduleWorkspace");
  const $toggleButton = $("#toggleUnassignedSidebarButton");
  if ($workspace.length === 0 || $toggleButton.length === 0) {
    return;
  }
  $workspace.toggleClass("unassigned-sidebar-collapsed", collapsed);
  $toggleButton.attr("title", collapsed ? "Expand unassigned lessons" : "Minimize unassigned lessons");
  $toggleButton.attr("aria-expanded", collapsed ? "false" : "true");
  $toggleButton.find("i").attr("class", collapsed ? "fas fa-chevron-right" : "fas fa-chevron-left");
}

/** Toggles the unassigned-lessons sidebar and persists the user's preference. */
function toggleUnassignedSidebar() {
  const collapsed = !$("#demoScheduleWorkspace").hasClass("unassigned-sidebar-collapsed");
  applyUnassignedSidebarCollapsed(collapsed);
  localStorage.setItem(UNASSIGNED_SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}

/** Restores sidebar collapse state and binds the minimize/expand control. */
function initUnassignedSidebar() {
  const collapsed = localStorage.getItem(UNASSIGNED_SIDEBAR_COLLAPSED_KEY) === "1";
  applyUnassignedSidebarCollapsed(collapsed);
  $("#toggleUnassignedSidebarButton").click(toggleUnassignedSidebar);
}

/** Parses comma-separated subject type tags for ad hoc custom lesson cards. */
function parseCustomLessonSubjectTypes(text) {
  return [...new Set(String(text || "").split(",").map(type => type.trim()).filter(type => type))];
}

/** True when duration is a positive multiple of the demo slot length (30 minutes). */
function isValidCustomLessonDurationMinutes(duration) {
  return !isNaN(duration) && duration >= DEMO_SLOT_MINUTES && duration % DEMO_SLOT_MINUTES === 0;
}

/** Returns the next unused custom-* lesson id in the current timetable. */
function generateNextCustomLessonId() {
  let maxNum = 0;
  for (const lesson of loadedSchedule?.lessons || []) {
    const match = String(lesson.id).match(/^custom-(\d+)$/i);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return "custom-" + (maxNum + 1);
}

/** Fills a datalist element with suggestion values from the current schedule. */
function fillCustomLessonDatalist(selector, values) {
  const $list = $(selector).empty();
  for (const value of values) {
    $list.append($("<option/>").val(value));
  }
}

/** Refreshes subject/teacher/group suggestions for the ad hoc custom card form. */
function refreshCustomLessonCardDatalists(timetable) {
  if (timetable == null) {
    return;
  }
  const subjects = [...new Set((timetable.lessons || []).map(lesson => lesson.subject).filter(name => name))].sort();
  const teachers = [...new Set((timetable.lessons || []).map(lesson => lesson.teacher).filter(name => name))].sort();
  const studentGroups = [...new Set((timetable.lessons || []).map(lesson => lesson.studentGroup).filter(name => name))].sort();
  fillCustomLessonDatalist("#customLessonSubjectSuggestions", subjects);
  fillCustomLessonDatalist("#customLessonTeacherSuggestions", teachers);
  fillCustomLessonDatalist("#customLessonStudentGroupSuggestions", studentGroups);
}

/**
 * Creates a new unassigned lesson from the ad hoc sidebar form and re-renders the Demo UI.
 * The lesson is added to loadedSchedule.lessons with no timeslot or room assigned.
 */
function createCustomLessonCard() {
  if (loadedSchedule == null) {
    showWarning("No timetable loaded", "Load demo data or a timetable JSON before creating a custom card.");
    return;
  }
  if (isSolverRunning()) {
    showWarning("Solver is running", "Stop solving before creating custom cards.");
    return;
  }

  const subject = $("#customLessonSubjectInput").val().trim();
  const teacher = $("#customLessonTeacherInput").val().trim();
  const studentGroup = $("#customLessonStudentGroupInput").val().trim();
  const subjectTypes = parseCustomLessonSubjectTypes($("#customLessonSubjectTypesInput").val());
  const durationRaw = $("#customLessonDurationInput").val().trim();
  const durationInMinutes = durationRaw === "" ? 60 : parseInt(durationRaw, 10);

  if (!subject) {
    showWarning("Missing subject", "Enter a subject name.");
    return;
  }
  if (!teacher) {
    showWarning("Missing teacher", "Enter a teacher name.");
    return;
  }
  if (!studentGroup) {
    showWarning("Missing student group", "Enter a student group.");
    return;
  }
  if (!isValidCustomLessonDurationMinutes(durationInMinutes)) {
    showWarning("Invalid duration", "Duration must be a positive multiple of " + DEMO_SLOT_MINUTES + " minutes.");
    return;
  }

  const newLesson = {
    id: generateNextCustomLessonId(),
    subject: subject,
    teacher: teacher,
    studentGroup: studentGroup,
    durationInMinutes: durationInMinutes,
    subjectTypes: subjectTypes,
    timeslot: null,
    room: null
  };

  if (loadedSchedule.lessons == null) {
    loadedSchedule.lessons = [];
  }
  loadedSchedule.lessons.push(newLesson);
  updateScheduleMap(loadedSchedule);
  renderSchedule(loadedSchedule);
}

/** Binds the ad hoc custom lesson card form in the unassigned sidebar. */
function initCustomLessonCardForm() {
  $("#createCustomLessonCardButton").click(createCustomLessonCard);
}

function buildEntityViewHeaders(timetable) {
  const roomHeaders = timetable.rooms.map(roomIdx => {
    const room = roomMap.get(extractId(roomIdx));
    return {
      key: room.id,
      label: room.name,
      extraContent: function() {
        const priority = room.priority || 0;
        return $(`<button type="button" class="ms-2 mb-1 btn btn-light btn-sm p-1" title="Room priority — click to edit"/>`)
          .append(priority > 0 ? `<span class="fw-bold text-warning">★${priority}</span>` : `<span class="text-muted">☆</span>`);
      }
    };
  });

  const teachers = [...new Set(timetable.lessons.map(lesson => lesson.teacher))];
  const teacherHeaders = teachers.map(teacher => ({
    key: convertToId(teacher),
    label: teacher
  }));

  const studentGroups = [...new Set(timetable.lessons.map(lesson => lesson.studentGroup))];
  const studentGroupHeaders = studentGroups.map(studentGroup => ({
    key: convertToId(studentGroup),
    label: studentGroup
  }));

  return { roomHeaders, teacherHeaders, studentGroupHeaders };
}

function attachRoomPriorityEditor($extraContent, roomKey) {
  $extraContent.click(function() {
    if (isSolverRunning()) return;
    const currentPriority = roomMap.get(extractId(roomKey))?.priority || 0;
    const $input = $('<input type="number" class="form-control form-control-sm form-control-inline"/>')
      .val(currentPriority)
      .css('display', 'inline')
      .attr('min', '-9999')
      .attr('max', '9999');
    $extraContent.empty().append($input);
    $input.focus();
    $input[0].select();

    function commit() {
      const newValue = parseInt($input.val()) || 0;
      const room = roomMap.get(extractId(roomKey));
      if (room) {
        room.priority = newValue;
        refreshScoreAfterManualMove();
      }
      $extraContent.empty().append(newValue > 0 ? `<span class="fw-bold text-warning">★${newValue}</span>` : `<span class="text-muted">☆</span>`);
    }

    $input.blur(commit);
    $input.keydown(function(e) {
      if (e.key === 'Enter') {
        $input.blur();
        return false;
      } else if (e.key === 'Escape') {
        $extraContent.empty().append(currentPriority > 0 ? `<span class="fw-bold text-warning">★${currentPriority}</span>` : `<span class="text-muted">☆</span>`);
      }
    });
  });
}

function renderParallelView(timetable, manualEditEnabled) {
  const { roomHeaders, teacherHeaders, studentGroupHeaders } = buildEntityViewHeaders(timetable);
  const $view = $("#parallelView").empty();

  const timeslots = timetable.timeslots.map(timeslotIdx => timeslotMap.get(extractId(timeslotIdx)));
  const rowCount = timeslots.length;
  // 1-based rows: parallel body grids have no header row.
  const parallelRowIndexByTimeslotId = new Map();
  timeslots.forEach((timeslot, index) => {
    parallelRowIndexByTimeslotId.set(timeslot.id, index + 1);
  });

  const columnTemplate = headers => `repeat(${headers.length}, minmax(9rem, 1fr))`;

  // One-row header grid: entity header cells only (no timeslot column, no body rows).
  function buildParallelHeaderGrid(columnHeaders) {
    const $grid = $('<div class="timetable-grid"/>').css({
      gridTemplateColumns: columnTemplate(columnHeaders),
      gridTemplateRows: "auto"
    });
    columnHeaders.forEach((header, colIndex) => {
      const $header = $('<div class="timetable-grid-header"/>').css({ gridRow: 1, gridColumn: colIndex + 1 });
      $header.append($('<span/>').text(header.label));
      if (header.extraContent != null) {
        const $extraContent = typeof header.extraContent === 'function' ? header.extraContent() : header.extraContent;
        if ($extraContent) {
          $header.append($extraContent);
          attachRoomPriorityEditor($extraContent, header.key);
        }
      }
      $grid.append($header);
    });
    return $grid;
  }

  // Body grid: entity columns x timeslot rows, no header row, no timeslot column.
  function buildParallelBodyGrid(columnHeaders, viewType) {
    const $grid = $('<div class="timetable-grid"/>').css({
      gridTemplateColumns: columnTemplate(columnHeaders),
      gridTemplateRows: `repeat(${rowCount}, var(--timetable-slot-height))`
    });
    timeslots.forEach((timeslot, rowIndex) => {
      for (let colIndex = 0; colIndex < columnHeaders.length; colIndex++) {
        const header = columnHeaders[colIndex];
        const $cell = $('<div class="timetable-grid-cell timetable-drop-cell"/>')
          .css({ gridRow: rowIndex + 1, gridColumn: colIndex + 1 });
        $cell.attr("data-view-type", viewType)
          .attr("data-timeslot-id", timeslot.id)
          .attr("data-column-key", header.key)
          .attr("data-column-label", header.label);
        $grid.append($cell);
      }
    });
    return $grid;
  }

  const panes = [
    { title: "Rooms", headers: roomHeaders, viewType: ENTITY_VIEW_ROOM },
    { title: "Teachers", headers: teacherHeaders, viewType: ENTITY_VIEW_TEACHER },
    { title: "Student groups", headers: studentGroupHeaders, viewType: ENTITY_VIEW_STUDENT_GROUP }
  ];

  const $headerStrip = $('<div class="parallel-header-sticky"/>')
    .append($('<div class="parallel-corner timetable-grid-header timetable-grid-corner"/>').text("Timeslot"));
  const $bodyRow = $('<div class="parallel-body-row"/>');

  // Shared timeslot column (one column of labels, 1-based rows).
  const $timeslotGrid = $('<div class="timetable-grid"/>').css({
    gridTemplateColumns: "1fr",
    gridTemplateRows: `repeat(${rowCount}, var(--timetable-slot-height))`
  });
  timeslots.forEach((timeslot, rowIndex) => {
    const $label = $('<div class="timetable-grid-timeslot-label"/>')
      .addClass(getTimeslotDayCssClass(timeslot.dayOfWeek))
      .text(formatTimeslotLabel(timeslot))
      .css({ gridRow: rowIndex + 1, gridColumn: 1 });
    if (isHardLunchTimeslot(timeslot)) {
      $label.addClass("timeslot-lunch-hard");
    }
    $timeslotGrid.append($label);
  });
  $bodyRow.append($('<div class="parallel-timeslot-col"/>').append($timeslotGrid));

  for (const pane of panes) {
    const $headerPane = $('<div class="parallel-header-pane"/>')
      .append($('<div class="parallel-pane-title"/>').text(pane.title))
      .append(buildParallelHeaderGrid(pane.headers));
    const $bodyGrid = buildParallelBodyGrid(pane.headers, pane.viewType);
    const $bodyPane = $('<div class="parallel-body-pane"/>').append($bodyGrid);
    placeEcaBlocksOnGrid(timetable, $bodyGrid, parallelRowIndexByTimeslotId, pane.headers.length, 1);
    pane.$grid = $bodyGrid;
    $headerStrip.append($headerPane);
    $bodyRow.append($bodyPane);
    // Sync entity headers with the pane's horizontal scrollbar.
    $bodyPane.on("scroll", function () {
      $headerPane.scrollLeft($(this).scrollLeft());
    });
  }

  $.each(timetable.lessons, (index, lesson) => {
    if (!isLessonAssigned(lesson)) {
      return;
    }
    const timeslot = timeslotMap.get(extractId(lesson.timeslot));
    const room = roomMap.get(extractId(lesson.room));
    const color = pickColor(lesson.subject);
    const cardOptions = {
      draggable: manualEditEnabled && !isLessonPinned(lesson),
      showAssignedActions: manualEditEnabled,
      showUnassignedActions: false
    };
    const lessonElement = buildLessonCard(lesson, color, cardOptions);
    const placement = getLessonGridPlacement(timetable, timeslot, lesson, parallelRowIndexByTimeslotId);
    if (placement == null) {
      return;
    }
    if (room != null) {
      const roomColIndex = roomHeaders.findIndex(header => header.key === room.id);
      if (roomColIndex >= 0) {
        placeLessonOnGrid(panes[0].$grid, lessonElement, placement.startRow, roomColIndex + 1,
          placement.rowSpan, placement.truncated);
      }
    }
    const teacherColIndex = teacherHeaders.findIndex(
      header => header.key === convertToId(getLessonTeacherPlacement(lesson)));
    if (teacherColIndex >= 0) {
      placeLessonOnGrid(panes[1].$grid, lessonElement, placement.startRow, teacherColIndex + 1,
        placement.rowSpan, placement.truncated);
    }
    const groupColIndex = studentGroupHeaders.findIndex(
      header => header.key === convertToId(getLessonStudentGroupPlacement(lesson)));
    if (groupColIndex >= 0) {
      placeLessonOnGrid(panes[2].$grid, lessonElement, placement.startRow, groupColIndex + 1,
        placement.rowSpan, placement.truncated);
    }
  });

  $view.append($headerStrip, $bodyRow);
}

function renderEntityViewGrids(timetable, $roomContainer, $teacherContainer, $groupContainer, manualEditEnabled, $unassignedContainer) {
  // Clear stale grids from the previous render; otherwise every re-render appends
  // duplicate timetables below the old ones.
  $roomContainer.empty();
  $teacherContainer.empty();
  $groupContainer.empty();

  const roomHeaders = timetable.rooms.map(roomIdx => {
    const room = roomMap.get(extractId(roomIdx));
    return {
      key: room.id,
      label: room.name,
      extraContent: function() {
        const priority = room.priority || 0;
        return $(`<button type="button" class="ms-2 mb-1 btn btn-light btn-sm p-1" title="Room priority — click to edit"/>`)
          .append(priority > 0 ? `<span class="fw-bold text-warning">★${priority}</span>` : `<span class="text-muted">☆</span>`);
      }
    };
  });

  const teachers = [...new Set(timetable.lessons.map(lesson => lesson.teacher))];
  const teacherHeaders = teachers.map(teacher => ({
    key: convertToId(teacher),
    label: teacher
  }));

  const studentGroups = [...new Set(timetable.lessons.map(lesson => lesson.studentGroup))];
  const studentGroupHeaders = studentGroups.map(studentGroup => ({
    key: convertToId(studentGroup),
    label: studentGroup
  }));

  const roomGrid = buildTimetableGrid($roomContainer, timetable, roomHeaders, ENTITY_VIEW_ROOM);
  const teacherGrid = buildTimetableGrid($teacherContainer, timetable, teacherHeaders, ENTITY_VIEW_TEACHER);
  const studentGroupGrid = buildTimetableGrid($groupContainer, timetable, studentGroupHeaders, ENTITY_VIEW_STUDENT_GROUP);

  placeEcaBlocksOnGrid(timetable, roomGrid.$grid, roomGrid.rowIndexByTimeslotId, roomHeaders.length);
  placeEcaBlocksOnGrid(timetable, teacherGrid.$grid, teacherGrid.rowIndexByTimeslotId, teacherHeaders.length);
  placeEcaBlocksOnGrid(timetable, studentGroupGrid.$grid, studentGroupGrid.rowIndexByTimeslotId, studentGroupHeaders.length);

  let unassignedCount = 0;

  $.each(timetable.lessons, (index, lesson) => {
    const color = pickColor(lesson.subject);
    const assigned = isLessonAssigned(lesson);
    const cardOptions = {
      // Unassigned lessons must stay draggable; only pinned assigned lessons are locked.
      draggable: manualEditEnabled && (!assigned || !isLessonPinned(lesson)),
      showAssignedActions: manualEditEnabled && assigned,
      showUnassignedActions: manualEditEnabled && !assigned
    };
    const lessonElement = buildLessonCard(lesson, color, cardOptions);
    if (!assigned) {
      unassignedCount++;
      if ($unassignedContainer != null) {
        $unassignedContainer.append($(`<div class="unassigned-lesson-item"/>`).append(lessonElement));
      }
    } else {
      const timeslot = timeslotMap.get(extractId(lesson.timeslot));
      const room = roomMap.get(extractId(lesson.room));

      const roomPlacement = getLessonGridPlacement(timetable, timeslot, lesson, roomGrid.rowIndexByTimeslotId);
      if (roomPlacement != null) {
        const roomColIndex = roomHeaders.findIndex(header => header.key === room.id) + 2;
        placeLessonOnGrid(roomGrid.$grid, lessonElement, roomPlacement.startRow, roomColIndex,
          roomPlacement.rowSpan, roomPlacement.truncated);
      }

      const teacherGridPlacement = getLessonGridPlacement(timetable, timeslot, lesson, teacherGrid.rowIndexByTimeslotId);
      if (teacherGridPlacement != null) {
        const teacherColIndex = teacherHeaders.findIndex(
          header => header.key === convertToId(getLessonTeacherPlacement(lesson))) + 2;
        placeLessonOnGrid(teacherGrid.$grid, lessonElement, teacherGridPlacement.startRow, teacherColIndex,
          teacherGridPlacement.rowSpan, teacherGridPlacement.truncated);
      }

      const groupGridPlacement = getLessonGridPlacement(timetable, timeslot, lesson, studentGroupGrid.rowIndexByTimeslotId);
      if (groupGridPlacement != null) {
        const groupColIndex = studentGroupHeaders.findIndex(
          header => header.key === convertToId(getLessonStudentGroupPlacement(lesson))) + 2;
        placeLessonOnGrid(studentGroupGrid.$grid, lessonElement, groupGridPlacement.startRow, groupColIndex,
          groupGridPlacement.rowSpan, groupGridPlacement.truncated);
      }
    }
  });

  return unassignedCount;
}
function renderSchedule(timetable) {
  // Reset drag UI state whenever the grid is rebuilt (avoids stuck pass-through from aborted drags).
  $("body").removeClass("timetable-entity-drag-active");
  $(".timetable-lesson-dragging").removeClass("timetable-lesson-dragging");
  $(".timetable-drop-target").removeClass("timetable-drop-target");
  refreshSolvingButtons(timetable.solverStatus != null && timetable.solverStatus !== "NOT_SOLVING");
  renderScoreDisplay(timetable.score);
  $("#info").text(buildDatasetInfoText(timetable));

  const unassignedLessons = $("#unassignedLessons");
  unassignedLessons.empty();

  const manualEditEnabled = !isSolverRunning();

  // Render single-view grids; unassigned lesson cards go to the sidebar (once).
  const unassignedCount = renderEntityViewGrids(
    timetable, $("#timetableByRoom"), $("#timetableByTeacher"), $("#timetableByStudentGroup"),
    manualEditEnabled, unassignedLessons);

  // Render parallel-view grids (assigned lessons only; unassigned sidebar already populated above).
  renderParallelView(timetable, manualEditEnabled);

  // Update unassigned lessons count and alert
  updateUnassignedLessonCount(unassignedCount);
  if (unassignedCount === 0) {
    unassignedLessons.append(
      $(`<div class="unassigned-sidebar-empty"/>`)
        .append($(`<div class="alert alert-success d-flex align-items-center" role="alert"/>`)
          .append($(`<i class="fas fa-check-circle me-2"/>`))
          .append($(`<span/>`).text("All lessons assigned")))
    );
  }

  refreshCustomLessonCardDatalists(timetable);

  // By weekday / By filter live in pop-out windows; sync data for any open windows.
  if (!isSchedulePopoutPage()) {
    persistScheduleForPopouts(timetable);
    notifySchedulePopouts();
  }
}

/**
 * Removes UI-only wrong-column placements before a full solve.
 * These fields are deliberately not planning variables, so the solver must start from canonical columns.
 */
function clearManualEntityPlacements(timetable) {
  (timetable.lessons || []).forEach(lesson => {
    lesson.manualTeacherPlacement = null;
    lesson.manualStudentGroupPlacement = null;
  });
  return timetable;
}

function solve() {
  const scheduleToSolve = normalizeScheduleReferencesForApi(clearManualEntityPlacements(
    applySoftConstraintSelectionToSchedule($.extend(true, {}, loadedSchedule))));
  $.post("/timetables", JSON.stringify(scheduleToSolve), function (data) {
    scheduleId = data;
    refreshSolvingButtons(true);
  }).fail(function (xhr, ajaxOptions, thrownError) {
      showError("Start solving failed.", xhr);
      refreshSolvingButtons(false);
    },
    "text");
}

function analyze() {
  new bootstrap.Modal("#scoreAnalysisModal").show();
  renderScoreCalculationHelp();
}

/**
 * Parses a Timefold HardSoftScore string, e.g. "0hard/3soft" or "-1000hard/-5soft".
 * Returns null when the score is missing or not in the expected format.
 */
function parseHardSoftScore(scoreString) {
  if (scoreString == null || scoreString === "?") {
    return null;
  }
  const match = String(scoreString).trim().match(/^(-?\d+)hard\/(-?\d+)soft$/i);
  if (match == null) {
    return { raw: String(scoreString), hard: null, soft: null };
  }
  return {
    raw: String(scoreString),
    hard: parseInt(match[1], 10),
    soft: parseInt(match[2], 10)
  };
}

/** Formats a score integer with an explicit plus sign when positive. */
function formatScoreNumber(value) {
  if (value > 0) {
    return "+" + value;
  }
  return String(value);
}

/**
 * Renders the solver score as a prominent hard/soft panel in the Demo UI toolbar.
 * Hard = 0 means feasible; soft reflects schedule quality (higher is better).
 */
function renderScoreDisplay(scoreString) {
  const $container = $("#scoreDisplay");
  if ($container.length === 0) {
    return;
  }
  $container.empty();

  const parsed = parseHardSoftScore(scoreString);
  if (parsed == null) {
    $container.append(
      $('<div class="score-panel score-panel-unknown"/>').attr("title", "Score not available yet")
        .append(
          $('<div class="score-status score-status-unknown"/>')
            .append($('<i class="fas fa-hourglass-half" aria-hidden="true"/>'))
            .append($('<span class="score-status-label"/>').text("Score"))
            .append($('<span class="score-status-text"/>').text("Pending"))
        )
        .append(
          $('<div class="score-metric"/>')
            .append($('<span class="score-metric-label"/>').text("Hard"))
            .append($('<span class="score-metric-value"/>').text("—"))
        )
        .append(
          $('<div class="score-metric score-metric-soft"/>')
            .append($('<span class="score-metric-label"/>').text("Soft"))
            .append($('<span class="score-metric-value"/>').text("—"))
        )
    );
    return;
  }

  if (parsed.hard == null || parsed.soft == null) {
    $container.append(
      $('<div class="score-panel score-panel-unknown"/>').attr("title", parsed.raw)
        .append(
          $('<div class="score-status score-status-unknown"/>')
            .append($('<span class="score-status-label"/>').text("Score"))
            .append($('<span class="score-status-text"/>').text(parsed.raw))
        )
    );
    return;
  }

  const hardFeasible = parsed.hard === 0;
  const panelClass = hardFeasible ? "score-panel-feasible" : "score-panel-infeasible";
  const statusClass = hardFeasible ? "score-status-feasible" : "score-status-infeasible";
  const statusIcon = hardFeasible ? "fa-check-circle" : "fa-exclamation-triangle";
  const statusText = hardFeasible ? "Feasible" : "Violations";
  const hardMetricClass = hardFeasible ? "score-metric-hard-ok" : "score-metric-hard-bad";
  const softMetricClass = parsed.soft < 0 ? "score-metric-soft-negative" : "score-metric-soft";

  $container.append(
    $('<div class="score-panel"/>')
      .addClass(panelClass)
      .attr("title", parsed.raw)
      .append(
        $('<div class="score-status"/>')
          .addClass(statusClass)
          .append($(`<i class="fas ${statusIcon}" aria-hidden="true"/>`))
          .append($('<span class="score-status-label"/>').text("Schedule"))
          .append($('<span class="score-status-text"/>').text(statusText))
      )
      .append(
        $('<div class="score-metric"/>')
          .addClass(hardMetricClass)
          .append($('<span class="score-metric-label"/>').text("Hard"))
          .append($('<span class="score-metric-value"/>').text(formatScoreNumber(parsed.hard)))
          .append($('<span class="score-metric-hint"/>').text(hardFeasible ? "No conflicts" : "Must reach 0"))
      )
      .append(
        $('<div class="score-metric"/>')
          .addClass(softMetricClass)
          .append($('<span class="score-metric-label"/>').text("Soft"))
          .append($('<span class="score-metric-value"/>').text(formatScoreNumber(parsed.soft)))
          .append($('<span class="score-metric-hint"/>').text("Higher is better"))
      )
  );
}

/** Fills the score help modal with usage instructions and how hard/soft scores are computed. */
function renderScoreCalculationHelp() {
  const $content = $("#scoreAnalysisModalContent");
  $content.empty();

  const currentScore = loadedSchedule != null && loadedSchedule.score != null ? loadedSchedule.score : null;
  const parsedScore = parseHardSoftScore(currentScore);
  if (parsedScore != null && parsedScore.hard != null && parsedScore.soft != null) {
    $("#scoreAnalysisScoreLabel").text(
      `(Hard ${formatScoreNumber(parsedScore.hard)} · Soft ${formatScoreNumber(parsedScore.soft)})`);
  } else {
    $("#scoreAnalysisScoreLabel").text(currentScore == null ? "" : `(${currentScore})`);
  }

  $content.append($("<h5 class=\"mt-1\"/>").text("How to use the system"));
  appendHelpList($content, [
    "Load a timetable from the Data menu (dataset1 or dataset2 demo), from prepared JSON, or by uploading a saved schedule.",
    "Use the indigo Timetable group to save, load, download, or upload the current timetable project.",
    "Use the amber Subject cards group to transfer cards to or from the Preparation tab (cache or file).",
    "Optionally enable soft constraints below the timetable and set a weight (1–100) for each checked rule. Higher weight gives that rule more influence.",
    "Click Solve to run the optimizer. The score panel shows Hard and Soft values; green Feasible means hard = 0.",
    "Browse the timetable by room, teacher, or student group. Use View weekday or Apply filter to open schedule tools in a separate window.",
    "Drag lesson cards from the unassigned sidebar into the timetable grid to assign them manually. Use the pencil button on an unassigned card to edit it. Pin a lesson to keep it fixed; use the unassign button to return it to the sidebar.",
    "After solving, red or orange lesson outlines indicate violations — click a highlighted card for details."
  ]);

  $content.append($("<h5 class=\"mt-4\"/>").text("How the score is calculated"));
  $content.append($("<p/>").text(
    "The solver uses a Timefold HardSoftScore shown as hard/soft (for example 0hard/+3soft). "
    + "Higher is always better. A feasible timetable has hard = 0 (no hard violations). "
    + "The soft score reflects schedule quality once hard constraints are satisfied."));

  $content.append($("<h6 class=\"mt-3 mb-2\"/>").text("How the total is built"));
  $content.append($("<p/>").text(
    "Each constraint match adds or subtracts points: penalize constraints subtract, reward constraints add. "
    + "Total score = sum of all hard contributions + sum of all soft contributions. "
    + "Hard overlap and duration violations cost 1,000 points per affected 30-minute slot."));

  $content.append($("<h6 class=\"mt-3 mb-2\"/>").text("Hard constraints (must reach 0)"));
  appendConstraintTable($content, [
    ["Room conflict", "Two lessons share a room and overlap in time", "−1000 × overlap slots"],
    ["Teacher conflict", "Same teacher, overlapping lessons", "−1000 × overlap slots"],
    ["Student group conflict", "Same student group, overlapping lessons", "−1000 × overlap slots"],
    ["Lesson overlaps hard lunch", "Lesson overlaps the mandatory 13:00–13:30 block", "−1000 × lunch overlap slots"],
    ["lunchTimebreak (teacher)", "Teacher has no 1-hour lunch gap on a teaching day", "−1000 per teacher/day"],
    ["lunchTimebreak (student group)", "Student group has no 1-hour lunch gap on a teaching day", "−1000 per group/day"],
    ["Duration exceeds contiguous time", "Lesson is longer than contiguous slots from its start", "−1000 × overrun slots"]
  ]);

  $content.append($("<h6 class=\"mt-3 mb-2\"/>").text("Soft constraints (optional, with weights)"));
  $content.append($("<p/>").text(
    "Soft constraints are off by default. Check a constraint to enable it and set its weight before solving. "
    + "Unchecked constraints are disabled (0hard/0soft). A checked constraint with weight N applies N soft points "
    + "per match (weight 1 behaves like the default ±1 soft)."));
  appendConstraintTable($content, SOFT_CONSTRAINTS.map(constraint => [
    constraint,
    constraint.helpWhen,
    constraint.helpContribution
  ]), { bilingualConstraintNames: true });

  $content.append($("<h6 class=\"mt-3 mb-2\"/>").text("Solver stop condition"));
  $content.append($("<p/>").text(
    "The solver stops when it finds 0hard/*soft (a feasible solution), or after the configured time limit (30 seconds in dev)."));

  $content.append($("<h6 class=\"mt-3 mb-2\"/>").text("Per-lesson violations"));
  $content.append($("<p class=\"mb-0\"/>").text(
    "After solving, highlighted lesson cards show which constraints that lesson violates. "
    + "Click a highlighted card to open the violation details for that lesson."));
}

/** Appends a bullet list of help items to a container. */
function appendHelpList($container, items) {
  const $list = $("<ul class=\"mb-0\"/>");
  items.forEach(item => {
    $list.append($("<li/>").text(item));
  });
  $container.append($list);
}

/** Appends a small constraint reference table to the score help modal. */
function appendConstraintTable($container, rows, options) {
  options = options || {};
  const $table = $(`<table class="table table-sm table-bordered"/>`);
  const $thead = $(`<thead/>`).append($(`<tr/>`)
    .append($(`<th/>`).text("Constraint"))
    .append($(`<th/>`).text("When it applies"))
    .append($(`<th/>`).text("Contribution")));
  $table.append($thead);
  const $tbody = $(`<tbody/>`);
  rows.forEach(row => {
    const $nameCell = $(`<td/>`);
    if (options.bilingualConstraintNames && row[0] != null && row[0].label != null) {
      $nameCell.append(buildSoftConstraintLabelElement(row[0]));
    } else {
      $nameCell.text(row[0]);
    }
    $tbody.append($(`<tr/>`)
      .append($nameCell)
      .append($(`<td/>`).text(row[1]))
      .append($(`<td/>`).text(row[2])));
  });
  $table.append($tbody);
  $container.append($table);
}


function refreshSolvingButtons(solving) {
  $("#resetButton").prop("disabled", solving);
  if (solving) {
    $("#solveButton").hide();
    $("#stopSolvingButton").show();
    if (autoRefreshIntervalId == null) {
      autoRefreshIntervalId = setInterval(refreshSchedule, 2000);
    }
  } else {
    $("#solveButton").show();
    $("#stopSolvingButton").hide();
    if (autoRefreshIntervalId != null) {
      clearInterval(autoRefreshIntervalId);
      autoRefreshIntervalId = null;
    }
  }
}

function stopSolving() {
  $.delete("/timetables/" + scheduleId, function () {
    refreshSolvingButtons(false);
    refreshSchedule();
  }).fail(function (xhr, ajaxOptions, thrownError) {
    showError("Stop solving failed.", xhr);
  });
}

function copyTextToClipboard(id) {
  var text = $("#" + id).text().trim();

  var dummy = document.createElement("textarea");
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  document.execCommand("copy");
  document.body.removeChild(dummy);
}

function showWarning(title, message) {
  const notification = $(`<div class="toast" role="alert" aria-live="assertive" aria-atomic="true" style="min-width: 50rem"/>`)
      .append($(`<div class="toast-header bg-warning">
                 <strong class="me-auto text-dark">Warning</strong>
                 <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
               </div>`))
      .append($(`<div class="toast-body"/>`)
          .append($(`<p class="mb-1"/>`).text(title))
          .append($(`<p class="mb-0"/>`).text(message))
      );
  $("#notificationPanel").append(notification);
  notification.toast({ delay: 10000 });
  notification.toast("show");
}

function showError(title, xhr) {
  let serverErrorMessage = !xhr.responseJSON ? `${xhr.status}: ${xhr.statusText}` : xhr.responseJSON.message;
  let serverErrorCode = !xhr.responseJSON ? `unknown` : xhr.responseJSON.code;
  let serverErrorId = !xhr.responseJSON ? `----` : xhr.responseJSON.id;
  let serverErrorDetails = !xhr.responseJSON ? `no details provided` : xhr.responseJSON.details;

  if (xhr.responseJSON && !serverErrorMessage) {
    serverErrorMessage = JSON.stringify(xhr.responseJSON);
    serverErrorCode = xhr.statusText + '(' + xhr.status + ')';
    serverErrorId = `----`;
  }

  console.error(title + "\n" + serverErrorMessage + " : " + serverErrorDetails);
  const notification = $(`<div class="toast" role="alert" aria-live="assertive" aria-atomic="true" style="min-width: 50rem"/>`)
      .append($(`<div class="toast-header bg-danger">
                 <strong class="me-auto text-dark">Error</strong>
                 <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
               </div>`))
      .append($(`<div class="toast-body"/>`)
          .append($(`<p/>`).text(title))
          .append($(`<pre/>`)
              .append($(`<code/>`).text(serverErrorMessage + "\n\nCode: " + serverErrorCode + "\nError id: " + serverErrorId))
          )
      );
  $("#notificationPanel").append(notification);
  notification.toast({delay: 30000});
  notification.toast('show');
}
