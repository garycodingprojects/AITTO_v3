import { test } from 'node:test';
import assert from 'node:assert';

// Mock the complete flow
const TEACHER_AVAILABILITY_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

function deriveTeacherAvailabilityFromCards(teachers, cards) {
  const teacherAvailability = {};
  
  // Initialize all teachers as available all days
  for (const teacher of teachers) {
    teacherAvailability[teacher] = TEACHER_AVAILABILITY_DAYS.slice();
  }
  
  // Collect unavailable days from each card
  for (const card of cards) {
    if (!card.teacher || !card.teacherUnavailableDays || card.teacherUnavailableDays.length === 0) {
      continue;
    }
    
    const teacher = card.teacher;
    if (!teacherAvailability[teacher]) {
      teacherAvailability[teacher] = TEACHER_AVAILABILITY_DAYS.slice();
    }
    
    // Remove unavailable days from the teacher's available days
    teacherAvailability[teacher] = teacherAvailability[teacher]
      .filter(day => !card.teacherUnavailableDays.includes(day));
  }
  
  return teacherAvailability;
}

function buildTimetableJson(cards, teacherAvailability) {
  return cards.map(card => {
    // Derive teacherUnavailableDays from teacherAvailability map
    let teacherUnavailableDays = [];
    if (card.teacher && teacherAvailability[card.teacher]) {
      const availableDays = teacherAvailability[card.teacher];
      teacherUnavailableDays = TEACHER_AVAILABILITY_DAYS.filter(day => !availableDays.includes(day));
    }
    
    return {
      id: card.id,
      subject: card.subjectName,
      teacher: card.teacher,
      studentGroup: card.studentGroup,
      teacherUnavailableDays: teacherUnavailableDays
    };
  });
}

test('complete flow: workspace loading to timetable building', () => {
  // Simulate the workspace data
  const teachers = ['Eva Mak', 'Gary Lam', 'Johnny Kwong', 'Rex Boo'];
  const cards = [
    { id: '0001', subjectName: 'Math', teacher: 'Gary Lam', studentGroup: 'EG1A', teacherUnavailableDays: [] },
    { id: '0002', subjectName: 'Math', teacher: 'Gary Lam', studentGroup: 'EG1B', teacherUnavailableDays: [] },
    { id: '0003', subjectName: 'English', teacher: 'Eva Mak', studentGroup: 'EG1A', teacherUnavailableDays: ['MONDAY', 'TUESDAY'] },
    { id: '0004', subjectName: 'Chinese', teacher: 'Johnny Kwong', studentGroup: 'EG1B', teacherUnavailableDays: [] },
    { id: '0005', subjectName: 'Physics', teacher: 'Rex Boo', studentGroup: 'EG1A', teacherUnavailableDays: [] },
    { id: '0006', subjectName: 'Physics', teacher: 'Rex Boo', studentGroup: 'EG1B', teacherUnavailableDays: [] }
  ];
  
  // Step 1: Derive teacher availability from cards (workspace loading)
  const teacherAvailability = deriveTeacherAvailabilityFromCards(teachers, cards);
  
  // Verify the derived availability
  assert.deepStrictEqual(teacherAvailability['Gary Lam'], TEACHER_AVAILABILITY_DAYS);
  assert.deepStrictEqual(teacherAvailability['Eva Mak'], ['WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  assert.deepStrictEqual(teacherAvailability['Johnny Kwong'], TEACHER_AVAILABILITY_DAYS);
  assert.deepStrictEqual(teacherAvailability['Rex Boo'], TEACHER_AVAILABILITY_DAYS);
  
  // Step 2: Build timetable JSON (solve function)
  const timetable = buildTimetableJson(cards, teacherAvailability);
  
  // Verify the timetable JSON has correct teacherUnavailableDays
  const garyLesson = timetable.find(l => l.teacher === 'Gary Lam');
  const evaLesson = timetable.find(l => l.teacher === 'Eva Mak');
  
  assert.deepStrictEqual(garyLesson.teacherUnavailableDays, []);
  assert.deepStrictEqual(evaLesson.teacherUnavailableDays, ['MONDAY', 'TUESDAY']);
  
  console.log('✅ Complete flow test passed!');
  console.log('Gary Lam available days:', teacherAvailability['Gary Lam']);
  console.log('Eva Mak available days:', teacherAvailability['Eva Mak']);
  console.log('Gary Lam lesson unavailable days:', garyLesson.teacherUnavailableDays);
  console.log('Eva Mak lesson unavailable days:', evaLesson.teacherUnavailableDays);
});
