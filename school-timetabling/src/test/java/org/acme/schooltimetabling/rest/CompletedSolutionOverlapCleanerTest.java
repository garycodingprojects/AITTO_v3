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
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link CompletedSolutionOverlapCleaner}.
 * Verifies keep-earliest policy and unassignment of invalid single-lesson placements.
 */
class CompletedSolutionOverlapCleanerTest {

    private static final Room ROOM1 = new Room("1", "Room1");
    private static final Room ROOM2 = new Room("2", "Room2");

    private static Timeslot tuesday830;
    private static Timeslot tuesday900;
    private static Timeslot tuesday1200;
    private static Timeslot tuesday1230;
    private static Timeslot tuesday1300;

    @BeforeAll
    static void initTimeslots() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(DayOfWeek.TUESDAY));
        tuesday830 = findSlot(timeslots, LocalTime.of(8, 30));
        tuesday900 = findSlot(timeslots, LocalTime.of(9, 0));
        tuesday1200 = findSlot(timeslots, LocalTime.of(12, 0));
        tuesday1230 = findSlot(timeslots, LocalTime.of(12, 30));
        tuesday1300 = findSlot(timeslots, LocalTime.of(13, 0));
    }

    private static Timeslot findSlot(List<Timeslot> timeslots, LocalTime start) {
        return timeslots.stream()
                .filter(ts -> ts.getDayOfWeek() == DayOfWeek.TUESDAY && ts.getStartTime().equals(start))
                .findFirst()
                .orElseThrow();
    }

    private static Timetable timetableWith(Lesson... lessons) {
        return new Timetable("test", List.of(tuesday830), List.of(ROOM1, ROOM2), new ArrayList<>(List.of(lessons)));
    }

    private static void assertAssigned(Lesson lesson) {
        assertThat(lesson.getTimeslot()).isNotNull();
        assertThat(lesson.getRoom()).isNotNull();
    }

    private static void assertUnassigned(Lesson lesson) {
        assertThat(lesson.getTimeslot()).isNull();
        assertThat(lesson.getRoom()).isNull();
    }

    @Test
    void roomOverlap_keepsEarliestLessonAndUnassignsLater() {
        // Both lessons overlap in ROOM1 on Tuesday; 08:30 starts before 09:00.
        Lesson first = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday830, ROOM1);
        Lesson later = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday900, ROOM1);
        Timetable timetable = timetableWith(first, later);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertAssigned(first);
        assertUnassigned(later);
    }

    @Test
    void teacherOverlap_keepsEarliestLessonAndUnassignsLater() {
        String teacher = "Teacher1";
        Lesson first = new Lesson("1", "Subject1", teacher, "Group1", 60, tuesday830, ROOM1);
        Lesson later = new Lesson("2", "Subject2", teacher, "Group2", 60, tuesday900, ROOM2);
        Timetable timetable = timetableWith(first, later);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertAssigned(first);
        assertUnassigned(later);
    }

    @Test
    void studentGroupOverlap_keepsEarliestLessonAndUnassignsLater() {
        String studentGroup = "Group1";
        Lesson first = new Lesson("1", "Subject1", "Teacher1", studentGroup, 60, tuesday830, ROOM1);
        Lesson later = new Lesson("2", "Subject2", "Teacher2", studentGroup, 60, tuesday900, ROOM2);
        Timetable timetable = timetableWith(first, later);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertAssigned(first);
        assertUnassigned(later);
    }

    @Test
    void nonOverlappingLessons_remainAssigned() {
        Lesson morning = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday830, ROOM1);
        Lesson afternoon = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday1200, ROOM2);
        Timetable timetable = timetableWith(morning, afternoon);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertAssigned(morning);
        assertAssigned(afternoon);
    }

    @Test
    void hardLunchOverlap_unassignsLesson() {
        Lesson duringLunch = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1300, ROOM1);
        Timetable timetable = timetableWith(duringLunch);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertUnassigned(duringLunch);
    }

    @Test
    void durationOverflow_unassignsLesson() {
        // 12:30 allows at most 30 consecutive minutes before hard lunch; 60-minute lesson is invalid.
        Lesson overflow = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday1230, ROOM1);
        Timetable timetable = timetableWith(overflow);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertUnassigned(overflow);
    }

    @Test
    void roomOverlap_keepsPinnedLessonEvenWhenUnpinnedStartsEarlier() {
        Lesson unpinnedFirst = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday830, ROOM1);
        Lesson pinnedLater = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday900, ROOM1);
        pinnedLater.setPinned(true);
        Timetable timetable = timetableWith(unpinnedFirst, pinnedLater);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertUnassigned(unpinnedFirst);
        assertAssigned(pinnedLater);
    }

    @Test
    void roomOverlap_keepsBothLessonsWhenBothPinned() {
        Lesson pinnedFirst = new Lesson("1", "Subject1", "Teacher1", "Group1", 60, tuesday830, ROOM1);
        pinnedFirst.setPinned(true);
        Lesson pinnedLater = new Lesson("2", "Subject2", "Teacher2", "Group2", 60, tuesday900, ROOM1);
        pinnedLater.setPinned(true);
        Timetable timetable = timetableWith(pinnedFirst, pinnedLater);

        CompletedSolutionOverlapCleaner.cleanup(timetable);

        assertAssigned(pinnedFirst);
        assertAssigned(pinnedLater);
    }
}
