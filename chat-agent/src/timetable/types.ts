import type { TimetableAnalysis } from './analyzeTimetable.js';
import type { SoftConstraintSettings } from './softConstraints.js';

/** Shared timetable domain types (mirrors Quarkus JSON payloads). */

export interface Timeslot {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  maxConsecutiveMinutesFromStart?: number;
}

export interface Room {
  id: string;
  name: string;
}

export interface ViolationInfo {
  constraintName: string;
  score?: string;
}

export interface Lesson {
  id: string;
  subject: string;
  teacher: string;
  studentGroup: string;
  /** UI-only teacher column; fixed `teacher` remains the lesson identity. */
  manualTeacherPlacement?: string | null;
  /** UI-only student-group column; fixed `studentGroup` remains the lesson identity. */
  manualStudentGroupPlacement?: string | null;
  durationInMinutes: number;
  subjectTypes?: string[];
  /** Preferred weekdays (MONDAY..FRIDAY) for the Preferred weekday soft constraint. */
  preferredWeekdays?: string[];
  /** Partner lesson/card IDs that should share this lesson's weekday and start time. */
  parallelCardIds?: string[];
  allowedRoomIds?: string[];
  timeslot: string | Timeslot | null;
  room: string | Room | null;
  pinned?: boolean;
  violations?: ViolationInfo[];
}

export interface EcaBlock {
  label?: string;
  dayOfWeek: string;
  period: string;
  startTime: string;
  endTime: string;
  timeslotIds: string[];
}

export interface Timetable {
  name?: string;
  timeslots: Timeslot[];
  rooms: Room[];
  lessons: Lesson[];
  ecaBlocks?: EcaBlock[];
  score?: string | null;
  solverStatus?: string | null;
  constraintWeightOverrides?: Record<string, string>;
}

/** One subject card used to build an unsolved timetable. */
export interface SubjectCardInput {
  subject: string;
  teacher: string;
  studentGroup: string;
  durationInMinutes?: number;
  subjectTypes?: string[];
  roomNames?: string[];
  /** Preferred weekdays; defaults to all Mon–Fri when omitted. */
  preferredWeekdays?: string[];
  /** Partner card IDs that should share a timeslot; defaults to none. */
  parallelCardIds?: string[];
}

/** Structured payload returned to the browser alongside agent text. */
export interface ChatAttachment {
  type: 'timetable' | 'commonFreeSlots' | 'replacementSlots' | 'constraintReport' | 'analysis';
  title: string;
  summary?: string;
  timetable?: Timetable;
  slots?: Array<{ id: string; label: string }>;
  matches?: Array<{ potentialTeacher: string; slots: Array<{ id: string; label: string }> }>;
  hardScore?: number;
  softScore?: number;
  analysis?: TimetableAnalysis;
  /** Context for common-free / replacement views (parties, day, target teacher). */
  context?: Record<string, unknown>;
}

/** Mutable session state shared across tool executions in one chat request. */
export interface AgentSessionContext {
  timefoldBaseUrl: string;
  attachments: ChatAttachment[];
  lastTimetable: Timetable | null;
  /** Soft-constraint toggles/weights applied on solve and score (persisted via chat API). */
  softConstraintSettings: SoftConstraintSettings;
}

export function createSessionContext(
  timefoldBaseUrl: string,
  softConstraintSettings: SoftConstraintSettings,
): AgentSessionContext {
  return {
    timefoldBaseUrl,
    attachments: [],
    lastTimetable: null,
    softConstraintSettings,
  };
}
