import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeTimetable } from '../src/timetable/analyzeTimetable.js';
import {
  applySoftConstraintSettingsToTimetable,
  createDefaultSoftConstraintSettings,
  findSoftConstraintDefinition,
} from '../src/timetable/softConstraints.js';
import { buildTimetableFromSubjectCards } from '../src/timetable/buildTimetable.js';
import { findCommonFreeTimeslots } from '../src/timetable/filterUtils.js';

describe('buildTimetableFromSubjectCards', () => {
  it('creates lessons and timeslots from subject cards', () => {
    const timetable = buildTimetableFromSubjectCards({
      name: 'Test timetable',
      weekdays: ['MONDAY'],
      rooms: ['Room A'],
      cards: [{
        subject: 'Math',
        teacher: 'Alice',
        studentGroup: 'G1',
        durationInMinutes: 60,
      }],
    });

    assert.equal(timetable.lessons.length, 1);
    assert.ok(timetable.timeslots.length > 0);
    assert.equal(timetable.lessons[0].timeslot, null);
  });
});

describe('analyzeTimetable', () => {
  it('computes load and assignment metrics', () => {
    const timetable = buildTimetableFromSubjectCards({
      weekdays: ['MONDAY'],
      rooms: ['Room A'],
      cards: [
        { subject: 'Math', teacher: 'Alice', studentGroup: 'G1', durationInMinutes: 120 },
        { subject: 'English', teacher: 'Bob', studentGroup: 'G2', durationInMinutes: 60 },
      ],
    });

    const analysis = analyzeTimetable(timetable);
    assert.equal(analysis.lessonCount, 2);
    assert.equal(analysis.unassignedCount, 2);
    assert.equal(analysis.teacherLoad.length, 2);
    assert.equal(analysis.busiestTeacher, 'Alice');
  });
});

describe('findCommonFreeTimeslots', () => {
  it('returns slots where selected parties are all free', () => {
    const timetable = buildTimetableFromSubjectCards({
      weekdays: ['MONDAY'],
      rooms: ['Room A', 'Room B'],
      cards: [
        { subject: 'Math', teacher: 'Alice', studentGroup: 'G1', durationInMinutes: 60 },
        { subject: 'English', teacher: 'Bob', studentGroup: 'G2', durationInMinutes: 60 },
      ],
    });

    const firstSlot = timetable.timeslots[0];
    timetable.lessons[0].timeslot = firstSlot.id;
    timetable.lessons[0].room = timetable.rooms[0].id;

    const slots = findCommonFreeTimeslots(timetable, 'MONDAY', ['Bob'], ['G2']);
    assert.ok(slots.length > 0);
  });
});

describe('softConstraints', () => {
  it('disables unchecked constraints via 0hard/0soft overrides', () => {
    const settings = createDefaultSoftConstraintSettings();
    const timetable = applySoftConstraintSettingsToTimetable(
      { timeslots: [], rooms: [], lessons: [] },
      settings,
    );

    assert.ok(timetable.constraintWeightOverrides);
    assert.equal(timetable.constraintWeightOverrides['Teacher room stability'], '0hard/0soft');
  });

  it('omits overrides when all constraints are enabled with default weight', () => {
    const settings = createDefaultSoftConstraintSettings();
    for (const key of Object.keys(settings)) {
      settings[key].enabled = true;
    }

    const timetable = applySoftConstraintSettingsToTimetable(
      { timeslots: [], rooms: [], lessons: [] },
      settings,
    );

    assert.equal(timetable.constraintWeightOverrides, undefined);
  });

  it('resolves constraint references by id or label', () => {
    assert.equal(findSoftConstraintDefinition('teacherRoomStability')?.name, 'Teacher room stability');
    assert.equal(findSoftConstraintDefinition('Teacher room stability')?.id, 'teacherRoomStability');
    assert.ok(findSoftConstraintDefinition('lunch break'));
  });

  it('finds teacherAvailability constraint definition', () => {
    const definition = findSoftConstraintDefinition('teacherAvailability');
    assert.ok(definition);
    assert.equal(definition?.id, 'teacherAvailability');
    assert.equal(definition?.name, 'Teacher availability');
    assert.equal(definition?.defaultEnabled, true);
  });

  it('defaults teacher availability constraint to enabled in createDefaultSoftConstraintSettings', () => {
    const settings = createDefaultSoftConstraintSettings();
    assert.equal(settings['teacherAvailability']?.enabled, true);
    assert.equal(settings['teacherAvailability']?.weight, 1);
  });
});
