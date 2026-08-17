import { extractId, parseScoreParts } from './filterUtils.js';
import type { Lesson, Timetable, Timeslot } from './types.js';

/** One row in a load summary (teacher, group, or room). */
export interface LoadSummaryRow {
  name: string;
  lessonCount: number;
  assignedCount: number;
  totalMinutes: number;
}

/** Structured timetable analysis returned to the agent and UI. */
export interface TimetableAnalysis {
  name?: string;
  score?: string | null;
  feasible?: boolean;
  hardScore?: number;
  softScore?: number;
  lessonCount: number;
  assignedCount: number;
  unassignedCount: number;
  teacherCount: number;
  studentGroupCount: number;
  roomCount: number;
  violationCount: number;
  violationsByConstraint: Array<{ constraintName: string; count: number }>;
  teacherLoad: LoadSummaryRow[];
  studentGroupLoad: LoadSummaryRow[];
  roomUsage: LoadSummaryRow[];
  busiestTeacher?: string;
  busiestStudentGroup?: string;
  busiestDay?: string;
  unassignedLessons: Array<{ id: string; subject: string; teacher: string; studentGroup: string }>;
}

function buildTimeslotMap(timetable: Timetable): Map<string, Timeslot> {
  return new Map(timetable.timeslots.map(slot => [slot.id, slot]));
}

function buildRoomMap(timetable: Timetable): Map<string, string> {
  return new Map(timetable.rooms.map(room => [room.id, room.name]));
}

function lessonMinutes(lesson: Lesson): number {
  return lesson.durationInMinutes ?? 60;
}

function isAssigned(lesson: Lesson): boolean {
  return lesson.timeslot != null && lesson.room != null;
}

function accumulateLoad(
  map: Map<string, LoadSummaryRow>,
  key: string,
  lesson: Lesson,
): void {
  const row = map.get(key) ?? { name: key, lessonCount: 0, assignedCount: 0, totalMinutes: 0 };
  row.lessonCount += 1;
  row.totalMinutes += lessonMinutes(lesson);
  if (isAssigned(lesson)) {
    row.assignedCount += 1;
  }
  map.set(key, row);
}

/** Computes structured analysis metrics for a timetable. */
export function analyzeTimetable(timetable: Timetable): TimetableAnalysis {
  const scoreParts = parseScoreParts(typeof timetable.score === 'string' ? timetable.score : null);
  const timeslotMap = buildTimeslotMap(timetable);
  const roomMap = buildRoomMap(timetable);

  const teacherMap = new Map<string, LoadSummaryRow>();
  const groupMap = new Map<string, LoadSummaryRow>();
  const roomUsageMap = new Map<string, LoadSummaryRow>();
  const violationCounts = new Map<string, number>();
  const dayMinutes = new Map<string, number>();

  let assignedCount = 0;
  const unassignedLessons: TimetableAnalysis['unassignedLessons'] = [];

  for (const lesson of timetable.lessons) {
    accumulateLoad(teacherMap, lesson.teacher, lesson);
    accumulateLoad(groupMap, lesson.studentGroup, lesson);

    if (isAssigned(lesson)) {
      assignedCount += 1;
      const roomId = extractId(lesson.room);
      const roomName = roomId ? (roomMap.get(roomId) ?? roomId) : 'Unknown';
      accumulateLoad(roomUsageMap, roomName, lesson);

      const timeslotId = extractId(lesson.timeslot);
      const startSlot = timeslotId ? timeslotMap.get(timeslotId) : null;
      if (startSlot) {
        const day = startSlot.dayOfWeek;
        dayMinutes.set(day, (dayMinutes.get(day) ?? 0) + lessonMinutes(lesson));
      }
    } else {
      unassignedLessons.push({
        id: lesson.id,
        subject: lesson.subject,
        teacher: lesson.teacher,
        studentGroup: lesson.studentGroup,
      });
    }

    for (const violation of lesson.violations ?? []) {
      violationCounts.set(
        violation.constraintName,
        (violationCounts.get(violation.constraintName) ?? 0) + 1,
      );
    }
  }

  const teacherLoad = [...teacherMap.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const studentGroupLoad = [...groupMap.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const roomUsage = [...roomUsageMap.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);

  const violationsByConstraint = [...violationCounts.entries()]
    .map(([constraintName, count]) => ({ constraintName, count }))
    .sort((a, b) => b.count - a.count);

  const violationCount = violationsByConstraint.reduce((sum, row) => sum + row.count, 0);

  let busiestDay: string | undefined;
  let maxDayMinutes = 0;
  for (const [day, minutes] of dayMinutes.entries()) {
    if (minutes > maxDayMinutes) {
      maxDayMinutes = minutes;
      busiestDay = day;
    }
  }

  const feasible = typeof timetable.score === 'string'
    ? timetable.score.startsWith('0hard/')
    : scoreParts.hardScore === 0;

  return {
    name: timetable.name,
    score: timetable.score,
    feasible,
    hardScore: scoreParts.hardScore,
    softScore: scoreParts.softScore,
    lessonCount: timetable.lessons.length,
    assignedCount,
    unassignedCount: timetable.lessons.length - assignedCount,
    teacherCount: teacherLoad.length,
    studentGroupCount: studentGroupLoad.length,
    roomCount: timetable.rooms.length,
    violationCount,
    violationsByConstraint,
    teacherLoad,
    studentGroupLoad,
    roomUsage,
    busiestTeacher: teacherLoad[0]?.name,
    busiestStudentGroup: studentGroupLoad[0]?.name,
    busiestDay,
    unassignedLessons: unassignedLessons.slice(0, 20),
  };
}

/** Returns lessons assigned to one teacher, group, or room name. */
export function filterLessonsByEntity(
  timetable: Timetable,
  mode: 'teacher' | 'studentGroup' | 'room',
  entityName: string,
): Lesson[] {
  const roomMap = buildRoomMap(timetable);
  return timetable.lessons.filter(lesson => {
    if (!isAssigned(lesson)) {
      return false;
    }
    if (mode === 'teacher') {
      return lesson.teacher === entityName;
    }
    if (mode === 'studentGroup') {
      return lesson.studentGroup === entityName;
    }
    const roomId = extractId(lesson.room);
    const roomName = roomId ? (roomMap.get(roomId) ?? roomId) : '';
    return roomName === entityName;
  });
}

/** Returns lessons on a specific weekday. */
export function filterLessonsByWeekday(timetable: Timetable, dayOfWeek: string): Lesson[] {
  const timeslotMap = buildTimeslotMap(timetable);
  return timetable.lessons.filter(lesson => {
    if (!isAssigned(lesson)) {
      return false;
    }
    const timeslotId = extractId(lesson.timeslot);
    const slot = timeslotId ? timeslotMap.get(timeslotId) : null;
    return slot?.dayOfWeek === dayOfWeek;
  });
}

/** Collects all lessons that have at least one violation label. */
export function collectViolatingLessons(timetable: Timetable): Lesson[] {
  return timetable.lessons.filter(lesson => (lesson.violations?.length ?? 0) > 0);
}
