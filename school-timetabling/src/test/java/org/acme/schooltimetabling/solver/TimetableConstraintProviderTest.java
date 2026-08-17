package org.acme.schooltimetabling.solver;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;

import jakarta.inject.Inject;

import ai.timefold.solver.core.api.score.stream.test.ConstraintVerifier;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Room;
import org.acme.schooltimetabling.domain.Timeslot;
import org.acme.schooltimetabling.domain.TimeslotGenerator;
import org.acme.schooltimetabling.domain.Timetable;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;

@QuarkusTest
class TimetableConstraintProviderTest {

    private static final Room ROOM1 = new Room("1", "Room1");
    private static final Room ROOM2 = new Room("2", "Room2");

    private static Timeslot monday830;
    private static Timeslot monday900;
    private static Timeslot monday930;
    private static Timeslot tuesday830;
    private static Timeslot tuesday900;
    private static Timeslot tuesday930;
    private static Timeslot tuesday1100;
    private static Timeslot tuesday1430;
    private static Timeslot tuesday1600;
    private static Timeslot tuesday1700;
    private static Timeslot tuesday1300;
    private static Timeslot tuesday1200;
    private static Timeslot tuesday1230;
    private static Timeslot tuesday1330;
    private static Timeslot tuesday1400;

    @Inject
    ConstraintVerifier<TimetableConstraintProvider, Timetable> constraintVerifier;

    @BeforeAll
    static void initTimeslots() {
        var timeslots = TimeslotGenerator.generate(java.util.EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY));
        monday830 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(8, 30));
        monday900 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(9, 0));
        monday930 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(9, 30));
        tuesday830 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(8, 30));
        tuesday900 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(9, 0));
        tuesday930 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(9, 30));
        tuesday1100 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(11, 0));
        tuesday1430 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(14, 30));
        tuesday1600 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(16, 0));
        tuesday1700 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(17, 0));
        tuesday1200 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(12, 0));
        tuesday1230 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(12, 30));
        tuesday1300 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(13, 0));
        tuesday1330 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(13, 30));
        tuesday1400 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(14, 0));
    }

    private static Timeslot findSlot(java.util.List<Timeslot> timeslots, DayOfWeek day, LocalTime start) {
        return timeslots.stream()
                .filter(ts -> ts.getDayOfWeek() == day && ts.getStartTime().equals(start))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void roomConflict_overlappingDifferentStartSlots() {
        Lesson firstLesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        Lesson overlappingLesson = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, monday900, ROOM1);
        Lesson nonOverlappingLesson = new Lesson("3", "Subject3", "Teacher3", "Group3", 60, tuesday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::roomConflict)
                .given(firstLesson, overlappingLesson, nonOverlappingLesson)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void roomConflict_adjacentNonOverlapping() {
        Lesson firstLesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        Lesson adjacentLesson = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, monday930, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::roomConflict)
                .given(firstLesson, adjacentLesson)
                .penalizesBy(0);
    }

    @Test
    void teacherConflict() {
        String conflictingTeacher = "Teacher1";
        Lesson firstLesson = new Lesson("1", "Subject1", conflictingTeacher, "Group1", 60, monday830, ROOM1);
        Lesson conflictingLesson = new Lesson("2", "Subject2", conflictingTeacher, "Group2", 60, monday900, ROOM2);
        Lesson nonConflictingLesson = new Lesson("3", "Subject3", "Teacher2", "Group3", 60, tuesday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherConflict)
                .given(firstLesson, conflictingLesson, nonConflictingLesson)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void studentGroupConflict() {
        String conflictingGroup = "Group1";
        Lesson firstLesson = new Lesson("1", "Subject1", "Teacher1", conflictingGroup, 60, monday830, ROOM1);
        Lesson conflictingLesson = new Lesson("2", "Subject2", "Teacher2", conflictingGroup, 60, monday900, ROOM2);
        Lesson nonConflictingLesson = new Lesson("3", "Subject3", "Teacher3", "Group3", 60, tuesday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentGroupConflict)
                .given(firstLesson, conflictingLesson, nonConflictingLesson)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void incorrectTeacher_onlyPenalizesMismatchedManualPlacement() {
        Lesson misplaced = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        misplaced.setManualTeacherPlacement("Teacher2");
        Lesson matching = new Lesson("2", "Subject2", "Teacher1", "Group2", 60, monday900, ROOM2);
        matching.setManualTeacherPlacement("Teacher1");
        Lesson canonical = new Lesson("3", "Subject3", "Teacher2", "Group3", 60, monday930, ROOM1);

        // Matching and absent placements are canonical and must not add hard penalties.
        constraintVerifier.verifyThat(TimetableConstraintProvider::incorrectTeacher)
                .given(misplaced, matching, canonical)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void incorrectStudentGroup_onlyPenalizesMismatchedManualPlacement() {
        Lesson misplaced = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        misplaced.setManualStudentGroupPlacement("Group2");
        Lesson matching = new Lesson("2", "Subject2", "Teacher2", "Group1", 60, monday900, ROOM2);
        matching.setManualStudentGroupPlacement("Group1");
        Lesson canonical = new Lesson("3", "Subject3", "Teacher3", "Group2", 60, monday930, ROOM1);

        // Matching and absent placements are canonical and must not add hard penalties.
        constraintVerifier.verifyThat(TimetableConstraintProvider::incorrectStudentGroup)
                .given(misplaced, matching, canonical)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void lessonDurationFitsStartTimeslot_invalidCrossesSchoolDayEnd() {
        Lesson tooLongForEndOfDay = new Lesson("1", "Physical education", "Teacher1", "Group1", 180, tuesday1700, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lessonDurationFitsStartTimeslot)
                .given(tooLongForEndOfDay)
                .penalizesBy(5 * TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void lessonDurationFitsStartTimeslot_validThreeHourStart() {
        Lesson validThreeHour = new Lesson("1", "Physical education", "Teacher1", "Group1", 180, tuesday1430, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lessonDurationFitsStartTimeslot)
                .given(validThreeHour)
                .penalizesBy(0);
    }

    @Test
    void teacherRoomStability() {
        String teacher = "Teacher1";
        Lesson lessonInFirstRoom = new Lesson("1", "Subject1", teacher, "Group1", 60, monday830, ROOM1);
        Lesson lessonInSameRoom = new Lesson("2", "Subject2", teacher, "Group2", 60, monday830, ROOM1);
        Lesson lessonInDifferentRoom = new Lesson("3", "Subject3", teacher, "Group3", 60, monday830, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherRoomStability)
                .given(lessonInFirstRoom, lessonInDifferentRoom, lessonInSameRoom)
                .penalizesBy(2);
    }

    @Test
    void studentRoomStability() {
        String studentGroup = "Group1";
        Lesson lessonInFirstRoom = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, monday830, ROOM1);
        Lesson lessonInSameRoom = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, monday930, ROOM1);
        Lesson lessonInDifferentRoom = new Lesson("3", "Subject3", "Teacher3", studentGroup, 60, tuesday830, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentRoomStability)
                .given(lessonInFirstRoom, lessonInDifferentRoom, lessonInSameRoom)
                .penalizesBy(2);
    }

    @Test
    void teacherTimeEfficiency() {
        String teacher = "Teacher1";
        Lesson singleLessonOnMonday = new Lesson("1", "Subject1", teacher, "Group1", 60, monday830, ROOM1);
        Lesson firstTuesdayLesson = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday830, ROOM1);
        Lesson secondTuesdayLesson = new Lesson("3", "Subject3", teacher, "Group3", 60, tuesday930, ROOM1);
        Lesson thirdTuesdayLessonWithGap = new Lesson("4", "Subject4", teacher, "Group4", 60, tuesday1100, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherTimeEfficiency)
                .given(singleLessonOnMonday, firstTuesdayLesson, secondTuesdayLesson, thirdTuesdayLessonWithGap)
                .rewardsWith(1);

        Lesson altSecondTuesdayLesson = new Lesson("2", "Subject2", teacher, "Group3", 60, tuesday930, ROOM1);
        Lesson altFirstTuesdayLesson = new Lesson("3", "Subject3", teacher, "Group2", 60, tuesday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherTimeEfficiency)
                .given(altSecondTuesdayLesson, altFirstTuesdayLesson)
                .rewardsWith(1);
    }

    @Test
    void studentTimeEfficiency() {
        String studentGroup = "Group1";
        // Same group, different day: no back-to-back pair on one day.
        Lesson singleLessonOnMonday = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, monday830, ROOM1);
        Lesson firstTuesdayLesson = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday830, ROOM1);
        // Back-to-back on Tuesday for the same student group.
        Lesson secondTuesdayLesson = new Lesson("3", "Subject3", "Teacher3", studentGroup, 60, tuesday930, ROOM1);
        // Same group but a gap before this lesson: no extra reward with the pair above.
        Lesson thirdTuesdayLessonWithGap = new Lesson("4", "Subject4", "Teacher4", studentGroup, 60, tuesday1100, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentTimeEfficiency)
                .given(singleLessonOnMonday, firstTuesdayLesson, secondTuesdayLesson, thirdTuesdayLessonWithGap)
                .rewardsWith(1);

        // Order of lessons in the pair should not matter.
        Lesson altSecondTuesdayLesson = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday930, ROOM1);
        Lesson altFirstTuesdayLesson = new Lesson("3", "Subject3", "Teacher3", studentGroup, 60, tuesday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentTimeEfficiency)
                .given(altSecondTuesdayLesson, altFirstTuesdayLesson)
                .rewardsWith(1);
    }

    @Test
    void lessonDoesNotOverlapHardLunch() {
        Lesson lessonDuringHardLunch = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1300, ROOM1);
        // Ends exactly at 13:00 — adjacent to but not overlapping the hard lunch block [13:00, 13:30).
        Lesson lessonBeforeLunch = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday1200, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lessonDoesNotOverlapHardLunch)
                .given(lessonDuringHardLunch)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lessonDoesNotOverlapHardLunch)
                .given(lessonBeforeLunch)
                .penalizesBy(0);
    }

    @Test
    void goodLunchtimeForTeacher() {
        String teacher = "Teacher1";
        Lesson morning = new Lesson("1", "Subject1", teacher, "Group1", 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday1400, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::goodLunchtimeForTeacher)
                .given(morning, afternoon)
                .penalizesBy(0);

        Lesson throughHardLunch = new Lesson("3", "Subject3", teacher, "Group3", 60, tuesday1300, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::goodLunchtimeForTeacher)
                .given(morning, throughHardLunch)
                .penalizesBy(1);
    }

    @Test
    void goodLunchtimeForStudentGroup() {
        String studentGroup = "Group1";
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday1330, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::goodLunchtimeForStudentGroup)
                .given(morning, afternoon)
                .penalizesBy(0);

        Lesson blocksAfterLunchGap = new Lesson("3", "Subject3", "Teacher3", studentGroup, 60, tuesday1330, ROOM1);
        Lesson blocksBeforeLunchGap = new Lesson("4", "Subject4", "Teacher4", studentGroup, 60, tuesday1230, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::goodLunchtimeForStudentGroup)
                .given(morning, blocksAfterLunchGap, blocksBeforeLunchGap)
                .penalizesBy(1);
    }

    @Test
    void lunchTimebreakForTeachers() {
        String teacher = "Teacher1";
        Lesson morning = new Lesson("1", "Subject1", teacher, "Group1", 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday1400, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lunchTimebreakForTeachers)
                .given(morning, afternoon)
                .penalizesBy(0);

        Lesson blocksAfterLunchGap = new Lesson("3", "Subject3", teacher, "Group3", 60, tuesday1330, ROOM1);
        Lesson blocksBeforeLunchGap = new Lesson("4", "Subject4", teacher, "Group4", 60, tuesday1230, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lunchTimebreakForTeachers)
                .given(morning, blocksAfterLunchGap, blocksBeforeLunchGap)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void lunchTimebreakForStudentGroups() {
        String studentGroup = "Group1";
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday1330, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lunchTimebreakForStudentGroups)
                .given(morning, afternoon)
                .penalizesBy(0);

        Lesson blocksAfterLunchGap = new Lesson("3", "Subject3", "Teacher3", studentGroup, 60, tuesday1330, ROOM1);
        Lesson blocksBeforeLunchGap = new Lesson("4", "Subject4", "Teacher4", studentGroup, 60, tuesday1230, ROOM2);
        constraintVerifier.verifyThat(TimetableConstraintProvider::lunchTimebreakForStudentGroups)
                .given(morning, blocksAfterLunchGap, blocksBeforeLunchGap)
                .penalizesBy(TimetableConstraintProvider.HARD_VIOLATION_WEIGHT);
    }

    @Test
    void studentGroupSubjectVariety() {
        String studentGroup = "Group1";
        String repeatedSubject = "Subject1";
        Lesson mondayLesson = new Lesson("1", repeatedSubject, "Teacher1", studentGroup, 60, monday830, ROOM1);
        Lesson firstTuesdayLesson = new Lesson("2", repeatedSubject, "Teacher2", studentGroup, 60, tuesday830, ROOM1);
        Lesson secondTuesdayLesson = new Lesson("3", repeatedSubject, "Teacher3", studentGroup, 60, tuesday930, ROOM1);
        Lesson thirdTuesdayLessonWithDifferentSubject = new Lesson("4", "Subject2", "Teacher4", studentGroup, 60,
                tuesday1100, ROOM1);
        Lesson lessonInAnotherGroup = new Lesson("5", repeatedSubject, "Teacher5", "Group2", 60, monday830, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentGroupSubjectVariety)
                .given(mondayLesson, firstTuesdayLesson, secondTuesdayLesson, thirdTuesdayLessonWithDifferentSubject,
                        lessonInAnotherGroup)
                .penalizesBy(1);
    }

    @Test
    void studentGroupSubjectTypeVariety_sharedTypePenalizes() {
        String studentGroup = "Group1";
        Lesson firstTuesdayLesson = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        firstTuesdayLesson.setSubjectTypes(List.of("Theory", "Practical"));
        Lesson secondTuesdayLesson = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday930, ROOM1);
        secondTuesdayLesson.setSubjectTypes(List.of("Practical", "STEM"));
        Lesson lessonInAnotherGroup = new Lesson("3", "Subject3", "Teacher3", "Group2", 60, tuesday830, ROOM1);
        lessonInAnotherGroup.setSubjectTypes(List.of("Practical"));
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentGroupSubjectTypeVariety)
                .given(firstTuesdayLesson, secondTuesdayLesson, lessonInAnotherGroup)
                .penalizesBy(1);
    }

    @Test
    void studentGroupSubjectTypeVariety_noSharedTypeDoesNotPenalize() {
        String studentGroup = "Group1";
        Lesson firstTuesdayLesson = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        firstTuesdayLesson.setSubjectTypes(List.of("Theory"));
        Lesson secondTuesdayLesson = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday930, ROOM1);
        secondTuesdayLesson.setSubjectTypes(List.of("Practical"));
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentGroupSubjectTypeVariety)
                .given(firstTuesdayLesson, secondTuesdayLesson)
                .penalizesBy(0);
    }

    @Test
    void studentGroupSubjectTypeVariety_emptyTypesDoesNotPenalize() {
        String studentGroup = "Group1";
        String repeatedSubject = "Subject1";
        Lesson firstTuesdayLesson = new Lesson("1", repeatedSubject, "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        Lesson secondTuesdayLesson = new Lesson("2", repeatedSubject, "Teacher2", studentGroup, 60, tuesday930, ROOM1);
        constraintVerifier.verifyThat(TimetableConstraintProvider::studentGroupSubjectTypeVariety)
                .given(firstTuesdayLesson, secondTuesdayLesson)
                .penalizesBy(0);
    }

    @Test
    void roomPriority_higherPriorityScoresMore() {
        Room priorityRoom = new Room("2", "PriorityRoom", 2);
        Room zeroPriorityRoom = new Room("1", "ZeroRoom", 0);
        Lesson lessonInPriorityRoom = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, priorityRoom);
        Lesson lessonInZeroRoom = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, monday900, zeroPriorityRoom);
        constraintVerifier.verifyThat(TimetableConstraintProvider::roomPriority)
                .given(lessonInPriorityRoom, lessonInZeroRoom)
                .rewardsWith(2);

        Room negativePriorityRoom = new Room("3", "NegativeRoom", -1);
        Lesson lessonInNegativeRoom = new Lesson("3", "Subject3", "Teacher3", "Group3", 60, monday930, negativePriorityRoom);
        constraintVerifier.verifyThat(TimetableConstraintProvider::roomPriority)
                .given(lessonInPriorityRoom, lessonInNegativeRoom)
                .rewardsWith(2);
    }

    @Test
    void roomPriority_unassignedLessonsDoNotContribute() {
        Room priorityRoom = new Room("1", "PriorityRoom", 5);
        Lesson unassignedLesson = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, monday900, null);
        constraintVerifier.verifyThat(TimetableConstraintProvider::roomPriority)
                .given(unassignedLesson)
                .rewardsWith(0);
    }

    @Test
    void teacherAvailability_lessonOnUnavailableDayScores1Soft() {
        Lesson availableLesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        availableLesson.setTeacherUnavailableDays(List.of());
        Lesson unavailableMondayLesson = new Lesson("2", "Subject2", "Teacher1", "Group2", 60, monday900, ROOM1);
        unavailableMondayLesson.setTeacherUnavailableDays(List.of("MONDAY"));
        Lesson unavailableTuesdayLesson = new Lesson("3", "Subject3", "Teacher1", "Group3", 60, tuesday900, ROOM2);
        unavailableTuesdayLesson.setTeacherUnavailableDays(List.of("TUESDAY"));
        Lesson availableTuesdayLesson = new Lesson("4", "Subject4", "Teacher1", "Group4", 60, tuesday830, ROOM1);
        availableTuesdayLesson.setTeacherUnavailableDays(List.of("MONDAY"));
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherAvailability)
                .given(availableLesson, unavailableMondayLesson, unavailableTuesdayLesson, availableTuesdayLesson)
                .penalizesBy(2);
    }

    @Test
    void teacherAvailability_allDaysAvailableScores0Soft() {
        Lesson availableMondayLesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        availableMondayLesson.setTeacherUnavailableDays(List.of());
        Lesson availableTuesdayLesson = new Lesson("2", "Subject2", "Teacher1", "Group2", 60, tuesday900, ROOM2);
        availableTuesdayLesson.setTeacherUnavailableDays(List.of());
        Lesson availableWednesdayLesson = new Lesson("3", "Subject3", "Teacher1", "Group3", 60, monday930, ROOM1);
        availableWednesdayLesson.setTeacherUnavailableDays(List.of());
        constraintVerifier.verifyThat(TimetableConstraintProvider::teacherAvailability)
                .given(availableMondayLesson, availableTuesdayLesson, availableWednesdayLesson)
                .penalizesBy(0);
    }

    @Test
    void preferredWeekday_lessonOutsidePreferredDaysScores1Soft() {
        Lesson preferredMondayLesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        preferredMondayLesson.setPreferredWeekdays(List.of("MONDAY", "TUESDAY"));
        Lesson outsidePreferredLesson = new Lesson("2", "Subject2", "Teacher1", "Group2", 60, tuesday900, ROOM1);
        outsidePreferredLesson.setPreferredWeekdays(List.of("MONDAY"));
        Lesson preferredTuesdayLesson = new Lesson("3", "Subject3", "Teacher1", "Group3", 60, tuesday830, ROOM2);
        preferredTuesdayLesson.setPreferredWeekdays(List.of("TUESDAY"));
        Lesson anotherOutsideLesson = new Lesson("4", "Subject4", "Teacher1", "Group4", 60, monday900, ROOM1);
        anotherOutsideLesson.setPreferredWeekdays(List.of("TUESDAY", "WEDNESDAY"));
        constraintVerifier.verifyThat(TimetableConstraintProvider::preferredWeekday)
                .given(preferredMondayLesson, outsidePreferredLesson, preferredTuesdayLesson, anotherOutsideLesson)
                .penalizesBy(2);
    }

    @Test
    void preferredWeekday_allDaysPreferredOrEmptyScores0Soft() {
        Lesson allDaysPreferred = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        allDaysPreferred.setPreferredWeekdays(
                List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"));
        Lesson emptyPreferred = new Lesson("2", "Subject2", "Teacher1", "Group2", 60, tuesday900, ROOM2);
        emptyPreferred.setPreferredWeekdays(List.of());
        Lesson matchingPreferred = new Lesson("3", "Subject3", "Teacher1", "Group3", 60, monday930, ROOM1);
        matchingPreferred.setPreferredWeekdays(List.of("MONDAY"));
        constraintVerifier.verifyThat(TimetableConstraintProvider::preferredWeekday)
                .given(allDaysPreferred, emptyPreferred, matchingPreferred)
                .penalizesBy(0);
    }

    @Test
    void parallelSubject_differentStartTimesScores1Soft() {
        Lesson mathLesson = new Lesson("1", "Math", "Teacher1", "Group1", 60, monday830, ROOM1);
        mathLesson.setParallelCardIds(List.of("2"));
        Lesson physicsLesson = new Lesson("2", "Physics", "Teacher2", "Group2", 60, tuesday900, ROOM2);
        physicsLesson.setParallelCardIds(List.of());
        constraintVerifier.verifyThat(TimetableConstraintProvider::parallelSubject)
                .given(mathLesson, physicsLesson)
                .penalizesBy(1);
    }

    @Test
    void parallelSubject_sameStartOrEmptyOrSameTeacherGroupScores0Soft() {
        Lesson alignedMath = new Lesson("1", "Math", "Teacher1", "Group1", 60, monday830, ROOM1);
        alignedMath.setParallelCardIds(List.of("2"));
        Lesson alignedPhysics = new Lesson("2", "Physics", "Teacher2", "Group2", 60, monday830, ROOM2);
        alignedPhysics.setParallelCardIds(List.of());

        Lesson unpairedChem = new Lesson("3", "Chemistry", "Teacher3", "Group3", 60, monday900, ROOM1);
        unpairedChem.setParallelCardIds(List.of());
        Lesson unpairedBio = new Lesson("4", "Biology", "Teacher4", "Group4", 60, tuesday830, ROOM2);
        unpairedBio.setParallelCardIds(List.of());

        Lesson sameTeacherEnglish = new Lesson("5", "English", "Teacher5", "Group5", 60, monday830, ROOM1);
        sameTeacherEnglish.setParallelCardIds(List.of("6"));
        Lesson sameTeacherHistory = new Lesson("6", "History", "Teacher5", "Group6", 60, tuesday900, ROOM2);
        sameTeacherHistory.setParallelCardIds(List.of());

        Lesson sameGroupArt = new Lesson("7", "Art", "Teacher7", "Group7", 60, monday830, ROOM1);
        sameGroupArt.setParallelCardIds(List.of("8"));
        Lesson sameGroupMusic = new Lesson("8", "Music", "Teacher8", "Group7", 60, tuesday900, ROOM2);
        sameGroupMusic.setParallelCardIds(List.of());

        constraintVerifier.verifyThat(TimetableConstraintProvider::parallelSubject)
                .given(alignedMath, alignedPhysics, unpairedChem, unpairedBio,
                        sameTeacherEnglish, sameTeacherHistory, sameGroupArt, sameGroupMusic)
                .penalizesBy(0);
    }

}
