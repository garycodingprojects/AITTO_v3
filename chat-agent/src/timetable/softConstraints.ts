import type { Timetable } from './types.js';

/** Default soft weight when a constraint is enabled (matches Demo UI and HardSoftScore.ONE_SOFT). */
export const DEFAULT_SOFT_CONSTRAINT_WEIGHT = 1;

/** Minimum allowed soft constraint weight (matches Demo UI). */
export const MIN_SOFT_CONSTRAINT_WEIGHT = 1;

/** Maximum allowed soft constraint weight (matches Demo UI). */
export const MAX_SOFT_CONSTRAINT_WEIGHT = 100;

/** One configurable soft constraint exposed in Demo UI and chat. */
export interface SoftConstraintDefinition {
  /** Stable id used in API payloads and configureSoftConstraints tool calls. */
  id: string;
  /** Solver constraint name — must match TimetableConstraintProvider.asConstraint(...). */
  name: string;
  label: string;
  labelZh: string;
  helpWhen: string;
  helpContribution: string;
}

/** Per-constraint enabled flag and weight for one solve/score request. */
export interface SoftConstraintSetting {
  enabled: boolean;
  weight: number;
}

/** Map of constraint id → setting; all ids from SOFT_CONSTRAINT_DEFINITIONS should be present. */
export type SoftConstraintSettings = Record<string, SoftConstraintSetting>;

/**
 * All soft constraints the user can enable/disable before solving.
 * `name` values must match TimetableConstraintProvider.SOFT_CONSTRAINTS exactly.
 */
export const SOFT_CONSTRAINT_DEFINITIONS: SoftConstraintDefinition[] = [
  {
    id: 'teacherRoomStability',
    name: 'Teacher room stability',
    label: 'Keep each teacher in one classroom',
    labelZh: '每位教師盡量固定在同一課室',
    helpWhen: 'Same teacher is assigned to different rooms',
    helpContribution: '−weight per pair',
  },
  {
    id: 'studentRoomStability',
    name: 'Student room stability',
    label: 'Keep each class in one classroom',
    labelZh: '每個班別盡量固定在同一課室',
    helpWhen: 'Same student group is assigned to different rooms',
    helpContribution: '−weight per pair',
  },
  {
    id: 'teacherTimeEfficiency',
    name: 'Teacher time efficiency',
    label: 'Give teachers back-to-back lessons',
    labelZh: '教師課堂盡量連續排列，減少空堂',
    helpWhen: 'Same teacher has consecutive lessons on the same day',
    helpContribution: '+weight per pair',
  },
  {
    id: 'studentTimeEfficiency',
    name: 'Student time efficiency',
    label: 'Give classes back-to-back lessons',
    labelZh: '班別課堂盡量連續排列，減少空堂',
    helpWhen: 'Same student group has consecutive lessons on the same day',
    helpContribution: '+weight per pair',
  },
  {
    id: 'studentGroupSubjectVariety',
    name: 'Student group subject variety',
    label: 'Avoid same subject back-to-back for a class',
    labelZh: '避免班別連續上同一科目',
    helpWhen: 'Same subject is scheduled in consecutive slots for a group',
    helpContribution: '−weight per pair',
  },
  {
    id: 'studentGroupSubjectTypeVariety',
    name: 'Student group subject type variety',
    label: 'Avoid same type of subject back-to-back for a class',
    labelZh: '避免班別連續上同一類型的科目',
    helpWhen: 'Back-to-back lessons for a group share at least one subject type tag',
    helpContribution: '−weight per pair',
  },
  {
    id: 'goodLunchtimeTeacher',
    name: 'Good lunchtime for teacher',
    label: 'Give teachers a proper lunch break',
    labelZh: '教師要有足夠午餐休息時間',
    helpWhen: 'Teacher lacks a 2-hour lunch gap around 13:00–13:30',
    helpContribution: '−weight per teacher/day',
  },
  {
    id: 'goodLunchtimeStudentGroup',
    name: 'Good lunchtime for student group',
    label: 'Give classes a proper lunch break',
    labelZh: '班別要有足夠午餐休息時間',
    helpWhen: 'Student group lacks a 2-hour lunch gap around 13:00–13:30',
    helpContribution: '−weight per group/day',
  },
  {
    id: "teacherAvailability",
    name: "Teacher availability",
    label: "Respect teacher availability days",
    labelZh: "避開教師不可用嘅日子",
    defaultEnabled: true,
    helpWhen: "Lesson is scheduled on a day the teacher marked unavailable",
    helpContribution: "−weight per lesson",
  },
];

/** Builds default settings: all soft constraints disabled (matches Demo UI on first load). */
export function createDefaultSoftConstraintSettings(): SoftConstraintSettings {
  const settings: SoftConstraintSettings = {};
  for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
    settings[definition.id] = {
      enabled: Boolean(definition.defaultEnabled ?? false),
      weight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
    };
  }
  return settings;
}

/** Clamps and normalizes a soft constraint weight to the Demo UI range. */
export function normalizeSoftConstraintWeight(rawValue: unknown): number {
  const parsed = Number.parseInt(String(rawValue ?? DEFAULT_SOFT_CONSTRAINT_WEIGHT), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SOFT_CONSTRAINT_WEIGHT;
  }
  return Math.min(MAX_SOFT_CONSTRAINT_WEIGHT, Math.max(MIN_SOFT_CONSTRAINT_WEIGHT, parsed));
}

/**
 * Merges partial settings from the client or configureSoftConstraints tool into a full map.
 * Unknown constraint ids are ignored; missing ids fall back to defaults.
 */
export function mergeSoftConstraintSettings(
  partial?: Partial<Record<string, Partial<SoftConstraintSetting>>> | null,
): SoftConstraintSettings {
  const merged = createDefaultSoftConstraintSettings();
  if (!partial) {
    return merged;
  }

  for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
    const incoming = partial[definition.id];
    if (!incoming) {
      continue;
    }
    merged[definition.id] = {
      enabled: Boolean(incoming.enabled),
      weight: normalizeSoftConstraintWeight(incoming.weight),
    };
  }
  return merged;
}

/** Resolves a user/tool constraint reference (id or solver name) to a definition. */
export function findSoftConstraintDefinition(reference: string): SoftConstraintDefinition | undefined {
  const trimmed = reference.trim();
  if (!trimmed) {
    return undefined;
  }

  const byId = SOFT_CONSTRAINT_DEFINITIONS.find(
    definition => definition.id.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0,
  );
  if (byId) {
    return byId;
  }

  const lower = trimmed.toLowerCase();
  return SOFT_CONSTRAINT_DEFINITIONS.find(definition => {
    return (
      definition.name.toLowerCase() === lower
      || definition.id.toLowerCase() === lower
      || definition.label.toLowerCase() === lower
      || definition.name.toLowerCase().includes(lower)
      || definition.label.toLowerCase().includes(lower)
    );
  });
}

/**
 * Applies enabled/weight selections to a timetable payload before solve or score API calls.
 * Mirrors Demo UI applySoftConstraintSelectionToSchedule in app.js.
 */
export function applySoftConstraintSettingsToTimetable(
  timetable: Timetable,
  settings: SoftConstraintSettings,
): Timetable {
  const overrides: Record<string, string> = {};

  for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
    const setting = settings[definition.id] ?? {
      enabled: false,
      weight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
    };
    if (!setting.enabled) {
      overrides[definition.name] = '0hard/0soft';
      continue;
    }
    const weight = normalizeSoftConstraintWeight(setting.weight);
    if (weight !== DEFAULT_SOFT_CONSTRAINT_WEIGHT) {
      overrides[definition.name] = `0hard/${weight}soft`;
    }
  }

  if (Object.keys(overrides).length === 0) {
    delete timetable.constraintWeightOverrides;
  } else {
    timetable.constraintWeightOverrides = overrides;
  }

  return timetable;
}

/** Returns a deep copy of the timetable with soft-constraint overrides applied. */
export function withSoftConstraintSettings(timetable: Timetable, settings: SoftConstraintSettings): Timetable {
  const copy = structuredClone(timetable);
  return applySoftConstraintSettingsToTimetable(copy, settings);
}

/** Human-readable summary for agent replies and chat UI badges. */
export function summarizeSoftConstraintSettings(settings: SoftConstraintSettings): {
  enabledCount: number;
  disabledCount: number;
  enabled: Array<{ id: string; name: string; weight: number }>;
  disabled: Array<{ id: string; name: string }>;
} {
  const enabled: Array<{ id: string; name: string; weight: number }> = [];
  const disabled: Array<{ id: string; name: string }> = [];

  for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
    const setting = settings[definition.id];
    if (setting?.enabled) {
      enabled.push({
        id: definition.id,
        name: definition.name,
        weight: normalizeSoftConstraintWeight(setting.weight),
      });
    } else {
      disabled.push({ id: definition.id, name: definition.name });
    }
  }

  return {
    enabledCount: enabled.length,
    disabledCount: disabled.length,
    enabled,
    disabled,
  };
}

/** Serializes settings for API responses and chat record export. */
export function serializeSoftConstraintSettings(settings: SoftConstraintSettings): SoftConstraintSettings {
  return mergeSoftConstraintSettings(settings);
}
