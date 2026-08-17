import { formatTimeslotLabel } from './buildTimetable.js';
import type { Lesson, Timeslot, Timetable } from './types.js';

/** Party type constants (mirrors app.js filter UI). */
export const FILTER_PARTY_TYPE_TEACHER = 'teacher';
export const FILTER_PARTY_TYPE_STUDENT_GROUP = 'studentGroup';

export interface FilterParty {
  type: typeof FILTER_PARTY_TYPE_TEACHER | typeof FILTER_PARTY_TYPE_STUDENT_GROUP;
  name: string;
}

/** Resolves a lesson reference field that may be an id string or embedded object. */
export function extractId(value: string | { id: string } | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return value.id;
  }
  return value;
}

function parseTimeToSeconds(timeText: string): number {
  const parts = timeText.trim().split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

function buildTimeslotMap(timetable: Timetable): Map<string, Timeslot> {
  return new Map(timetable.timeslots.map(slot => [slot.id, slot]));
}

function getLessonDurationMinutes(lesson: Lesson): number {
  return lesson.durationInMinutes ?? 60;
}

/** Returns concrete 30-minute slot ids occupied by a lesson (mirrors app.js). */
export function getOccupiedTimeslotIds(
  timetable: Timetable,
  startTimeslot: Timeslot,
  lesson: Lesson,
): string[] {
  const lessonStart = parseTimeToSeconds(startTimeslot.startTime);
  const lessonEnd = lessonStart + getLessonDurationMinutes(lesson) * 60;

  return timetable.timeslots
    .filter(slot => {
      if (slot.dayOfWeek !== startTimeslot.dayOfWeek) {
        return false;
      }
      const slotStart = parseTimeToSeconds(slot.startTime);
      const slotEnd = parseTimeToSeconds(slot.endTime);
      return slotStart < lessonEnd && lessonStart < slotEnd;
    })
    .map(slot => slot.id);
}

function getLessonsForPartyOnDay(
  timetable: Timetable,
  partyType: string,
  partyName: string,
  dayOfWeek: string,
  timeslotMap: Map<string, Timeslot>,
): Lesson[] {
  return timetable.lessons.filter(lesson => {
    if (lesson.timeslot == null || lesson.room == null) {
      return false;
    }
    const timeslotId = extractId(lesson.timeslot);
    const timeslot = timeslotId ? timeslotMap.get(timeslotId) : null;
    if (!timeslot || timeslot.dayOfWeek !== dayOfWeek) {
      return false;
    }
    return partyType === FILTER_PARTY_TYPE_TEACHER
      ? lesson.teacher === partyName
      : lesson.studentGroup === partyName;
  });
}

/** True when the party has an assigned lesson overlapping the given timeslot. */
export function isPartyBusyAtTimeslot(
  timetable: Timetable,
  partyType: string,
  partyName: string,
  timeslot: Timeslot,
  timeslotMap: Map<string, Timeslot>,
): boolean {
  for (const lesson of getLessonsForPartyOnDay(timetable, partyType, partyName, timeslot.dayOfWeek, timeslotMap)) {
    const startTimeslotId = extractId(lesson.timeslot);
    const startTimeslot = startTimeslotId ? timeslotMap.get(startTimeslotId) : null;
    if (!startTimeslot) {
      continue;
    }
    const occupiedIds = getOccupiedTimeslotIds(timetable, startTimeslot, lesson);
    if (occupiedIds.includes(timeslot.id)) {
      return true;
    }
  }
  return false;
}

/** True when the timeslot is reserved by an ECA half-day block. */
export function isEcaBlockedTimeslot(timetable: Timetable, timeslotId: string): boolean {
  if (!timetable.ecaBlocks?.length) {
    return false;
  }
  return timetable.ecaBlocks.some(block => (block.timeslotIds ?? []).includes(timeslotId));
}

/** True when every selected party is free and the slot is not ECA-blocked. */
export function isCommonFreeTimeslot(
  timetable: Timetable,
  parties: FilterParty[],
  timeslot: Timeslot,
  timeslotMap: Map<string, Timeslot>,
): boolean {
  if (parties.length === 0) {
    return false;
  }
  if (isEcaBlockedTimeslot(timetable, timeslot.id)) {
    return false;
  }
  return parties.every(party => !isPartyBusyAtTimeslot(timetable, party.type, party.name, timeslot, timeslotMap));
}

/** Returns timeslots for one weekday sorted chronologically. */
export function getTimeslotsForDay(timetable: Timetable, dayOfWeek: string): Timeslot[] {
  return timetable.timeslots
    .filter(slot => slot.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Finds common free timeslots for teachers and/or student groups on one weekday. */
export function findCommonFreeTimeslots(
  timetable: Timetable,
  dayOfWeek: string,
  teachers: string[],
  studentGroups: string[],
): Array<{ id: string; label: string }> {
  const timeslotMap = buildTimeslotMap(timetable);
  const parties: FilterParty[] = [
    ...teachers.map((name): FilterParty => ({ type: FILTER_PARTY_TYPE_TEACHER, name })),
    ...studentGroups.map((name): FilterParty => ({ type: FILTER_PARTY_TYPE_STUDENT_GROUP, name })),
  ];

  return getTimeslotsForDay(timetable, dayOfWeek)
    .filter(timeslot => isCommonFreeTimeslot(timetable, parties, timeslot, timeslotMap))
    .map(timeslot => ({ id: timeslot.id, label: formatTimeslotLabel(timeslot) }));
}

function getTeacherBusyTimeslotIdsOnDay(
  timetable: Timetable,
  teacherName: string,
  dayOfWeek: string,
  timeslotMap: Map<string, Timeslot>,
): Set<string> {
  const busyIds = new Set<string>();
  for (const lesson of getLessonsForPartyOnDay(timetable, FILTER_PARTY_TYPE_TEACHER, teacherName, dayOfWeek, timeslotMap)) {
    const startTimeslotId = extractId(lesson.timeslot);
    const startTimeslot = startTimeslotId ? timeslotMap.get(startTimeslotId) : null;
    if (!startTimeslot) {
      continue;
    }
    for (const timeslotId of getOccupiedTimeslotIds(timetable, startTimeslot, lesson)) {
      busyIds.add(timeslotId);
    }
  }
  return busyIds;
}

/** Finds replacement windows where target teacher is busy but potential teacher is free. */
export function findReplacementTeacherSlots(
  timetable: Timetable,
  dayOfWeek: string,
  targetTeacher: string,
  potentialTeachers: string[],
): Array<{ potentialTeacher: string; slots: Array<{ id: string; label: string }> }> {
  const timeslotMap = buildTimeslotMap(timetable);
  const dayTimeslots = getTimeslotsForDay(timetable, dayOfWeek);
  const targetBusyIds = getTeacherBusyTimeslotIdsOnDay(timetable, targetTeacher, dayOfWeek, timeslotMap);

  return potentialTeachers.map(potentialTeacher => {
    const slots: Array<{ id: string; label: string }> = [];
    for (const timeslot of dayTimeslots) {
      if (!targetBusyIds.has(timeslot.id)) {
        continue;
      }
      if (isEcaBlockedTimeslot(timetable, timeslot.id)) {
        continue;
      }
      if (!isPartyBusyAtTimeslot(timetable, FILTER_PARTY_TYPE_TEACHER, potentialTeacher, timeslot, timeslotMap)) {
        slots.push({ id: timeslot.id, label: formatTimeslotLabel(timeslot) });
      }
    }
    return { potentialTeacher, slots };
  });
}

/** Returns sorted unique teacher names from a timetable. */
export function listTeachers(timetable: Timetable): string[] {
  return [...new Set(timetable.lessons.map(lesson => lesson.teacher))].sort();
}

/** Parses score string like "0hard/-3soft" into numeric parts when possible. */
export function parseScoreParts(score?: string | null): { hardScore?: number; softScore?: number } {
  if (!score) {
    return {};
  }
  const hardMatch = score.match(/(-?\d+)hard/);
  const softMatch = score.match(/(-?\d+)soft/);
  return {
    hardScore: hardMatch ? Number(hardMatch[1]) : undefined,
    softScore: softMatch ? Number(softMatch[1]) : undefined,
  };
}
