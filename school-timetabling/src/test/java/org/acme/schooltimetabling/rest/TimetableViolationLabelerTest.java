package org.acme.schooltimetabling.rest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Room;
import org.acme.schooltimetabling.domain.Timeslot;
import org.acme.schooltimetabling.domain.TimeslotGenerator;
import org.acme.schooltimetabling.domain.Timetable;
import org.acme.schooltimetabling.domain.ViolationInfo;
import org.acme.schooltimetabling.solver.TimetableConstraintProvider;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link TimetableViolationLabeler}.
 */
class TimetableViolationLabelerTest {

    private static final Room ROOM1 = new Room("1", "Room1");
    private static final Room ROOM2 = new Room("2", "Room2");

    private static Timeslot monday830;
    private static Timeslot monday900;
    private static Timeslot monday930;
    private static Timeslot tuesday830;
    private static Timeslot tuesday930;
    private static Timeslot tuesday1100;
    private static Timeslot tuesday1200;
    private static Timeslot tuesday1230;
    private static Timeslot tuesday1300;
    private static Timeslot tuesday1330;
    private static Timeslot tuesday1400;
    private static Timeslot tuesday1700;

    @BeforeAll
    static void initTimeslots() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY));
        monday830 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(8, 30));
        monday900 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(9, 0));
        monday930 = findSlot(timeslots, DayOfWeek.MONDAY, LocalTime.of(9, 30));
        tuesday830 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(8, 30));
        tuesday930 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(9, 30));
        tuesday1100 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(11, 0));
        tuesday1200 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(12, 0));
        tuesday1230 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(12, 30));
        tuesday1300 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(13, 0));
        tuesday1330 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(13, 30));
        tuesday1400 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(14, 0));
        tuesday1700 = findSlot(timeslots, DayOfWeek.TUESDAY, LocalTime.of(17, 0));
    }

    private static Timeslot findSlot(List<Timeslot> timeslots, DayOfWeek day, LocalTime start) {
        return timeslots.stream()
                .filter(ts -> ts.getDayOfWeek() == day && ts.getStartTime().equals(start))
                .findFirst()
                .orElseThrow();
    }

    private static Timetable timetableWith(Lesson... lessons) {
        return new Timetable("test", List.of(monday830), List.of(ROOM1, ROOM2), new ArrayList<>(List.of(lessons)));
    }

    private static boolean hasViolation(Lesson lesson, String constraintName) {
        return lesson.getViolations().stream()
                .anyMatch(v -> constraintName.equals(v.getConstraintName()));
    }

    @Test
    void cleanSchedule_hasNoViolations() {
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday1200, ROOM2);
        Timetable timetable = timetableWith(morning, afternoon);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(morning.getViolations()).isEmpty();
        assertThat(afternoon.getViolations()).isEmpty();
    }

    @Test
    void roomConflict_labelsBothLessons() {
        Lesson first = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, monday830, ROOM1);
        Lesson second = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, monday900, ROOM1);
        Timetable timetable = timetableWith(first, second);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(first, "Room conflict")).isTrue();
        assertThat(hasViolation(second, "Room conflict")).isTrue();
        assertThat(first.getViolations().get(0).getScoreLevel()).isEqualTo("hard");
        assertThat(first.getViolations().get(0).getRelatedLessonIds()).containsExactly("2");
    }

    @Test
    void teacherConflict_labelsBothLessons() {
        String teacher = "Teacher1";
        Lesson first = new Lesson("1", "Subject1", teacher, "Group1", 60, monday830, ROOM1);
        Lesson second = new Lesson("2", "Subject2", teacher, "Group2", 60, monday900, ROOM2);
        Timetable timetable = timetableWith(first, second);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(first, "Teacher conflict")).isTrue();
        assertThat(hasViolation(second, "Teacher conflict")).isTrue();
    }

    @Test
    void studentGroupConflict_labelsBothLessons() {
        String group = "Group1";
        Lesson first = new Lesson("1", "Subject1", "Teacher1", group, 60, monday830, ROOM1);
        Lesson second = new Lesson("2", "Subject2", "Teacher2", group, 60, monday900, ROOM2);
        Timetable timetable = timetableWith(first, second);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(first, "Student group conflict")).isTrue();
        assertThat(hasViolation(second, "Student group conflict")).isTrue();
    }

    @Test
    void incorrectTeacher_labelsPlacementAndClearsWhenReturnedToExpectedColumn() {
        Lesson lesson = new Lesson("1", "Mathematics", "Gary Lam", "EG1A", 60, monday830, ROOM1);
        lesson.setManualTeacherPlacement("Eva Mak");
        Timetable timetable = timetableWith(lesson);

        TimetableViolationLabeler.labelViolations(timetable);

        ViolationInfo violation = lesson.getViolations().stream()
                .filter(item -> TimetableConstraintProvider.INCORRECT_TEACHER.equals(item.getConstraintName()))
                .findFirst()
                .orElseThrow();
        assertThat(violation.getScoreLevel()).isEqualTo("hard");
        assertThat(violation.getMessage()).contains("Gary Lam", "Eva Mak");

        // Returning to the expected column removes both the override and its stale label.
        lesson.setManualTeacherPlacement(null);
        TimetableViolationLabeler.labelViolations(timetable);
        assertThat(hasViolation(lesson, TimetableConstraintProvider.INCORRECT_TEACHER)).isFalse();
    }

    @Test
    void incorrectStudentGroup_labelsPlacementAndClearsWhenReturnedToExpectedColumn() {
        Lesson lesson = new Lesson("1", "Mathematics", "Gary Lam", "EG1A", 60, monday830, ROOM1);
        lesson.setManualStudentGroupPlacement("EG1B");
        Timetable timetable = timetableWith(lesson);

        TimetableViolationLabeler.labelViolations(timetable);

        ViolationInfo violation = lesson.getViolations().stream()
                .filter(item -> TimetableConstraintProvider.INCORRECT_STUDENT_GROUP.equals(item.getConstraintName()))
                .findFirst()
                .orElseThrow();
        assertThat(violation.getScoreLevel()).isEqualTo("hard");
        assertThat(violation.getMessage()).contains("EG1A", "EG1B");

        // Returning to the expected column removes both the override and its stale label.
        lesson.setManualStudentGroupPlacement(null);
        TimetableViolationLabeler.labelViolations(timetable);
        assertThat(hasViolation(lesson, TimetableConstraintProvider.INCORRECT_STUDENT_GROUP)).isFalse();
    }

    @Test
    void hardLunchOverlap_labelsViolatingLesson() {
        Lesson duringLunch = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1300, ROOM1);
        Timetable timetable = timetableWith(duringLunch);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(duringLunch, TimetableConstraintProvider.LESSON_OVERLAPS_HARD_LUNCH)).isTrue();
        assertThat(duringLunch.getViolations().get(0).getScoreLevel()).isEqualTo("hard");
    }

    @Test
    void durationOverflow_labelsViolatingLesson() {
        Lesson overflow = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1230, ROOM1);
        Timetable timetable = timetableWith(overflow);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(overflow, "Lesson duration exceeds available contiguous time")).isTrue();
    }

    @Test
    void teacherRoomStability_labelsBothLessons() {
        String teacher = "Teacher1";
        Lesson inRoom1 = new Lesson("1", "Subject1", teacher, "Group1", 60, monday830, ROOM1);
        Lesson inRoom2 = new Lesson("2", "Subject2", teacher, "Group2", 60, monday930, ROOM2);
        Timetable timetable = timetableWith(inRoom1, inRoom2);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(inRoom1, TimetableConstraintProvider.TEACHER_ROOM_STABILITY)).isTrue();
        assertThat(hasViolation(inRoom2, TimetableConstraintProvider.TEACHER_ROOM_STABILITY)).isTrue();
        assertThat(inRoom1.getViolations().get(0).getScoreLevel()).isEqualTo("soft");
    }

    @Test
    void studentRoomStability_labelsBothLessons() {
        String studentGroup = "Group1";
        Lesson inRoom1 = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, monday830, ROOM1);
        Lesson inRoom2 = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, monday930, ROOM2);
        Timetable timetable = timetableWith(inRoom1, inRoom2);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(inRoom1, TimetableConstraintProvider.STUDENT_ROOM_STABILITY)).isTrue();
        assertThat(hasViolation(inRoom2, TimetableConstraintProvider.STUDENT_ROOM_STABILITY)).isTrue();
        assertThat(inRoom1.getViolations().get(0).getScoreLevel()).isEqualTo("soft");
    }

    @Test
    void studentGroupSubjectVariety_labelsBackToBackSameSubject() {
        String group = "Group1";
        String subject = "Math";
        Lesson first = new Lesson("1", subject, "Teacher1", group, 60, tuesday830, ROOM1);
        Lesson second = new Lesson("2", subject, "Teacher2", group, 60, tuesday930, ROOM2);
        Timetable timetable = timetableWith(first, second);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(first, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY)).isTrue();
        assertThat(hasViolation(second, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY)).isTrue();
    }

    @Test
    void studentGroupSubjectTypeVariety_labelsBackToBackSharedType() {
        String group = "Group1";
        Lesson first = new Lesson("1", "Engineering Science", "Teacher1", group, 60, tuesday830, ROOM1);
        first.setSubjectTypes(List.of("Theory", "Practical"));
        Lesson second = new Lesson("2", "Workshop", "Teacher2", group, 60, tuesday930, ROOM2);
        second.setSubjectTypes(List.of("Practical"));
        Timetable timetable = timetableWith(first, second);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(first, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_TYPE_VARIETY)).isTrue();
        assertThat(hasViolation(second, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_TYPE_VARIETY)).isTrue();
        assertThat(first.getViolations().stream()
                .filter(v -> TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_TYPE_VARIETY.equals(v.getConstraintName()))
                .findFirst()
                .orElseThrow()
                .getMessage()).contains("Practical");
    }

    @Test
    void goodLunchtimeForTeacher_labelsAllLessonsOnBadDay() {
        String teacher = "Teacher1";
        Lesson morning = new Lesson("1", "Subject1", teacher, "Group1", 60, tuesday830, ROOM1);
        Lesson blocksAfterGap = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday1330, ROOM1);
        Lesson blocksBeforeGap = new Lesson("3", "Subject3", teacher, "Group3", 60, tuesday1230, ROOM2);
        Timetable timetable = timetableWith(morning, blocksAfterGap, blocksBeforeGap);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(morning, TimetableConstraintProvider.GOOD_LUNCHTIME_TEACHER)).isTrue();
        assertThat(hasViolation(blocksAfterGap, TimetableConstraintProvider.GOOD_LUNCHTIME_TEACHER)).isTrue();
        assertThat(hasViolation(blocksBeforeGap, TimetableConstraintProvider.GOOD_LUNCHTIME_TEACHER)).isTrue();
    }

    @Test
    void goodLunchtimeForStudentGroup_labelsAllLessonsOnBadDay() {
        String group = "Group1";
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", group, 60, tuesday830, ROOM1);
        Lesson blocksAfterGap = new Lesson("2", "Subject2", "Teacher2", group, 60, tuesday1330, ROOM2);
        Lesson blocksBeforeGap = new Lesson("3", "Subject3", "Teacher3", group, 60, tuesday1230, ROOM1);
        Timetable timetable = timetableWith(morning, blocksAfterGap, blocksBeforeGap);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(morning, TimetableConstraintProvider.GOOD_LUNCHTIME_STUDENT_GROUP)).isTrue();
        assertThat(hasViolation(blocksAfterGap, TimetableConstraintProvider.GOOD_LUNCHTIME_STUDENT_GROUP)).isTrue();
    }

    @Test
    void lunchTimebreak_labelsAllLessonsOnBadTeacherDay() {
        String teacher = "Teacher1";
        Lesson morning = new Lesson("1", "Subject1", teacher, "Group1", 60, tuesday830, ROOM1);
        Lesson blocksAfterGap = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday1330, ROOM1);
        Lesson blocksBeforeGap = new Lesson("3", "Subject3", teacher, "Group3", 60, tuesday1230, ROOM2);
        Timetable timetable = timetableWith(morning, blocksAfterGap, blocksBeforeGap);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(morning, TimetableConstraintProvider.LUNCH_TIMEBREAK)).isTrue();
        assertThat(hasViolation(blocksAfterGap, TimetableConstraintProvider.LUNCH_TIMEBREAK)).isTrue();
        assertThat(hasViolation(blocksBeforeGap, TimetableConstraintProvider.LUNCH_TIMEBREAK)).isTrue();
        assertThat(morning.getViolations().stream()
                .filter(v -> TimetableConstraintProvider.LUNCH_TIMEBREAK.equals(v.getConstraintName()))
                .findFirst().orElseThrow().getScoreLevel()).isEqualTo("hard");
    }

    @Test
    void lunchTimebreak_labelsAllLessonsOnBadStudentGroupDay() {
        String group = "Group1";
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", group, 60, tuesday830, ROOM1);
        Lesson blocksAfterGap = new Lesson("2", "Subject2", "Teacher2", group, 60, tuesday1330, ROOM2);
        Lesson blocksBeforeGap = new Lesson("3", "Subject3", "Teacher3", group, 60, tuesday1230, ROOM1);
        Timetable timetable = timetableWith(morning, blocksAfterGap, blocksBeforeGap);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(hasViolation(morning, TimetableConstraintProvider.LUNCH_TIMEBREAK)).isTrue();
        assertThat(hasViolation(blocksAfterGap, TimetableConstraintProvider.LUNCH_TIMEBREAK)).isTrue();
    }

    @Test
    void labelViolations_clearsPreviousLabels() {
        Lesson lesson = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1300, ROOM1);
        lesson.setViolations(List.of(new ViolationInfo("Old", "hard", "stale", List.of())));
        Timetable timetable = timetableWith(lesson);

        TimetableViolationLabeler.labelViolations(timetable);

        assertThat(lesson.getViolations()).noneMatch(v -> "Old".equals(v.getConstraintName()));
        assertThat(hasViolation(lesson, TimetableConstraintProvider.LESSON_OVERLAPS_HARD_LUNCH)).isTrue();
    }
}
