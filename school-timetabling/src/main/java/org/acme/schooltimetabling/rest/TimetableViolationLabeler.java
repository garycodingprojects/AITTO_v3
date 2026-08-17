package org.acme.schooltimetabling.rest;

import java.time.DayOfWeek;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import ai.timefold.solver.core.api.score.HardSoftScore;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Timetable;
import org.acme.schooltimetabling.domain.ViolationInfo;
import org.acme.schooltimetabling.solver.TimetableConstraintProvider;

/**
 * Populates per-lesson violation labels by mirroring penalty constraints from
 * {@link TimetableConstraintProvider}. Soft reward constraints (time efficiency) are not labeled.
 */
public final class TimetableViolationLabeler {

    private static final String LESSON_DURATION_EXCEEDS = "Lesson duration exceeds available contiguous time";
    private static final String ROOM_CONFLICT = "Room conflict";
    private static final String TEACHER_CONFLICT = "Teacher conflict";
    private static final String STUDENT_GROUP_CONFLICT = "Student group conflict";

    private TimetableViolationLabeler() {
    }

    /** Clears and repopulates {@code timetable.lessons[*].violations} for UI display. */
    public static void labelViolations(Timetable timetable) {
        if (timetable.getLessons() == null) {
            return;
        }
        clearViolations(timetable.getLessons());
        List<Lesson> assignedLessons = timetable.getLessons().stream()
                .filter(lesson -> lesson.getTimeslot() != null)
                .toList();

        labelSingleLessonHardViolations(assignedLessons);
        labelManualPlacementHardViolations(timetable.getLessons());
        labelPairHardConflicts(assignedLessons);
        labelLunchTimebreak(assignedLessons);
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.TEACHER_ROOM_STABILITY)) {
            labelTeacherRoomStability(timetable.getLessons());
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.STUDENT_ROOM_STABILITY)) {
            labelStudentRoomStability(timetable.getLessons());
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY)) {
            labelStudentGroupSubjectVariety(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_TYPE_VARIETY)) {
            labelStudentGroupSubjectTypeVariety(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.GOOD_LUNCHTIME_TEACHER)) {
            labelGoodLunchtimeForTeachers(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.GOOD_LUNCHTIME_STUDENT_GROUP)) {
            labelGoodLunchtimeForStudentGroups(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.TEACHER_AVAILABILITY)) {
            labelTeacherAvailability(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.PREFERRED_WEEKDAY)) {
            labelPreferredWeekday(assignedLessons);
        }
        if (isSoftConstraintEnabled(timetable, TimetableConstraintProvider.PARALLEL_SUBJECT)) {
            labelParallelSubject(assignedLessons);
        }
    }

    private static void clearViolations(List<Lesson> lessons) {
        for (Lesson lesson : lessons) {
            lesson.setViolations(new ArrayList<>());
        }
    }

    /** True when the soft constraint is not disabled via weight override (0hard/0soft). */
    private static boolean isSoftConstraintEnabled(Timetable timetable, String constraintName) {
        HardSoftScore weight = timetable.getConstraintWeightOverrides().getConstraintWeight(constraintName);
        return weight == null || !HardSoftScore.ZERO.equals(weight);
    }

    private static void labelSingleLessonHardViolations(List<Lesson> assignedLessons) {
        for (Lesson lesson : assignedLessons) {
            if (!lesson.fitsAtStartTimeslot()) {
                addViolation(lesson, new ViolationInfo(
                        LESSON_DURATION_EXCEEDS,
                        "hard",
                        "Lesson duration exceeds contiguous time available from the chosen start slot.",
                        List.of()));
            }
            if (lesson.overlapsHardLunch()) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.LESSON_OVERLAPS_HARD_LUNCH,
                        "hard",
                        "Lesson overlaps the mandatory hard lunch block (13:00–13:30).",
                        List.of()));
            }
        }
    }

    /** Labels manual teacher/group column choices that differ from each lesson's fixed identity. */
    private static void labelManualPlacementHardViolations(List<Lesson> lessons) {
        for (Lesson lesson : lessons) {
            String teacherPlacement = lesson.getManualTeacherPlacement();
            if (teacherPlacement != null && !Objects.equals(lesson.getTeacher(), teacherPlacement)) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.INCORRECT_TEACHER,
                        "hard",
                        "Incorrect teacher: expected " + lesson.getTeacher() + " but placed under " + teacherPlacement + ".",
                        List.of()));
            }

            String studentGroupPlacement = lesson.getManualStudentGroupPlacement();
            if (studentGroupPlacement != null && !Objects.equals(lesson.getStudentGroup(), studentGroupPlacement)) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.INCORRECT_STUDENT_GROUP,
                        "hard",
                        "Incorrect student group: expected " + lesson.getStudentGroup()
                                + " but placed under " + studentGroupPlacement + ".",
                        List.of()));
            }
        }
    }

    private static void labelPairHardConflicts(List<Lesson> assignedLessons) {
        for (int i = 0; i < assignedLessons.size(); i++) {
            Lesson first = assignedLessons.get(i);
            for (int j = i + 1; j < assignedLessons.size(); j++) {
                Lesson second = assignedLessons.get(j);
                if (!Lesson.overlaps(first, second)) {
                    continue;
                }
                int overlapSlots = Lesson.overlapSlotCount(first, second);
                if (first.getRoom() != null && second.getRoom() != null
                        && Objects.equals(first.getRoom(), second.getRoom())) {
                    addPairViolation(first, second, ROOM_CONFLICT, "hard",
                            "Overlaps with another lesson in the same room (" + overlapSlots + " slot(s)).");
                }
                if (Objects.equals(first.getTeacher(), second.getTeacher())) {
                    addPairViolation(first, second, TEACHER_CONFLICT, "hard",
                            "Overlaps with another lesson for the same teacher (" + overlapSlots + " slot(s)).");
                }
                if (Objects.equals(first.getStudentGroup(), second.getStudentGroup())) {
                    addPairViolation(first, second, STUDENT_GROUP_CONFLICT, "hard",
                            "Overlaps with another lesson for the same student group (" + overlapSlots + " slot(s)).");
                }
            }
        }
    }

    private static void labelTeacherRoomStability(List<Lesson> lessons) {
        for (int i = 0; i < lessons.size(); i++) {
            Lesson first = lessons.get(i);
            for (int j = i + 1; j < lessons.size(); j++) {
                Lesson second = lessons.get(j);
                if (!Objects.equals(first.getTeacher(), second.getTeacher())) {
                    continue;
                }
                if (first.getRoom() == null || second.getRoom() == null || first.getRoom() == second.getRoom()) {
                    continue;
                }
                addPairViolation(first, second, TimetableConstraintProvider.TEACHER_ROOM_STABILITY, "soft",
                        "Same teacher assigned to different rooms.");
            }
        }
    }

    private static void labelStudentRoomStability(List<Lesson> lessons) {
        for (int i = 0; i < lessons.size(); i++) {
            Lesson first = lessons.get(i);
            for (int j = i + 1; j < lessons.size(); j++) {
                Lesson second = lessons.get(j);
                if (!Objects.equals(first.getStudentGroup(), second.getStudentGroup())) {
                    continue;
                }
                if (first.getRoom() == null || second.getRoom() == null || first.getRoom() == second.getRoom()) {
                    continue;
                }
                addPairViolation(first, second, TimetableConstraintProvider.STUDENT_ROOM_STABILITY, "soft",
                        "Same student group assigned to different rooms.");
            }
        }
    }

    private static void labelStudentGroupSubjectVariety(List<Lesson> assignedLessons) {
        for (int i = 0; i < assignedLessons.size(); i++) {
            Lesson first = assignedLessons.get(i);
            for (int j = i + 1; j < assignedLessons.size(); j++) {
                Lesson second = assignedLessons.get(j);
                if (!Objects.equals(first.getSubject(), second.getSubject())
                        || !Objects.equals(first.getStudentGroup(), second.getStudentGroup())) {
                    continue;
                }
                if (shareSameDay(first, second) && areBackToBack(first, second)) {
                    addPairViolation(first, second, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY, "soft",
                            "Back-to-back lessons with the same subject for this student group.");
                }
            }
        }
    }

    private static void labelStudentGroupSubjectTypeVariety(List<Lesson> assignedLessons) {
        for (int i = 0; i < assignedLessons.size(); i++) {
            Lesson first = assignedLessons.get(i);
            for (int j = i + 1; j < assignedLessons.size(); j++) {
                Lesson second = assignedLessons.get(j);
                if (!Objects.equals(first.getStudentGroup(), second.getStudentGroup())) {
                    continue;
                }
                if (!shareSameDay(first, second) || !areBackToBack(first, second)) {
                    continue;
                }
                List<String> sharedTypes = first.getSharedSubjectTypesWith(second);
                if (sharedTypes.isEmpty()) {
                    continue;
                }
                String typeList = String.join(", ", sharedTypes);
                addPairViolation(first, second, TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_TYPE_VARIETY, "soft",
                        "Back-to-back lessons share subject type(s): " + typeList + ".");
            }
        }
    }

    private static void labelLunchTimebreak(List<Lesson> assignedLessons) {
        labelLunchTimebreakForTeachers(assignedLessons);
        labelLunchTimebreakForStudentGroups(assignedLessons);
    }

    /** Labels all lessons on a teacher-day that lacks the mandatory 1-hour lunch timebreak. */
    private static void labelLunchTimebreakForTeachers(List<Lesson> assignedLessons) {
        Map<String, List<Lesson>> lessonsByTeacherAndDay = groupByKey(assignedLessons,
                lesson -> lesson.getTeacher() + "|" + lesson.getTimeslot().getDayOfWeek());
        for (List<Lesson> lessonsOnDay : lessonsByTeacherAndDay.values()) {
            if (Lesson.hasLunchTimebreak(lessonsOnDay)) {
                continue;
            }
            String teacher = lessonsOnDay.get(0).getTeacher();
            DayOfWeek day = lessonsOnDay.get(0).getTimeslot().getDayOfWeek();
            for (Lesson lesson : lessonsOnDay) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.LUNCH_TIMEBREAK,
                        "hard",
                        "Teacher " + teacher + " lacks a 1-hour lunch timebreak on " + day + ".",
                        List.of()));
            }
        }
    }

    /** Labels all lessons on a student-group-day that lacks the mandatory 1-hour lunch timebreak. */
    private static void labelLunchTimebreakForStudentGroups(List<Lesson> assignedLessons) {
        Map<String, List<Lesson>> lessonsByGroupAndDay = groupByKey(assignedLessons,
                lesson -> lesson.getStudentGroup() + "|" + lesson.getTimeslot().getDayOfWeek());
        for (List<Lesson> lessonsOnDay : lessonsByGroupAndDay.values()) {
            if (Lesson.hasLunchTimebreak(lessonsOnDay)) {
                continue;
            }
            String studentGroup = lessonsOnDay.get(0).getStudentGroup();
            DayOfWeek day = lessonsOnDay.get(0).getTimeslot().getDayOfWeek();
            for (Lesson lesson : lessonsOnDay) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.LUNCH_TIMEBREAK,
                        "hard",
                        "Student group " + studentGroup + " lacks a 1-hour lunch timebreak on " + day + ".",
                        List.of()));
            }
        }
    }

    private static void labelGoodLunchtimeForTeachers(List<Lesson> assignedLessons) {
        Map<String, List<Lesson>> lessonsByTeacherAndDay = groupByKey(assignedLessons,
                lesson -> lesson.getTeacher() + "|" + lesson.getTimeslot().getDayOfWeek());
        for (List<Lesson> lessonsOnDay : lessonsByTeacherAndDay.values()) {
            if (Lesson.hasGoodLunch(lessonsOnDay)) {
                continue;
            }
            String teacher = lessonsOnDay.get(0).getTeacher();
            DayOfWeek day = lessonsOnDay.get(0).getTimeslot().getDayOfWeek();
            for (Lesson lesson : lessonsOnDay) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.GOOD_LUNCHTIME_TEACHER,
                        "soft",
                        "Teacher " + teacher + " lacks a 2-hour lunch gap on " + day + ".",
                        List.of()));
            }
        }
    }

    private static void labelGoodLunchtimeForStudentGroups(List<Lesson> assignedLessons) {
        Map<String, List<Lesson>> lessonsByGroupAndDay = groupByKey(assignedLessons,
                lesson -> lesson.getStudentGroup() + "|" + lesson.getTimeslot().getDayOfWeek());
        for (List<Lesson> lessonsOnDay : lessonsByGroupAndDay.values()) {
            if (Lesson.hasGoodLunch(lessonsOnDay)) {
                continue;
            }
            String studentGroup = lessonsOnDay.get(0).getStudentGroup();
            DayOfWeek day = lessonsOnDay.get(0).getTimeslot().getDayOfWeek();
            for (Lesson lesson : lessonsOnDay) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.GOOD_LUNCHTIME_STUDENT_GROUP,
                        "soft",
                        "Student group " + studentGroup + " lacks a 2-hour lunch gap on " + day + ".",
                        List.of()));
            }
        }
    }

    private static void labelTeacherAvailability(List<Lesson> assignedLessons) {
        for (Lesson lesson : assignedLessons) {
            if (lesson.getTimeslot() == null || lesson.getTeacherUnavailableDays() == null
                    || lesson.getTeacherUnavailableDays().isEmpty()) {
                continue;
            }
            DayOfWeek dayOfWeek = lesson.getTimeslot().getDayOfWeek();
            if (lesson.getTeacherUnavailableDays().contains(dayOfWeek.toString())) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.TEACHER_AVAILABILITY,
                        "soft",
                        "Teacher " + lesson.getTeacher() + " is not available on " + dayOfWeek + ".",
                        List.of()));
            }
        }
    }

    /** Labels lessons scheduled outside their preferred weekdays. */
    private static void labelPreferredWeekday(List<Lesson> assignedLessons) {
        for (Lesson lesson : assignedLessons) {
            if (lesson.getTimeslot() == null || lesson.getPreferredWeekdays() == null
                    || lesson.getPreferredWeekdays().isEmpty()) {
                continue;
            }
            DayOfWeek dayOfWeek = lesson.getTimeslot().getDayOfWeek();
            if (!lesson.getPreferredWeekdays().contains(dayOfWeek.toString())) {
                addViolation(lesson, new ViolationInfo(
                        TimetableConstraintProvider.PREFERRED_WEEKDAY,
                        "soft",
                        "Subject " + lesson.getSubject() + " is scheduled outside preferred weekdays on "
                                + dayOfWeek + ".",
                        List.of()));
            }
        }
    }

    /** Labels parallel-linked lessons that do not share weekday and start time. */
    private static void labelParallelSubject(List<Lesson> assignedLessons) {
        for (int i = 0; i < assignedLessons.size(); i++) {
            Lesson first = assignedLessons.get(i);
            for (int j = i + 1; j < assignedLessons.size(); j++) {
                Lesson second = assignedLessons.get(j);
                if (Objects.equals(first.getTeacher(), second.getTeacher())
                        || Objects.equals(first.getStudentGroup(), second.getStudentGroup())) {
                    continue;
                }
                if (!TimetableConstraintProvider.isParallelPair(first, second)
                        || TimetableConstraintProvider.shareSameStart(first, second)) {
                    continue;
                }
                addPairViolation(first, second,
                        TimetableConstraintProvider.PARALLEL_SUBJECT,
                        "soft",
                        "Card " + first.getId() + " should share a timeslot with parallel card "
                                + second.getId() + ".");
            }
        }
    }

    private static Map<String, List<Lesson>> groupByKey(List<Lesson> lessons,
            java.util.function.Function<Lesson, String> keyExtractor) {
        Map<String, List<Lesson>> grouped = new HashMap<>();
        for (Lesson lesson : lessons) {
            grouped.computeIfAbsent(keyExtractor.apply(lesson), key -> new ArrayList<>()).add(lesson);
        }
        return grouped;
    }

    private static void addPairViolation(Lesson first, Lesson second, String constraintName, String scoreLevel,
            String message) {
        addViolation(first, new ViolationInfo(constraintName, scoreLevel, message, List.of(second.getId())));
        addViolation(second, new ViolationInfo(constraintName, scoreLevel, message, List.of(first.getId())));
    }

    private static void addViolation(Lesson lesson, ViolationInfo violation) {
        if (lesson.getViolations() == null) {
            lesson.setViolations(new ArrayList<>());
        }
        lesson.getViolations().add(violation);
    }

    private static boolean shareSameDay(Lesson first, Lesson second) {
        if (first.getTimeslot() == null || second.getTimeslot() == null) {
            return false;
        }
        return first.getTimeslot().getDayOfWeek().equals(second.getTimeslot().getDayOfWeek());
    }

    private static boolean areBackToBack(Lesson first, Lesson second) {
        if (first.getEndTime() == null || second.getEndTime() == null) {
            return false;
        }
        Duration gapAfterFirst = Duration.between(first.getEndTime(), second.getTimeslot().getStartTime());
        Duration gapAfterSecond = Duration.between(second.getEndTime(), first.getTimeslot().getStartTime());
        return gapAfterFirst.equals(Duration.ZERO) || gapAfterSecond.equals(Duration.ZERO);
    }
}
