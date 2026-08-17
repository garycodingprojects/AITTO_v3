/**
 * Chat to Schedule tab: sends user messages to the AI SDK agent service,
 * renders responses, and visualizes timetable / analysis results in-tab.
 */

/** Default chat-agent service URL (Node service under chat-agent/). */
const CHAT_AGENT_BASE_URL = "http://localhost:3001";
/** localStorage key for client-held LLM credentials (never sent to Quarkus). */
const CHAT_LLM_CONFIG_STORAGE_KEY = "aitto-chat-llm-config";

/** In-memory conversation history sent to the agent on each request. */
let chatMessageHistory = [];

/** Latest structured attachments returned by the agent. */
let chatLatestAttachments = [];

/** View mode options for inline timetable/analysis panels beside chat messages. */
const CHAT_INLINE_VIEW_MODES = [
  { value: "overview", label: "Overview" },
  { value: "teacher", label: "By teacher" },
  { value: "studentGroup", label: "By student group" },
  { value: "room", label: "By room" },
  { value: "weekday", label: "By weekday" },
  { value: "violations", label: "Violations" },
  { value: "commonFree", label: "Common free slots" },
  { value: "replacement", label: "Replacement options" },
  { value: "analysis", label: "Analysis" }
];

/** Timer handles for the working-status indicator while waiting for the agent. */
let chatWorkingStatusTimer = null;
let chatWorkingElapsedTimer = null;
let chatWorkingStartedAt = null;

/** Rotating status messages shown while the agent is processing a request. */
const CHAT_WORKING_STATUS_MESSAGES = [
  "Sending your message to the agent…",
  "Connecting to the AI model…",
  "The agent may load demo data, solve timetables, or run analysis.",
  "Calling timetable tools when needed — solving can take up to a minute.",
  "Still working… thank you for waiting."
];

/** Default soft weight when a constraint is enabled (matches Demo UI). */
const CHAT_DEFAULT_SOFT_CONSTRAINT_WEIGHT = 1;

/** Minimum allowed soft constraint weight (matches agent configureSoftConstraints tool). */
const CHAT_MIN_SOFT_CONSTRAINT_WEIGHT = 1;

/** Maximum allowed soft constraint weight (matches agent configureSoftConstraints tool). */
const CHAT_MAX_SOFT_CONSTRAINT_WEIGHT = 100;

/** Soft constraint definitions loaded from chat-agent /api/config. */
let chatSoftConstraintDefinitions = [];

/** In-memory soft constraint settings sent with each chat request and updated by the agent. */
let chatSoftConstraintSettings = {};

/** Normalizes a soft constraint weight to the allowed integer range. */
function normalizeChatSoftConstraintWeight(rawValue) {
  const parsed = parseInt(String(rawValue).trim(), 10);
  if (Number.isNaN(parsed)) {
    return CHAT_DEFAULT_SOFT_CONSTRAINT_WEIGHT;
  }
  return Math.min(CHAT_MAX_SOFT_CONSTRAINT_WEIGHT, Math.max(CHAT_MIN_SOFT_CONSTRAINT_WEIGHT, parsed));
}

/** Builds default settings map (all constraints disabled). */
function createDefaultChatSoftConstraintSettings(definitions) {
  const settings = {};
  (definitions || []).forEach(function (constraint) {
    settings[constraint.id] = {
      enabled: false,
      weight: CHAT_DEFAULT_SOFT_CONSTRAINT_WEIGHT
    };
  });
  return settings;
}

/** Merges partial settings into a full map for every known constraint. */
function mergeChatSoftConstraintSettings(partial, definitions) {
  const merged = createDefaultChatSoftConstraintSettings(definitions);
  if (!partial) {
    return merged;
  }
  Object.keys(partial).forEach(function (constraintId) {
    if (!merged[constraintId]) {
      return;
    }
    const incoming = partial[constraintId] || {};
    merged[constraintId] = {
      enabled: Boolean(incoming.enabled),
      weight: normalizeChatSoftConstraintWeight(incoming.weight)
    };
  });
  return merged;
}

/** Returns current in-memory soft constraint settings for API requests and exports. */
function getChatSoftConstraintSettings() {
  return chatSoftConstraintSettings;
}

/**
 * Updates session soft constraint settings from agent responses or chat record uploads.
 * No UI panel is shown; the agent configures constraints via listSoftConstraints / configureSoftConstraints.
 */
function applyChatSoftConstraintSettings(settings) {
  chatSoftConstraintSettings = mergeChatSoftConstraintSettings(settings, chatSoftConstraintDefinitions);
}

/**
 * Loads soft constraint definitions and defaults from /api/config (no UI rendering).
 * @param {object} config Response from chat-agent GET /api/config
 */
function initializeChatSoftConstraintSettings(config) {
  if (!Array.isArray(config.softConstraints) || config.softConstraints.length === 0) {
    return;
  }
  chatSoftConstraintDefinitions = config.softConstraints;
  if (Object.keys(chatSoftConstraintSettings).length === 0 && config.defaultSoftConstraintSettings) {
    chatSoftConstraintSettings = mergeChatSoftConstraintSettings(
      config.defaultSoftConstraintSettings,
      chatSoftConstraintDefinitions
    );
  }
}

/** Client-held LLM config loaded from localStorage (baseURL, model, apiKey). */
let chatClientLlmConfig = null;

/** Whether the chat-agent service responded successfully on the last config poll. */
let chatAgentOnline = false;

/** Loads LLM config from browser localStorage. */
function loadClientLlmConfigFromStorage() {
  try {
    const raw = localStorage.getItem(CHAT_LLM_CONFIG_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const baseURL = typeof parsed.baseURL === "string" ? parsed.baseURL.trim() : "";
    const model = typeof parsed.model === "string" ? parsed.model.trim() : "";
    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
    if (!baseURL || !model) {
      return null;
    }
    return { baseURL: baseURL, model: model, apiKey: apiKey };
  } catch (error) {
    return null;
  }
}

/** Persists LLM config in browser localStorage only. */
function saveClientLlmConfigToStorage(config) {
  localStorage.setItem(CHAT_LLM_CONFIG_STORAGE_KEY, JSON.stringify({
    baseURL: config.baseURL,
    model: config.model,
    apiKey: config.apiKey || ""
  }));
  chatClientLlmConfig = config;
}

/** Returns true when base URL and model id are configured in localStorage. */
function hasValidClientLlmConfig() {
  const config = chatClientLlmConfig || loadClientLlmConfigFromStorage();
  return Boolean(config && config.baseURL && config.model);
}

/** Updates the model badge from client-held LLM config. */
function updateChatAgentModelBadge() {
  const config = chatClientLlmConfig || loadClientLlmConfigFromStorage();
  if (!config || !config.baseURL || !config.model) {
    $("#chatAgentModelBadge")
      .text("Model: not configured")
      .removeClass("bg-primary")
      .addClass("bg-secondary");
    return;
  }
  const label = config.model + " @ " + config.baseURL;
  $("#chatAgentModelBadge")
    .text("Model: " + label)
    .removeClass("bg-secondary")
    .addClass("bg-primary");
}

/** Fills the model setup modal from localStorage. */
function renderChatModelConfigForm() {
  const config = chatClientLlmConfig || loadClientLlmConfigFromStorage() || {
    baseURL: "",
    model: "",
    apiKey: ""
  };

  $("#chatModelBaseUrl").val(config.baseURL || "");
  $("#chatModelName").val(config.model || "");
  $("#chatModelApiKey").val(config.apiKey || "");

  if (!chatAgentOnline) {
    $("#chatModelConfigOfflineAlert").removeClass("d-none");
  } else {
    $("#chatModelConfigOfflineAlert").addClass("d-none");
  }

  $("#chatModelConfigSaveButton").prop("disabled", false);
  $("#chatModelConfigErrorAlert").addClass("d-none").text("");
}

/** Opens the LLM model setup modal. */
function openChatModelConfigModal() {
  chatClientLlmConfig = loadClientLlmConfigFromStorage();
  renderChatModelConfigForm();
  if (window.bootstrap && window.bootstrap.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById("chatModelConfigModal")).show();
  }
}

/** Reads model fields from the modal into a client config object. */
function collectClientLlmConfigFromForm() {
  return {
    baseURL: $("#chatModelBaseUrl").val().trim(),
    model: $("#chatModelName").val().trim(),
    apiKey: $("#chatModelApiKey").val()
  };
}

/** Saves LLM setup to browser localStorage (not the chat-agent server). */
function saveChatModelConfig() {
  const config = collectClientLlmConfigFromForm();
  if (!config.baseURL || !config.model) {
    showChatNotification("Base URL and model id are required.", "warning");
    return;
  }

  saveClientLlmConfigToStorage(config);
  updateChatAgentModelBadge();
  showChatNotification("Model configuration saved in this browser.", "success");
  if (window.bootstrap && window.bootstrap.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(document.getElementById("chatModelConfigModal")).hide();
  }
}

/**
 * @param {string} message
 * @param {string} type Bootstrap alert type (info, success, warning, danger)
 */
function showChatNotification(message, type) {
  const alertType = type || "info";
  $("#chatNotificationPanel").html(
    $(`<div class="alert alert-${alertType} alert-dismissible fade show" role="alert"/>`)
      .append($("<span/>").text(message))
      .append($('<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"/>'))
  );
}

/**
 * Escapes HTML for safe insertion into the chat panel.
 * @param {string} text
 * @returns {string}
 */
function escapeChatHtml(text) {
  return $("<div/>").text(text == null ? "" : String(text)).html();
}

/** Returns true when an attachment can be opened in the inline view beside its message. */
function chatAttachmentIsVisualizable(attachment) {
  if (!attachment) {
    return false;
  }
  if (attachment.timetable) {
    return true;
  }
  return attachment.type === "analysis" ||
    attachment.type === "constraintReport" ||
    attachment.type === "commonFreeSlots" ||
    attachment.type === "replacementSlots";
}

/** Builds visualization state for one attachment shown in an inline panel. */
function buildVisualStateFromAttachment(attachment) {
  const state = {
    title: attachment.title || "Results",
    viewMode: "overview",
    entityName: null,
    timetable: attachment.timetable || null,
    analysis: null,
    commonFreeSlots: null,
    replacementMatches: null,
    constraintReport: null
  };

  if (attachment.type === "analysis" && attachment.analysis) {
    state.analysis = attachment.analysis;
    state.viewMode = "analysis";
    state.title = attachment.title || "Timetable analysis";
  } else if (attachment.type === "constraintReport") {
    state.constraintReport = attachment;
    state.viewMode = "violations";
    state.title = attachment.title || "Constraint check";
  } else if (attachment.type === "commonFreeSlots") {
    state.commonFreeSlots = attachment;
    state.viewMode = "commonFree";
    state.title = attachment.title || "Common free slots";
  } else if (attachment.type === "replacementSlots") {
    state.replacementMatches = attachment.matches || [];
    state.viewMode = "replacement";
    state.title = attachment.title || "Replacement options";
  } else if (attachment.type === "timetable" && attachment.timetable) {
    state.viewMode = "overview";
    state.title = attachment.title || "Timetable";
  }

  return state;
}

/** Returns true when inline visualization state holds renderable data. */
function chatVisualStateHasData(state) {
  return Boolean(
    state.timetable ||
    state.commonFreeSlots ||
    state.replacementMatches ||
    state.analysis
  );
}

/** Closes every inline visualization panel in the chat history. */
function chatCloseAllInlinePanels() {
  $(".chat-message-turn").removeClass("chat-visual-active");
  $(".chat-message-visual-pane").addClass("d-none").attr("aria-hidden", "true");
}

/** Creates the DOM shell for an inline panel beside a chat message. */
function buildInlineVisualPanelElement() {
  const $viewMode = $("<select/>")
    .addClass("form-select form-select-sm chat-inline-view-mode")
    .attr("title", "Visualization view mode");
  for (const mode of CHAT_INLINE_VIEW_MODES) {
    $viewMode.append($("<option/>").val(mode.value).text(mode.label));
  }

  return $("<div/>")
    .addClass("chat-message-visual-pane border rounded p-2 bg-white d-none")
    .attr("aria-hidden", "true")
    .append(
      $("<div/>").addClass("chat-visual-header chat-inline-visual-header").append(
        $("<div/>").addClass("chat-visual-title chat-inline-title").text("Results"),
        $("<button type=\"button\"/>")
          .addClass("btn btn-outline-secondary btn-sm chat-inline-close")
          .attr("title", "Close results")
          .html("<span class=\"fas fa-times\"></span> Close"),
        $viewMode,
        $("<select/>")
          .addClass("form-select form-select-sm chat-inline-entity-select d-none")
          .attr("title", "Filter by entity")
      )
    )
    .append(
      $("<div/>").addClass("chat-inline-visual-body").append(
        $("<div/>").addClass("chat-visual-metrics chat-inline-metrics"),
        $("<div/>").addClass("chat-visual-content chat-inline-content")
      )
    );
}

/** Opens the inline panel beside the message that owns the attachment. */
function chatShowInlineVisual($turn, attachment) {
  if (!$turn || $turn.length === 0 || !chatAttachmentIsVisualizable(attachment)) {
    return;
  }

  chatCloseAllInlinePanels();

  let $pane = $turn.find(".chat-message-visual-pane");
  if ($pane.length === 0) {
    $pane = buildInlineVisualPanelElement();
    $turn.append($pane);
  }

  const state = buildVisualStateFromAttachment(attachment);
  $pane.data("visualState", state);
  $turn.addClass("chat-visual-active");
  $pane.removeClass("d-none").attr("aria-hidden", "false");
  chatRefreshInlinePanel($pane);

  if ($turn[0] && typeof $turn[0].scrollIntoView === "function") {
    $turn[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/** Guesses an initial status line from the user's message text. */
function chatGuessInitialWorkingStatus(userText) {
  const lower = userText.toLowerCase();
  if (lower.includes("solve")) {
    return "Starting agent — may load data and run the timetable solver…";
  }
  if (lower.includes("constraint") || lower.includes("violation") || lower.includes("feasible")) {
    return "Starting agent — checking constraints and scoring…";
  }
  if (lower.includes("common free") || lower.includes("replacement") || lower.includes("sick")) {
    return "Starting agent — searching timetable slots…";
  }
  if (lower.includes("analy") || lower.includes("busiest") || lower.includes("summar")) {
    return "Starting agent — analyzing timetable data…";
  }
  if (lower.includes("load") || lower.includes("dataset")) {
    return "Starting agent — loading timetable data…";
  }
  return CHAT_WORKING_STATUS_MESSAGES[0];
}

/** Formats elapsed seconds as mm:ss for the working indicator. */
function chatFormatElapsedSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Shows a working indicator in the chat panel while waiting for the agent. */
function chatShowWorkingStatus(initialMessage) {
  chatHideWorkingStatus(false);

  chatWorkingStartedAt = Date.now();
  let messageIndex = 0;

  const $indicator = $("<div/>")
    .attr("id", "chatWorkingIndicator")
    .addClass("chat-working-indicator")
    .append($("<div/>").addClass("chat-working-indicator-title").text("Agent working"))
    .append(
      $("<div/>").addClass("chat-working-indicator-body").append(
        $('<span class="fas fa-spinner fa-spin" aria-hidden="true"></span>'),
        $("<span/>").attr("id", "chatWorkingStatusText").text(initialMessage || CHAT_WORKING_STATUS_MESSAGES[0])
      )
    )
    .append($("<div/>").attr("id", "chatWorkingElapsed").addClass("chat-working-elapsed").text("Elapsed: 0:00"));

  $("#chatMessagesPanel").append($indicator);
  $("#chatMessagesPanel").scrollTop($("#chatMessagesPanel")[0].scrollHeight);

  $("#chatAgentStatusBadge")
    .text("Agent: working…")
    .removeClass("bg-success bg-light text-dark border")
    .addClass("bg-warning text-dark");

  chatWorkingStatusTimer = window.setInterval(function () {
    messageIndex = (messageIndex + 1) % CHAT_WORKING_STATUS_MESSAGES.length;
    $("#chatWorkingStatusText").text(CHAT_WORKING_STATUS_MESSAGES[messageIndex]);
  }, 3500);

  chatWorkingElapsedTimer = window.setInterval(function () {
    const elapsedSec = Math.floor((Date.now() - chatWorkingStartedAt) / 1000);
    $("#chatWorkingElapsed").text("Elapsed: " + chatFormatElapsedSeconds(elapsedSec));
  }, 1000);
}

/** Removes the working indicator and restores the agent online badge. */
function chatHideWorkingStatus(restoreOnlineBadge) {
  if (chatWorkingStatusTimer != null) {
    window.clearInterval(chatWorkingStatusTimer);
    chatWorkingStatusTimer = null;
  }
  if (chatWorkingElapsedTimer != null) {
    window.clearInterval(chatWorkingElapsedTimer);
    chatWorkingElapsedTimer = null;
  }
  chatWorkingStartedAt = null;
  $("#chatWorkingIndicator").remove();

  if (restoreOnlineBadge !== false) {
    refreshChatAgentConfig();
  }
}

/** Resolves a lesson reference field that may be an id string or embedded object. */
function chatExtractId(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return value.id;
  }
  return value;
}

/** Builds lookup maps for timeslots and rooms on a timetable. */
function chatBuildTimetableMaps(timetable) {
  const timeslotMap = new Map();
  const roomMap = new Map();
  for (const slot of timetable.timeslots || []) {
    timeslotMap.set(slot.id, slot);
  }
  for (const room of timetable.rooms || []) {
    roomMap.set(room.id, room);
  }
  return { timeslotMap, roomMap };
}

/** Formats a timeslot as a readable label. */
function chatFormatTimeslotLabel(timeslot) {
  if (!timeslot) {
    return "—";
  }
  const day = timeslot.dayOfWeek.charAt(0) + timeslot.dayOfWeek.slice(1).toLowerCase();
  const start = (timeslot.startTime || "").substring(0, 5);
  const end = (timeslot.endTime || "").substring(0, 5);
  return `${day} ${start}-${end}`;
}

/** Returns unique sorted weekday names from a timetable. */
function chatGetWeekdays(timetable) {
  const days = [...new Set((timetable.timeslots || []).map(slot => slot.dayOfWeek))];
  const order = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  return days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Returns unique sorted entity names for teacher / group / room views. */
function chatGetEntityNames(timetable, mode) {
  const { roomMap } = chatBuildTimetableMaps(timetable);
  if (mode === "teacher") {
    return [...new Set(timetable.lessons.map(lesson => lesson.teacher))].sort();
  }
  if (mode === "studentGroup") {
    return [...new Set(timetable.lessons.map(lesson => lesson.studentGroup))].sort();
  }
  if (mode === "room") {
    return [...new Set(timetable.rooms.map(room => room.name))].sort();
  }
  if (mode === "weekday") {
    return chatGetWeekdays(timetable);
  }
  return [];
}

/** Filters assigned lessons for one entity view mode. */
function chatFilterLessons(timetable, mode, entityName) {
  const { timeslotMap, roomMap } = chatBuildTimetableMaps(timetable);
  return (timetable.lessons || []).filter(lesson => {
    if (lesson.timeslot == null || lesson.room == null) {
      return false;
    }
    if (mode === "teacher") {
      return lesson.teacher === entityName;
    }
    if (mode === "studentGroup") {
      return lesson.studentGroup === entityName;
    }
    if (mode === "room") {
      const roomId = chatExtractId(lesson.room);
      const room = roomId ? roomMap.get(roomId) : null;
      return room && room.name === entityName;
    }
    if (mode === "weekday") {
      const timeslotId = chatExtractId(lesson.timeslot);
      const slot = timeslotId ? timeslotMap.get(timeslotId) : null;
      return slot && slot.dayOfWeek === entityName;
    }
    return false;
  });
}

/** Builds a simple HTML table of lessons sorted by timeslot. */
function chatBuildLessonTable(timetable, lessons) {
  const { timeslotMap, roomMap } = chatBuildTimetableMaps(timetable);
  const sorted = lessons.slice().sort((a, b) => {
    const slotA = timeslotMap.get(chatExtractId(a.timeslot));
    const slotB = timeslotMap.get(chatExtractId(b.timeslot));
    const keyA = slotA ? `${slotA.dayOfWeek}-${slotA.startTime}` : "";
    const keyB = slotB ? `${slotB.dayOfWeek}-${slotB.startTime}` : "";
    return keyA.localeCompare(keyB);
  });

  const $table = $("<table/>").addClass("table table-sm table-striped chat-lesson-table");
  $table.append(
    $("<thead/>").append(
      $("<tr/>")
        .append($("<th/>").text("Time"))
        .append($("<th/>").text("Subject"))
        .append($("<th/>").text("Teacher"))
        .append($("<th/>").text("Group"))
        .append($("<th/>").text("Room"))
        .append($("<th/>").text("Issues"))
    )
  );
  const $body = $("<tbody/>");
  for (const lesson of sorted) {
    const slot = timeslotMap.get(chatExtractId(lesson.timeslot));
    const room = roomMap.get(chatExtractId(lesson.room));
    const $issues = $("<td/>");
    for (const v of lesson.violations || []) {
      $issues.append($("<span/>").addClass("chat-violation-badge").text(v.constraintName));
    }
    $body.append(
      $("<tr/>")
        .append($("<td/>").text(chatFormatTimeslotLabel(slot)))
        .append($("<td/>").text(lesson.subject))
        .append($("<td/>").text(lesson.teacher))
        .append($("<td/>").text(lesson.studentGroup))
        .append($("<td/>").text(room ? room.name : "—"))
        .append($issues)
    );
  }
  $table.append($body);
  return $table;
}

/** Renders metric cards into one inline visualization panel. */
function chatRenderMetricsInto(metrics, $metricsContainer) {
  const $panel = $metricsContainer.empty();
  for (const metric of metrics) {
    $panel.append(
      $("<div/>").addClass("chat-metric-card").append(
        $("<div/>").addClass("chat-metric-label").text(metric.label),
        $("<div/>").addClass("chat-metric-value").text(metric.value)
      )
    );
  }
}

/** Updates entity selector visibility and options for one inline panel state. */
function chatUpdateEntitySelectorForState(state, $select) {
  const mode = state.viewMode;
  const needsEntity = ["teacher", "studentGroup", "room", "weekday"].includes(mode);

  if (!needsEntity || !state.timetable) {
    $select.addClass("d-none").empty();
    return;
  }

  const names = chatGetEntityNames(state.timetable, mode);
  $select.removeClass("d-none").empty();
  for (const name of names) {
    const label = mode === "weekday"
      ? name.charAt(0) + name.slice(1).toLowerCase()
      : name;
    $select.append($("<option/>").val(name).text(label));
  }

  if (state.entityName && names.includes(state.entityName)) {
    $select.val(state.entityName);
  } else if (names.length > 0) {
    state.entityName = names[0];
    $select.val(names[0]);
  }
}

/** Renders timetable/analysis content into one inline panel container. */
function chatRenderVisualizationContentInto(state, $content) {
  $content.empty();
  const timetable = state.timetable;
  const mode = state.viewMode;

  if (mode === "commonFree" && state.commonFreeSlots) {
    const slots = state.commonFreeSlots.slots || [];
    if (slots.length === 0) {
      $content.append($("<p/>").addClass("text-muted mb-0").text("No common free slots found."));
      return;
    }
    const $wrap = $("<div/>");
    for (const slot of slots) {
      $wrap.append($("<span/>").addClass("chat-slot-chip").text(slot.label || slot.id));
    }
    $content.append($wrap);
    return;
  }

  if (mode === "replacement" && state.replacementMatches) {
    for (const match of state.replacementMatches) {
      const $card = $("<div/>").addClass("chat-replacement-card");
      $card.append($("<div/>").addClass("fw-semibold").text(match.potentialTeacher));
      if (!match.slots || match.slots.length === 0) {
        $card.append($("<div/>").addClass("small text-muted").text("No replacement windows."));
      } else {
        const $chips = $("<div/>");
        for (const slot of match.slots) {
          $chips.append($("<span/>").addClass("chat-slot-chip").text(slot.label || slot.id));
        }
        $card.append($chips);
      }
      $content.append($card);
    }
    return;
  }

  if (mode === "analysis" && state.analysis) {
    const a = state.analysis;
    const $list = $("<ul/>").addClass("chat-analysis-list");
    $list.append($("<li/>").text(`Feasible: ${a.feasible ? "Yes (0 hard violations)" : "No"}`));
    if (a.busiestTeacher) {
      $list.append($("<li/>").text(`Busiest teacher: ${a.busiestTeacher}`));
    }
    if (a.busiestStudentGroup) {
      $list.append($("<li/>").text(`Busiest student group: ${a.busiestStudentGroup}`));
    }
    if (a.busiestDay) {
      $list.append($("<li/>").text(`Busiest day: ${a.busiestDay}`));
    }
    if (a.violationsByConstraint && a.violationsByConstraint.length > 0) {
      $list.append($("<li/>").text("Violations by constraint:"));
      const $sub = $("<ul/>");
      for (const row of a.violationsByConstraint) {
        $sub.append($("<li/>").text(`${row.constraintName}: ${row.count}`));
      }
      $list.append($sub);
    }
    if (a.teacherLoad && a.teacherLoad.length > 0) {
      $list.append($("<li/>").text("Teacher load (minutes):"));
      const $sub = $("<ul/>");
      for (const row of a.teacherLoad.slice(0, 8)) {
        $sub.append($("<li/>").text(`${row.name}: ${row.totalMinutes} min (${row.assignedCount}/${row.lessonCount} assigned)`));
      }
      $list.append($sub);
    }
    $content.append($list);
    return;
  }

  if (!timetable) {
    $content.append($("<p/>").addClass("text-muted mb-0").text("No timetable loaded yet."));
    return;
  }

  if (mode === "overview") {
    const assigned = timetable.lessons.filter(l => l.timeslot && l.room).length;
    const unassigned = timetable.lessons.length - assigned;
    $content.append($("<p/>").text(`Dataset: ${timetable.name || "Untitled"}`));
    if (unassigned > 0) {
      const $unassigned = $("<div/>").addClass("mb-2");
      $unassigned.append($("<div/>").addClass("fw-semibold text-warning").text(`Unassigned lessons (${unassigned})`));
      const unassignedLessons = timetable.lessons.filter(l => !l.timeslot || !l.room);
      $unassigned.append(chatBuildLessonTable(timetable, unassignedLessons));
      $content.append($unassigned);
    }
    $content.append($("<div/>").addClass("fw-semibold mb-1").text("Assigned lessons"));
    $content.append(chatBuildLessonTable(timetable, timetable.lessons.filter(l => l.timeslot && l.room)));
    return;
  }

  if (mode === "violations") {
    const violating = timetable.lessons.filter(l => (l.violations || []).length > 0);
    if (violating.length === 0) {
      $content.append($("<p/>").addClass("text-success mb-0").text("No labeled violations."));
      return;
    }
    $content.append(chatBuildLessonTable(timetable, violating));
    return;
  }

  const entityName = state.entityName;
  if (!entityName) {
    $content.append($("<p/>").addClass("text-muted mb-0").text("Select an entity to view."));
    return;
  }
  const lessons = chatFilterLessons(timetable, mode, entityName);
  if (lessons.length === 0) {
    $content.append($("<p/>").addClass("text-muted mb-0").text("No assigned lessons for this selection."));
    return;
  }
  $content.append(chatBuildLessonTable(timetable, lessons));
}

/** Refreshes one inline visualization panel from its stored state. */
function chatRefreshInlinePanel($pane) {
  const state = $pane.data("visualState");
  if (!state || !chatVisualStateHasData(state)) {
    return;
  }

  $pane.find(".chat-inline-title").text(state.title || "Results");
  $pane.find(".chat-inline-view-mode").val(state.viewMode);
  chatUpdateEntitySelectorForState(state, $pane.find(".chat-inline-entity-select"));

  const metrics = [];
  const t = state.timetable;
  if (t) {
    const assigned = t.lessons.filter(l => l.timeslot && l.room).length;
    metrics.push({ label: "Score", value: t.score || "—" });
    metrics.push({ label: "Lessons", value: String(t.lessons.length) });
    metrics.push({ label: "Assigned", value: String(assigned) });
    metrics.push({ label: "Unassigned", value: String(t.lessons.length - assigned) });
  }
  if (state.analysis) {
    metrics.push({ label: "Violations", value: String(state.analysis.violationCount || 0) });
    if (state.analysis.busiestTeacher) {
      metrics.push({ label: "Busiest teacher", value: state.analysis.busiestTeacher });
    }
  }
  if (state.commonFreeSlots) {
    metrics.push({ label: "Free slots", value: String((state.commonFreeSlots.slots || []).length) });
  }

  chatRenderMetricsInto(metrics, $pane.find(".chat-inline-metrics"));
  chatRenderVisualizationContentInto(state, $pane.find(".chat-inline-content"));
}

/** Removes all inline visualization panels from the chat history. */
function chatClearVisualization() {
  chatCloseAllInlinePanels();
  $(".chat-message-visual-pane").remove();
  $(".chat-message-turn").removeClass("chat-visual-active");
}

/** Opens a timetable attachment in the Demo UI tab and switches to it. */
function openTimetableInDemoUi(timetable, sourceLabel) {
  if (typeof window.loadCustomTimetable !== "function") {
    alert("Demo UI is not ready. Refresh the page and try again.");
    return false;
  }
  if (!timetable || !Array.isArray(timetable.lessons)) {
    alert("This attachment has no timetable data to open.");
    return false;
  }

  try {
    // Deep clone so chat state is not mutated by Demo UI rendering.
    const clone = JSON.parse(JSON.stringify(timetable));
    window.loadCustomTimetable(clone, sourceLabel || "Chat agent timetable");

    const demoTab = document.getElementById("navUI");
    if (demoTab && window.bootstrap && window.bootstrap.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(demoTab).show();
    }

    const assigned = clone.lessons.filter(l => l.timeslot && l.room).length;
    const total = clone.lessons.length;
    let message = "Opened in Demo UI.";
    if (assigned === 0 && total > 0) {
      message += " This timetable is unsolved — lessons appear under Unassigned until you click Solve.";
    } else {
      message += " Use the Demo UI tab to edit or solve.";
    }
    showChatNotification(message, "success");
    return true;
  } catch (error) {
    alert("Failed to open in Demo UI: " + (error && error.message ? error.message : String(error)));
    return false;
  }
}

/**
 * @param {string} role user | assistant
 * @param {string} content
 * @param {Array<object>} attachments
 */
function appendChatMessage(role, content, attachments) {
  const isUser = role === "user";
  const hasVisualAttachment = !isUser && Array.isArray(attachments) &&
    attachments.some(chatAttachmentIsVisualizable);

  let $turn = null;
  let $messageHost = null;
  if (hasVisualAttachment) {
    $turn = $("<div/>").addClass("chat-message-turn");
    $messageHost = $("<div/>").addClass("chat-message-col");
    $turn.append($messageHost);
  }

  const $message = $("<div/>")
    .addClass("chat-message")
    .addClass(isUser ? "chat-message-user" : "chat-message-assistant");

  $message.append(
    $("<div/>").addClass("chat-message-role").text(isUser ? "You" : "Agent")
  );
  $message.append(
    $("<div/>").addClass("chat-message-body").html(escapeChatHtml(content))
  );

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      const $attachment = $("<div/>").addClass("chat-attachment");
      $attachment.append(
        $("<div/>").addClass("chat-attachment-title").text(attachment.title || attachment.type || "Attachment")
      );

      if (attachment.summary) {
        $attachment.append($("<div/>").addClass("small text-muted mb-1").text(attachment.summary));
      }

      const $actions = $("<div/>").addClass("d-flex flex-wrap gap-1");

      if (chatAttachmentIsVisualizable(attachment)) {
        const $viewBtn = $("<button/>")
          .attr("type", "button")
          .addClass("btn btn-sm btn-primary")
          .html('<span class="fas fa-eye"></span> View in chat')
          .on("click", function () {
            chatShowInlineVisual($(this).closest(".chat-message-turn"), attachment);
          });
        $actions.append($viewBtn);
      }

      if (attachment.timetable) {
        const $demoBtn = $("<button/>")
          .attr("type", "button")
          .addClass("btn btn-sm btn-outline-secondary")
          .html('<span class="fas fa-external-link-alt"></span> Open in Demo UI')
          .on("click", function () {
            openTimetableInDemoUi(attachment.timetable, attachment.title || "Chat agent timetable");
          });
        $actions.append($demoBtn);
      }

      if ($actions.children().length > 0) {
        $attachment.append($actions);
      }

      $message.append($attachment);
    }
  }

  if ($messageHost) {
    $messageHost.append($message);
    $("#chatMessagesPanel").append($turn);
  } else {
    $("#chatMessagesPanel").append($message);
  }

  $("#chatMessagesPanel").scrollTop($("#chatMessagesPanel")[0].scrollHeight);
}

/**
 * Polls the chat-agent service for active model configuration.
 */
function refreshChatAgentConfig() {
  $.ajax({
    url: CHAT_AGENT_BASE_URL + "/api/config",
    method: "GET",
    timeout: 4000
  }).done(function (config) {
    chatAgentOnline = true;
    updateChatAgentModelBadge();
    $("#chatAgentStatusBadge").text("Agent: online").removeClass("bg-light text-dark border").addClass("bg-success");

    if (Array.isArray(config.softConstraints) && config.softConstraints.length > 0) {
      initializeChatSoftConstraintSettings(config);
    }
  }).fail(function () {
    chatAgentOnline = false;
    updateChatAgentModelBadge();
    $("#chatAgentStatusBadge").text("Agent: offline").removeClass("bg-success").addClass("bg-warning text-dark");
  });
}

/**
 * Sends the current input to the chat-agent and appends the assistant reply.
 */
function sendChatMessage() {
  const text = $("#chatInputTextarea").val().trim();
  if (!text) {
    return;
  }

  if (!chatAgentOnline) {
    showChatNotification("Chat agent is offline. Start it with: cd chat-agent; npm run dev", "warning");
    return;
  }

  const llmConfig = chatClientLlmConfig || loadClientLlmConfigFromStorage();
  if (!llmConfig || !llmConfig.baseURL || !llmConfig.model) {
    showChatNotification("Configure your LLM API before chatting.", "warning");
    openChatModelConfigModal();
    return;
  }

  chatMessageHistory.push({ role: "user", content: text });
  appendChatMessage("user", text, []);
  $("#chatInputTextarea").val("");
  $("#chatSendButton").prop("disabled", true).html('<span class="fas fa-spinner fa-spin"></span> Sending…');
  chatShowWorkingStatus(chatGuessInitialWorkingStatus(text));

  const softConstraintSettings = getChatSoftConstraintSettings();

  $.ajax({
    url: CHAT_AGENT_BASE_URL + "/api/chat",
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({
      messages: chatMessageHistory.map(m => ({ role: m.role, content: m.content })),
      llmConfig: llmConfig,
      softConstraintSettings: softConstraintSettings
    }),
    timeout: 300000
  }).done(function (response) {
    chatHideWorkingStatus(true);
    const assistantText = response.text || "(No response text)";
    const attachments = response.attachments || [];
    if (response.softConstraintSettings) {
      applyChatSoftConstraintSettings(response.softConstraintSettings);
    }
    chatMessageHistory.push({ role: "assistant", content: assistantText, attachments: attachments });
    appendChatMessage("assistant", assistantText, attachments);
    chatLatestAttachments = attachments;
  }).fail(function (xhr) {
    chatHideWorkingStatus(true);
    let errorMessage = "Chat request failed.";
    if (xhr.responseJSON && xhr.responseJSON.message) {
      errorMessage = xhr.responseJSON.message;
    } else if (xhr.status === 0) {
      errorMessage = "Cannot reach chat agent at " + CHAT_AGENT_BASE_URL + ". Start it with: cd chat-agent; npm run dev";
    }
    showChatNotification(errorMessage, "danger");
    appendChatMessage("assistant", "Error: " + errorMessage, []);
    chatMessageHistory.push({ role: "assistant", content: "Error: " + errorMessage, attachments: [] });
  }).always(function () {
    $("#chatSendButton").prop("disabled", false).html('<span class="fas fa-paper-plane"></span> Send');
  });
}

/** Format identifier written into exported chat record JSON files. */
const CHAT_RECORD_FORMAT = "aitto-chat-record";

/** Schema version for exported chat records (increment when fields change). */
const CHAT_RECORD_VERSION = 2;

/** Builds a timestamped filename for chat record downloads. */
function buildChatRecordFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return "chat-record-" + stamp + ".json";
}

/**
 * Validates and normalizes one message from an uploaded chat record.
 * @param {object} raw
 * @param {number} index zero-based index for error messages
 * @returns {{ role: string, content: string, attachments: Array<object> }}
 */
function normalizeChatRecordMessage(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Message " + (index + 1) + " is not an object.");
  }
  const role = raw.role;
  if (role !== "user" && role !== "assistant") {
    throw new Error("Message " + (index + 1) + ' must have role "user" or "assistant".');
  }
  if (typeof raw.content !== "string") {
    throw new Error("Message " + (index + 1) + " must have a text content string.");
  }
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  return {
    role: role,
    content: raw.content,
    attachments: attachments
  };
}

/** Builds the JSON object exported when the user downloads a chat record. */
function buildChatRecordExport() {
  return {
    format: CHAT_RECORD_FORMAT,
    version: CHAT_RECORD_VERSION,
    exportedAt: new Date().toISOString(),
    messageCount: chatMessageHistory.length,
    softConstraintSettings: chatSoftConstraintSettings,
    messages: chatMessageHistory.map(function (message) {
      return {
        role: message.role,
        content: message.content,
        attachments: message.attachments || []
      };
    })
  };
}

/**
 * Parses uploaded JSON into a normalized message list.
 * Accepts our chat-record wrapper or a bare { messages: [...] } object.
 * @param {object} parsed
 * @returns {Array<object>}
 */
function parseChatRecordUpload(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Chat record file must contain a JSON object.");
  }

  let messages = parsed.messages;
  if (!Array.isArray(messages)) {
    throw new Error('Chat record must include a "messages" array.');
  }
  if (messages.length === 0) {
    throw new Error("Chat record has no messages to restore.");
  }

  if (parsed.format && parsed.format !== CHAT_RECORD_FORMAT) {
    throw new Error("Unsupported chat record format: " + parsed.format);
  }

  return messages.map(function (message, index) {
    return normalizeChatRecordMessage(message, index);
  });
}

/** Re-renders every message in chatMessageHistory into the chat panel. */
function renderChatHistoryPanel() {
  $("#chatMessagesPanel").empty();
  for (const message of chatMessageHistory) {
    appendChatMessage(message.role, message.content, message.attachments || []);
  }
  const panel = $("#chatMessagesPanel")[0];
  if (panel) {
    panel.scrollTop = panel.scrollHeight;
  }
}

/** Finds attachments on the last assistant message (for visualization restore). */
function chatFindLatestAssistantAttachments() {
  for (let i = chatMessageHistory.length - 1; i >= 0; i--) {
    const message = chatMessageHistory[i];
    if (message.role === "assistant" && message.attachments && message.attachments.length > 0) {
      return message.attachments;
    }
  }
  return [];
}

/** Downloads the current chat history as a JSON file. */
function downloadChatRecord() {
  if (chatMessageHistory.length === 0) {
    showChatNotification("Nothing to download — send at least one message first.", "warning");
    return;
  }

  const exportPayload = buildChatRecordExport();
  const filename = buildChatRecordFilename();

  if (typeof downloadJsonFile === "function") {
    downloadJsonFile(exportPayload, filename);
  } else {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  showChatNotification("Chat record downloaded (" + chatMessageHistory.length + " messages).", "success");
}

/**
 * Restores chat history from a parsed upload object and refreshes the UI.
 * @param {object} parsed JSON parsed from the user's file
 */
function restoreChatRecord(parsed) {
  const messages = parseChatRecordUpload(parsed);
  chatMessageHistory = messages;
  chatLatestAttachments = chatFindLatestAssistantAttachments();

  chatClearVisualization();
  renderChatHistoryPanel();

  if (parsed.softConstraintSettings) {
    applyChatSoftConstraintSettings(parsed.softConstraintSettings);
  }

  showChatNotification("Chat record loaded (" + messages.length + " messages).", "success");
}

/**
 * Reads a user-selected chat record file and restores the conversation.
 * @param {HTMLInputElement} fileInput hidden file input from the Upload button
 */
function uploadChatRecordFromFile(fileInput) {
  const applyParsed = function (parsed) {
    if (chatMessageHistory.length > 0) {
      const confirmed = window.confirm(
        "Replace the current chat with the uploaded record? This cannot be undone unless you download the current chat first."
      );
      if (!confirmed) {
        return;
      }
    }
    restoreChatRecord(parsed);
  };

  const onError = function (error) {
    showChatNotification("Invalid chat record: " + (error && error.message ? error.message : String(error)), "danger");
  };

  if (typeof readJsonFile === "function") {
    readJsonFile(fileInput, applyParsed, onError);
    return;
  }

  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      applyParsed(JSON.parse(event.target.result));
    } catch (error) {
      onError(error);
    }
    fileInput.value = "";
  };
  reader.onerror = function () {
    onError(new Error("Could not read the selected file."));
    fileInput.value = "";
  };
  reader.readAsText(file);
}

/**
 * Clears chat history and the on-screen message panel.
 */
function clearChatHistory() {
  chatMessageHistory = [];
  chatLatestAttachments = [];
  $("#chatMessagesPanel").empty();
  chatClearVisualization();
  showChatWelcomeMessage();
  showChatNotification("Chat history cleared.", "info");
}

/** Short greeting shown when the chat panel is empty (intro panel holds full instructions). */
function showChatWelcomeMessage() {
  const llmHint = hasValidClientLlmConfig()
    ? ""
    : "\n\nConfigure your LLM API first — click the Model badge above.";
  appendChatMessage(
    "assistant",
    "Hello! Use the message box above to ask the agent, or expand guide & examples for sample prompts.\n\n" +
      "When the agent returns timetable or analysis data, click View in chat to open results beside that message." +
      llmHint,
    []
  );
}

/**
 * Fills the chat input from an example chip in the intro panel and focuses the textarea.
 * @param {string} prompt Example prompt text from data-chat-example
 */
function fillChatInputFromExample(prompt) {
  $("#chatInputTextarea").val(prompt).trigger("focus");
}

/** Binds inline visualization controls (close, view mode, entity filter). */
function bindChatInlineVisualControls() {
  $(document).on("click", ".chat-inline-close", function () {
    const $turn = $(this).closest(".chat-message-turn");
    $turn.removeClass("chat-visual-active");
    $(this).closest(".chat-message-visual-pane").addClass("d-none").attr("aria-hidden", "true");
  });

  $(document).on("change", ".chat-inline-view-mode", function () {
    const $pane = $(this).closest(".chat-message-visual-pane");
    const state = $pane.data("visualState");
    if (!state) {
      return;
    }
    state.viewMode = $(this).val();
    state.entityName = null;
    chatRefreshInlinePanel($pane);
  });

  $(document).on("change", ".chat-inline-entity-select", function () {
    const $pane = $(this).closest(".chat-message-visual-pane");
    const state = $pane.data("visualState");
    if (!state) {
      return;
    }
    state.entityName = $(this).val();
    chatRenderVisualizationContentInto(state, $pane.find(".chat-inline-content"));
  });
}

/** Binds click handlers for example prompt chips in the intro panel. */
function bindChatIntroExampleChips() {
  $(document).on("click", ".chat-intro-example-chip", function () {
    const prompt = $(this).attr("data-chat-example");
    if (prompt) {
      fillChatInputFromExample(prompt);
      // Scroll the prominent composer into view after picking an example.
      const composer = document.querySelector(".chat-composer-shell");
      if (composer && typeof composer.scrollIntoView === "function") {
        composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  });
}

/** Expands or collapses the guide & examples section in the intro panel. */
function bindChatIntroGuideToggle() {
  $("#chatIntroGuideToggle").on("click", function () {
    const $body = $("#chatIntroGuideBody");
    const expanded = !$body.hasClass("d-none");
    if (expanded) {
      $body.addClass("d-none");
      $(this).attr("aria-expanded", "false");
      $("#chatIntroGuideToggleLabel").text("Show guide & examples");
      $("#chatIntroGuideToggleIcon").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
      $body.removeClass("d-none");
      $(this).attr("aria-expanded", "true");
      $("#chatIntroGuideToggleLabel").text("Hide guide & examples");
      $("#chatIntroGuideToggleIcon").removeClass("fa-chevron-down").addClass("fa-chevron-up");
    }
  });
}

$(document).ready(function () {
  chatClientLlmConfig = loadClientLlmConfigFromStorage();
  updateChatAgentModelBadge();
  refreshChatAgentConfig();
  bindChatIntroExampleChips();
  bindChatIntroGuideToggle();
  bindChatInlineVisualControls();

  $("#chatAgentModelBadge").click(openChatModelConfigModal);
  $("#chatModelConfigSaveButton").click(saveChatModelConfig);

  $("#chatInputForm").on("submit", function (event) {
    event.preventDefault();
    sendChatMessage();
  });

  $("#chatClearHistoryButton").click(clearChatHistory);
  $("#chatDownloadRecordButton").click(downloadChatRecord);
  $("#chatUploadRecordButton").click(function () {
    $("#chatUploadRecordInput").click();
  });
  $("#chatUploadRecordInput").change(function () {
    uploadChatRecordFromFile(this);
  });

  showChatWelcomeMessage();
});
