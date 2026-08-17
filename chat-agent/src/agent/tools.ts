import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { buildTimetableFromSubjectCards } from '../timetable/buildTimetable.js';
import { analyzeTimetable } from '../timetable/analyzeTimetable.js';
import {
  findCommonFreeTimeslots,
  findReplacementTeacherSlots,
  listTeachers,
  parseScoreParts,
} from '../timetable/filterUtils.js';
import { TimefoldClient } from '../timetable/timefoldClient.js';
import {
  DEFAULT_SOFT_CONSTRAINT_WEIGHT,
  MAX_SOFT_CONSTRAINT_WEIGHT,
  MIN_SOFT_CONSTRAINT_WEIGHT,
  SOFT_CONSTRAINT_DEFINITIONS,
  findSoftConstraintDefinition,
  summarizeSoftConstraintSettings,
  withSoftConstraintSettings,
} from '../timetable/softConstraints.js';
import type { AgentSessionContext, ChatAttachment, Lesson, Timetable } from '../timetable/types.js';

/** Shared Zod schema for subject cards passed to createSubjectCardsTimetable. */
const subjectCardSchema = z.object({
  subject: z.string().min(1),
  teacher: z.string().min(1),
  studentGroup: z.string().min(1),
  durationInMinutes: z.number().int().positive().optional(),
  subjectTypes: z.array(z.string()).optional(),
  roomNames: z.array(z.string()).optional(),
});

function rememberTimetable(context: AgentSessionContext, timetable: Timetable, title: string, summary?: string): void {
  context.lastTimetable = timetable;
  context.attachments.push({
    type: 'timetable',
    title,
    summary,
    timetable,
  });
}

function rememberConstraintReport(context: AgentSessionContext, timetable: Timetable, title: string): void {
  const scoreParts = parseScoreParts(typeof timetable.score === 'string' ? timetable.score : null);
  const violationCount = timetable.lessons.reduce(
    (count: number, lesson: Lesson) => count + (lesson.violations?.length ?? 0),
    0,
  );

  context.lastTimetable = timetable;
  context.attachments.push({
    type: 'constraintReport',
    title,
    summary: `Score ${timetable.score ?? 'unknown'}; ${violationCount} labeled violation(s).`,
    timetable,
    hardScore: scoreParts.hardScore,
    softScore: scoreParts.softScore,
  });
}

/**
 * Creates scoped timetable tools for the ToolLoopAgent.
 * Tools only call the Quarkus Timefold REST API and local helper code under timefold/.
 */
export function createScheduleTools(context: AgentSessionContext): ToolSet {
  const client = () => new TimefoldClient(context.timefoldBaseUrl);

  return {
    listDemoData: tool({
      description: 'List available demo timetable dataset ids (dataset1, dataset2).',
      inputSchema: z.object({}),
      execute: async () => {
        const ids = await client().listDemoDataIds();
        return { demoDataIds: ids };
      },
    }),

    loadDemoData: tool({
      description: 'Load an unsolved demo timetable by id (dataset1 or dataset2).',
      inputSchema: z.object({
        demoDataId: z.enum(['dataset1', 'dataset2']),
      }),
      execute: async ({ demoDataId }) => {
        const timetable = await client().getDemoData(demoDataId);
        rememberTimetable(context, timetable, `Demo data: ${demoDataId}`, `${timetable.lessons.length} lessons`);
        return {
          name: timetable.name,
          lessonCount: timetable.lessons.length,
          timeslotCount: timetable.timeslots.length,
          roomCount: timetable.rooms.length,
        };
      },
    }),

    createSubjectCardsTimetable: tool({
      description:
        'Create an unsolved timetable from subject cards, weekdays, rooms, and optional school-day bounds.',
      inputSchema: z.object({
        name: z.string().optional(),
        weekdays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])).optional(),
        schoolDay: z.object({ start: z.string(), end: z.string() }).optional(),
        eca: z.object({
          dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
          period: z.enum(['AM', 'PM']),
        }).optional(),
        rooms: z.array(z.string().min(1)).min(1),
        cards: z.array(subjectCardSchema).min(1),
      }),
      execute: async input => {
        const timetable = buildTimetableFromSubjectCards(input);
        rememberTimetable(
          context,
          timetable,
          timetable.name ?? 'Subject card timetable',
          `${timetable.lessons.length} lesson card(s) created`,
        );
        return {
          name: timetable.name,
          lessonCount: timetable.lessons.length,
          timeslotCount: timetable.timeslots.length,
          roomCount: timetable.rooms.length,
        };
      },
    }),

    solveTimetable: tool({
      description:
        'Submit a timetable to the Timefold solver and wait for the best solution. Uses last timetable when timetable is omitted. Applies the current soft-constraint selection (enable/disable and weights) configured via listSoftConstraints or configureSoftConstraints.',
      inputSchema: z.object({
        timetable: z.any().optional(),
      }),
      execute: async ({ timetable }) => {
        const problem = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!problem) {
          throw new Error('No timetable available. Load demo data or create subject cards first.');
        }

        const payload = withSoftConstraintSettings(problem, context.softConstraintSettings);
        const { jobId, timetable: solution } = await client().solveAndFetch(payload);
        const summary = summarizeSoftConstraintSettings(context.softConstraintSettings);
        rememberTimetable(
          context,
          solution,
          `Solved timetable (${jobId})`,
          `Score: ${solution.score ?? 'pending'}; ${summary.enabledCount} soft constraint(s) enabled.`,
        );
        return {
          jobId,
          score: solution.score,
          solverStatus: solution.solverStatus,
          assignedLessons: solution.lessons.filter((lesson: Lesson) => lesson.timeslot && lesson.room).length,
          softConstraintsEnabled: summary.enabled,
        };
      },
    }),

    checkConstraints: tool({
      description:
        'Recalculate hard/soft score and violation labels for a timetable without running the solver. Uses the current soft-constraint selection.',
      inputSchema: z.object({
        timetable: z.any().optional(),
      }),
      execute: async ({ timetable }) => {
        const problem = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!problem) {
          throw new Error('No timetable available to score.');
        }

        const payload = withSoftConstraintSettings(problem, context.softConstraintSettings);
        const scored = await client().scoreTimetable(payload);
        rememberConstraintReport(context, scored, 'Constraint check');
        return {
          score: scored.score,
          violationCount: scored.lessons.reduce(
            (count: number, lesson: Lesson) => count + (lesson.violations?.length ?? 0),
            0,
          ),
          feasible: typeof scored.score === 'string' ? scored.score.startsWith('0hard/') : undefined,
          softConstraintsEnabled: summarizeSoftConstraintSettings(context.softConstraintSettings).enabled,
        };
      },
    }),

    analyzeTimetable: tool({
      description:
        'Analyze the current or provided timetable and return structured metrics: score, feasibility, load by teacher/group/room, violations, busiest entities, and unassigned lessons. Use this when the user asks analytical questions.',
      inputSchema: z.object({
        timetable: z.any().optional(),
        teacher: z.string().optional(),
        studentGroup: z.string().optional(),
      }),
      execute: async ({ timetable, teacher, studentGroup }) => {
        const payload = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!payload) {
          throw new Error('No timetable loaded to analyze.');
        }

        const analysis = analyzeTimetable(payload);
        context.lastTimetable = payload;
        context.attachments.push({
          type: 'analysis',
          title: 'Timetable analysis',
          summary: `Score ${analysis.score ?? 'n/a'}; ${analysis.assignedCount}/${analysis.lessonCount} assigned; ${analysis.violationCount} violation(s).`,
          timetable: payload,
          analysis,
          hardScore: analysis.hardScore,
          softScore: analysis.softScore,
          context: { teacher, studentGroup },
        });

        return analysis;
      },
    }),

    viewTimetableSummary: tool({
      description: 'Summarize the current or provided timetable for teachers, groups, and assignments.',
      inputSchema: z.object({
        timetable: z.any().optional(),
        teacher: z.string().optional(),
        studentGroup: z.string().optional(),
      }),
      execute: async ({ timetable, teacher, studentGroup }) => {
        const payload = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!payload) {
          throw new Error('No timetable loaded.');
        }

        const lessons = payload.lessons.filter((lesson: Lesson) => {
          if (teacher && lesson.teacher !== teacher) {
            return false;
          }
          if (studentGroup && lesson.studentGroup !== studentGroup) {
            return false;
          }
          return true;
        });

        return {
          name: payload.name,
          score: payload.score,
          teachers: listTeachers(payload),
          lessonCount: lessons.length,
          assignedCount: lessons.filter((lesson: Lesson) => lesson.timeslot && lesson.room).length,
          unassignedCount: lessons.filter((lesson: Lesson) => !lesson.timeslot || !lesson.room).length,
          sampleLessons: lessons.slice(0, 8).map((lesson: Lesson) => ({
            id: lesson.id,
            subject: lesson.subject,
            teacher: lesson.teacher,
            studentGroup: lesson.studentGroup,
            timeslot: lesson.timeslot,
            room: lesson.room,
            violations: lesson.violations?.map((v: { constraintName: string }) => v.constraintName) ?? [],
          })),
        };
      },
    }),

    findCommonFreeTimeslots: tool({
      description:
        'Find timeslots where all selected teachers and student groups are free on a weekday.',
      inputSchema: z.object({
        dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
        teachers: z.array(z.string()).default([]),
        studentGroups: z.array(z.string()).default([]),
        timetable: z.any().optional(),
      }),
      execute: async ({ dayOfWeek, teachers, studentGroups, timetable }) => {
        const payload = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!payload) {
          throw new Error('No timetable loaded for common-free search.');
        }
        if (teachers.length === 0 && studentGroups.length === 0) {
          throw new Error('Provide at least one teacher or student group.');
        }

        const slots = findCommonFreeTimeslots(payload, dayOfWeek, teachers, studentGroups);
        const attachment: ChatAttachment = {
          type: 'commonFreeSlots',
          title: `Common free slots on ${dayOfWeek}`,
          summary: `${slots.length} slot(s) where all selected parties are free.`,
          slots,
          timetable: payload,
          context: { dayOfWeek, teachers, studentGroups },
        };
        context.attachments.push(attachment);

        return {
          dayOfWeek,
          count: slots.length,
          slots: slots.slice(0, 20),
        };
      },
    }),

    listSoftConstraints: tool({
      description:
        'List all optional soft constraints and the current enabled/disabled state and weights. Soft constraints are off by default; enable them before solving to optimize room stability, consecutive lessons, subject variety, or lunch breaks.',
      inputSchema: z.object({}),
      execute: async () => {
        const summary = summarizeSoftConstraintSettings(context.softConstraintSettings);
        return {
          defaultWeight: DEFAULT_SOFT_CONSTRAINT_WEIGHT,
          weightRange: { min: MIN_SOFT_CONSTRAINT_WEIGHT, max: MAX_SOFT_CONSTRAINT_WEIGHT },
          enabledCount: summary.enabledCount,
          disabledCount: summary.disabledCount,
          constraints: SOFT_CONSTRAINT_DEFINITIONS.map(definition => ({
            id: definition.id,
            name: definition.name,
            label: definition.label,
            labelZh: definition.labelZh,
            enabled: context.softConstraintSettings[definition.id]?.enabled ?? false,
            weight: context.softConstraintSettings[definition.id]?.weight ?? DEFAULT_SOFT_CONSTRAINT_WEIGHT,
          })),
        };
      },
    }),

    configureSoftConstraints: tool({
      description:
        'Enable, disable, or set weights (1–100) for soft constraints before solving. Use constraint id (e.g. teacherRoomStability) or constraint name. Call listSoftConstraints first when the user asks what is available.',
      inputSchema: z.object({
        changes: z
          .array(
            z.object({
              constraint: z
                .string()
                .min(1)
                .describe('Constraint id or name, e.g. teacherRoomStability or "Teacher room stability".'),
              enabled: z.boolean().optional(),
              weight: z.number().int().min(MIN_SOFT_CONSTRAINT_WEIGHT).max(MAX_SOFT_CONSTRAINT_WEIGHT).optional(),
            }),
          )
          .optional(),
        enableAll: z.boolean().optional(),
        disableAll: z.boolean().optional(),
      }),
      execute: async ({ changes, enableAll, disableAll }) => {
        if (enableAll && disableAll) {
          throw new Error('Use either enableAll or disableAll, not both.');
        }

        if (enableAll) {
          for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
            context.softConstraintSettings[definition.id].enabled = true;
          }
        }
        if (disableAll) {
          for (const definition of SOFT_CONSTRAINT_DEFINITIONS) {
            context.softConstraintSettings[definition.id].enabled = false;
          }
        }

        for (const change of changes ?? []) {
          const definition = findSoftConstraintDefinition(change.constraint);
          if (!definition) {
            throw new Error(`Unknown soft constraint: ${change.constraint}`);
          }
          const setting = context.softConstraintSettings[definition.id];
          if (change.enabled != null) {
            setting.enabled = change.enabled;
          }
          if (change.weight != null) {
            setting.weight = change.weight;
          }
        }

        const summary = summarizeSoftConstraintSettings(context.softConstraintSettings);
        return {
          message: `${summary.enabledCount} soft constraint(s) enabled, ${summary.disabledCount} disabled.`,
          enabled: summary.enabled,
          disabled: summary.disabled.map(item => item.name),
        };
      },
    }),

    findReplacementTeachers: tool({
      description:
        'For sick-leave replacement planning: find timeslots where the target teacher is teaching but potential replacement teachers are free.',
      inputSchema: z.object({
        dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
        targetTeacher: z.string().min(1),
        potentialTeachers: z.array(z.string().min(1)).min(1),
        timetable: z.any().optional(),
      }),
      execute: async ({ dayOfWeek, targetTeacher, potentialTeachers, timetable }) => {
        const payload = (timetable ?? context.lastTimetable) as Timetable | null;
        if (!payload) {
          throw new Error('No timetable loaded for replacement search.');
        }

        const matches = findReplacementTeacherSlots(payload, dayOfWeek, targetTeacher, potentialTeachers);
        const attachment: ChatAttachment = {
          type: 'replacementSlots',
          title: `Replacement options for ${targetTeacher} on ${dayOfWeek}`,
          summary: 'Highlighted windows where replacements are free while the target teacher is teaching.',
          matches,
          timetable: payload,
          context: { dayOfWeek, targetTeacher, potentialTeachers },
        };
        context.attachments.push(attachment);

        return {
          dayOfWeek,
          targetTeacher,
          matches: matches.map((match: { potentialTeacher: string; slots: Array<{ id: string; label: string }> }) => ({
            potentialTeacher: match.potentialTeacher,
            slotCount: match.slots.length,
            sampleSlots: match.slots.slice(0, 10),
          })),
        };
      },
    }),
  };
}
