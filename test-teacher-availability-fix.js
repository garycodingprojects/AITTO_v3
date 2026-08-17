import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock the preparation functions for testing
const mockPreparationState = {
  teachers: [],
  cards: [],
  teacherAvailability: {}
};

const TEACHER_AVAILABILITY_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

// Mock the functions we need to test
function deriveTeacherAvailabilityFromCards() {
  mockPreparationState.teacherAvailability = {};
  
  // Initialize all teachers as available all days
  for (const teacher of mockPreparationState.teachers) {
    mockPreparationState.teacherAvailability[teacher] = TEACHER_AVAILABILITY_DAYS.slice();
  }
  
  // Collect unavailable days from each card
  for (const card of mockPreparationState.cards) {
    if (!card.teacher || !card.teacherUnavailableDays || card.teacherUnavailableDays.length === 0) {
      continue;
    }
    
    const teacher = card.teacher;
    if (!mockPreparationState.teacherAvailability[teacher]) {
      mockPreparationState.teacherAvailability[teacher] = TEACHER_AVAILABILITY_DAYS.slice();
    }
    
    // Remove unavailable days from the teacher's available days
    mockPreparationState.teacherAvailability[teacher] = mockPreparationState.teacherAvailability[teacher]
      .filter(day => !card.teacherUnavailableDays.includes(day));
  }
}

function normalizeCard(raw) {
  return {
    id: raw.id,
    subjectName: raw.subjectName,
    durationInMinutes: raw.durationInMinutes,
    studentGroup: raw.studentGroup,
    teacher: raw.teacher == null || raw.teacher === "" ? null : raw.teacher,
    subjectTypes: raw.subjectTypes || [],
    roomNames: raw.roomNames || [],
    teacherUnavailableDays: (raw.teacherUnavailableDays || []).map(day => String(day).trim()).filter(day => day)
  };
}

test('deriveTeacherAvailabilityFromCards correctly derives teacher availability from workspace', () => {
  // Load the workspace file
  const workspacePath = 'C:\\Users\\kwgar\\Downloads\\preparation-workspace (7).json';
  const workspaceJson = JSON.parse(readFileSync(workspacePath, 'utf8'));
  
  // Set up mock state
  mockPreparationState.teachers = workspaceJson.preparation.teachers;
  mockPreparationState.cards = workspaceJson.preparation.cards.map(normalizeCard);
  
  // Call the function to test
  deriveTeacherAvailabilityFromCards();
  
  // Verify the results
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].length, 4);
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].includes('MONDAY'), false);
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].includes('TUESDAY'), true);
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].includes('WEDNESDAY'), true);
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].includes('THURSDAY'), true);
  assert.strictEqual(mockPreparationState.teacherAvailability['Gary Lam'].includes('FRIDAY'), true);
  
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].length, 3);
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].includes('MONDAY'), false);
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].includes('TUESDAY'), false);
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].includes('WEDNESDAY'), true);
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].includes('THURSDAY'), true);
  assert.strictEqual(mockPreparationState.teacherAvailability['Eva Mak'].includes('FRIDAY'), true);
  
  assert.strictEqual(mockPreparationState.teacherAvailability['Johnny Kwong'].length, 5);
  assert.strictEqual(mockPreparationState.teacherAvailability['Rex Boo'].length, 5);
});

test('updateCardsForTeacherAvailability correctly updates cards', () => {
  // Set up initial state
  mockPreparationState.teachers = ['Gary Lam', 'Eva Mak'];
  mockPreparationState.cards = [
    { id: '1', teacher: 'Gary Lam', teacherUnavailableDays: [] },
    { id: '2', teacher: 'Eva Mak', teacherUnavailableDays: [] }
  ];
  mockPreparationState.teacherAvailability = {
    'Gary Lam': ['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], // Monday unavailable
    'Eva Mak': ['WEDNESDAY', 'THURSDAY', 'FRIDAY'] // Monday and Tuesday unavailable
  };
  
  // Mock the updateCardsForTeacherAvailability function
  function updateCardsForTeacherAvailability(teacherName) {
    const availableDays = mockPreparationState.teacherAvailability[teacherName] || TEACHER_AVAILABILITY_DAYS.slice();
    const unavailableDays = TEACHER_AVAILABILITY_DAYS.filter(day => !availableDays.includes(day));
    
    for (const card of mockPreparationState.cards) {
      if (card.teacher === teacherName) {
        card.teacherUnavailableDays = unavailableDays.slice();
      }
    }
  }
  
  // Call the function
  updateCardsForTeacherAvailability('Gary Lam');
  updateCardsForTeacherAvailability('Eva Mak');
  
  // Verify the results
  assert.deepStrictEqual(mockPreparationState.cards[0].teacherUnavailableDays, ['MONDAY']);
  assert.deepStrictEqual(mockPreparationState.cards[1].teacherUnavailableDays, ['MONDAY', 'TUESDAY']);
});
