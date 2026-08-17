import type { EcaBlock, Lesson, Room, SubjectCardInput, Timeslot, Timetable } from './types.js';

/** Length of one atomic scheduling slot in minutes (matches Timeslot.SLOT_MINUTES). */
export const SLOT_MINUTES = 30;

/** Default school day bounds (matches TimeslotGenerator.java). */
export const DEFAULT_SCHOOL_DAY = { start: '08:30', end: '17:30' };

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** Default lesson duration when creating a subject card (1 hour). */
export const DEFAULT_CARD_DURATION_MINUTES = 60;

interface SchoolDay {
  start: string;
  end: string;
}

interface EcaSelection {
  dayOfWeek: string;
  period: 'AM' | 'PM';
}

/** Parses HH:mm or HH:mm:ss into seconds since midnight. */
function parseTimeToSeconds(timeText: string): number {
  const parts = timeText.trim().split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Formats seconds since midnight as HH:mm:ss for Jackson compatibility. */
function formatSecondsToTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeSchoolDay(raw?: SchoolDay): SchoolDay {
  return {
    start: raw?.start?.substring(0, 5) ?? DEFAULT_SCHOOL_DAY.start,
    end: raw?.end?.substring(0, 5) ?? DEFAULT_SCHOOL_DAY.end,
  };
}

function getEcaWindow(eca: EcaSelection, schoolDay: SchoolDay) {
  const dayStart = parseTimeToSeconds(schoolDay.start);
  const dayEnd = parseTimeToSeconds(schoolDay.end);
  const lunchStart = 13 * 3600;
  const lunchEnd = lunchStart + SLOT_MINUTES * 60;

  if (eca.period === 'AM') {
    return { windowStart: dayStart, windowEnd: lunchStart };
  }
  return { windowStart: lunchEnd, windowEnd: dayEnd };
}

function isTimeslotInEcaWindow(timeslot: Timeslot, ecaWindow: { windowStart: number; windowEnd: number }): boolean {
  const slotStart = parseTimeToSeconds(timeslot.startTime);
  const slotEnd = parseTimeToSeconds(timeslot.endTime);
  return slotStart >= ecaWindow.windowStart && slotEnd <= ecaWindow.windowEnd;
}

/** Computes maxConsecutiveMinutesFromStart for each timeslot (mirrors preparation.js). */
function computeMaxConsecutiveMinutes(timeslots: Timeslot[], eca: EcaSelection | null, schoolDay: SchoolDay): void {
  const lunchStart = 13 * 3600;
  const ecaWindow = eca ? getEcaWindow(eca, schoolDay) : null;

  for (const day of DAY_ORDER) {
    const daySlots = timeslots.filter(slot => slot.dayOfWeek === day);
    for (let index = 0; index < daySlots.length; index++) {
      const startSlot = daySlots[index];
      let consecutiveMinutes = SLOT_MINUTES;

      for (let nextIndex = index + 1; nextIndex < daySlots.length; nextIndex++) {
        const current = daySlots[nextIndex];
        const currentStart = parseTimeToSeconds(current.startTime);
        if (currentStart === lunchStart) {
          break;
        }
        if (ecaWindow && isTimeslotInEcaWindow(current, ecaWindow)) {
          break;
        }
        consecutiveMinutes += SLOT_MINUTES;
      }

      startSlot.maxConsecutiveMinutesFromStart = consecutiveMinutes;
    }
  }
}

/** Generates 30-minute timeslots for selected weekdays. */
export function generateTimeslots(
  weekdays: string[],
  schoolDayInput?: SchoolDay,
  eca?: EcaSelection | null,
): Timeslot[] {
  const schoolDay = normalizeSchoolDay(schoolDayInput);
  const sortedDays = DAY_ORDER.filter(day => weekdays.includes(day));
  const dayStart = parseTimeToSeconds(schoolDay.start);
  const dayEnd = parseTimeToSeconds(schoolDay.end);
  let nextId = 0;
  const timeslots: Timeslot[] = [];

  for (const dayOfWeek of sortedDays) {
    let slotStart = dayStart;
    while (slotStart + SLOT_MINUTES * 60 <= dayEnd) {
      const slotEnd = slotStart + SLOT_MINUTES * 60;
      timeslots.push({
        id: String(nextId++),
        dayOfWeek,
        startTime: formatSecondsToTime(slotStart),
        endTime: formatSecondsToTime(slotEnd),
        maxConsecutiveMinutesFromStart: 0,
      });
      slotStart = slotEnd;
    }
  }

  computeMaxConsecutiveMinutes(timeslots, eca ?? null, schoolDay);
  return timeslots;
}

function buildEcaBlocksForTimetable(
  timeslots: Timeslot[],
  eca: EcaSelection | null | undefined,
  schoolDay: SchoolDay,
): EcaBlock[] {
  if (!eca) {
    return [];
  }
  const ecaWindow = getEcaWindow(eca, schoolDay);
  const matchingSlots = timeslots.filter(slot => isTimeslotInEcaWindow(slot, ecaWindow));
  if (matchingSlots.length === 0) {
    return [];
  }
  return [{
    label: 'ECA',
    dayOfWeek: eca.dayOfWeek,
    period: eca.period,
    startTime: formatSecondsToTime(ecaWindow.windowStart),
    endTime: formatSecondsToTime(ecaWindow.windowEnd),
    timeslotIds: matchingSlots.map(slot => slot.id),
  }];
}

function buildRoomsWithIds(roomNames: string[]): Room[] {
  return roomNames.map((name, index) => ({ id: String(index), name }));
}

/** Builds an unsolved Timetable JSON from subject cards (mirrors preparation.js buildTimetableJson). */
export function buildTimetableFromSubjectCards(options: {
  name?: string;
  weekdays?: string[];
  schoolDay?: SchoolDay;
  eca?: EcaSelection | null;
  rooms: string[];
  cards: SubjectCardInput[];
}): Timetable {
  const weekdays = options.weekdays?.length ? options.weekdays : ['MONDAY', 'TUESDAY'];
  const schoolDay = normalizeSchoolDay(options.schoolDay);
  const timeslots = generateTimeslots(weekdays, schoolDay, options.eca ?? null);
  const ecaBlocks = buildEcaBlocksForTimetable(timeslots, options.eca ?? null, schoolDay);
  const rooms = buildRoomsWithIds(options.rooms);
  const roomNameToId = new Map(rooms.map(room => [room.name, room.id]));

  const lessons: Lesson[] = options.cards.map((card, index) => {
    const durationInMinutes = card.durationInMinutes ?? DEFAULT_CARD_DURATION_MINUTES;
    const roomNames = card.roomNames?.length ? card.roomNames : options.rooms;
    const allowedRoomIds = roomNames
      .map(name => roomNameToId.get(name))
      .filter((id): id is string => id != null);

    return {
      id: String(index + 1).padStart(4, '0'),
      subject: card.subject,
      teacher: card.teacher,
      studentGroup: card.studentGroup,
      durationInMinutes,
      subjectTypes: card.subjectTypes ?? [],
      allowedRoomIds,
      timeslot: null,
      room: null,
    };
  });

  return {
    name: options.name ?? 'Chat agent timetable',
    timeslots,
    rooms,
    lessons,
    ecaBlocks,
    score: null,
    solverStatus: null,
  };
}

/** Formats a timeslot label for human-readable chat attachments. */
export function formatTimeslotLabel(timeslot: Timeslot): string {
  const dayLabel = timeslot.dayOfWeek.charAt(0) + timeslot.dayOfWeek.slice(1).toLowerCase();
  const start = timeslot.startTime.substring(0, 5);
  const end = timeslot.endTime.substring(0, 5);
  return `${dayLabel} ${start} - ${end}`;
}
