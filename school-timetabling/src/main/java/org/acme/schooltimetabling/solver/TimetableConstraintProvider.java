package org.acme.schooltimetabling.solver;

import java.time.Duration;
import java.util.Objects;

import ai.timefold.solver.core.api.score.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintCollectors;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.Joiners;

import org.acme.schooltimetabling.domain.Lesson;

public class TimetableConstraintProvider implements ConstraintProvider {

    /**
     * Per-slot hard penalty multiplier for violations (room/teacher/group overlap, invalid duration).
     * Hard constraints are never allowed; a large weight makes the solver strongly avoid any overlap.
     */
    public static final int HARD_VIOLATION_WEIGHT = 1_000;

    /** Soft constraint IDs — must match {@code asConstraint(...)} names exactly. */
    public static final String TEACHER_ROOM_STABILITY = "Teacher room stability";
    public static final String STUDENT_ROOM_STABILITY = "Student room stability";
    public static final String TEACHER_TIME_EFFICIENCY = "Teacher time efficiency";
    public static final String STUDENT_TIME_EFFICIENCY = "Student time efficiency";
    public static final String STUDENT_GROUP_SUBJECT_VARIETY = "Student group subject variety";
    public static final String STUDENT_GROUP_SUBJECT_TYPE_VARIETY = "Student group subject type variety";
    public static final String LESSON_OVERLAPS_HARD_LUNCH = "Lesson overlaps hard lunch";
    public static final String INCORRECT_TEACHER = "Incorrect teacher";
    public static final String INCORRECT_STUDENT_GROUP = "Incorrect student group";
    /** Base name shown in violation labels and score help. */
    public static final String LUNCH_TIMEBREAK = "lunchTimebreak";
    /** Solver constraint id for teacher lunch timebreak (must be unique per constraint). */
    public static final String LUNCH_TIMEBREAK_TEACHER = LUNCH_TIMEBREAK + " (teacher)";
    /** Solver constraint id for student-group lunch timebreak (must be unique per constraint). */
    public static final String LUNCH_TIMEBREAK_STUDENT_GROUP = LUNCH_TIMEBREAK + " (student group)";
    public static final String GOOD_LUNCHTIME_TEACHER = "Good lunchtime for teacher";
    public static final String GOOD_LUNCHTIME_STUDENT_GROUP = "Good lunchtime for student group";
    public static final String ROOM_PRIORITY = "Room priority";
    public static final String TEACHER_AVAILABILITY = "Teacher availability";

    /** All soft constraints exposed in the demo UI checkbox panel. */
    public static final java.util.List<String> SOFT_CONSTRAINTS = java.util.List.of(
            TEACHER_ROOM_STABILITY,
            STUDENT_ROOM_STABILITY,
            TEACHER_TIME_EFFICIENCY,
            STUDENT_TIME_EFFICIENCY,
            STUDENT_GROUP_SUBJECT_VARIETY,
            STUDENT_GROUP_SUBJECT_TYPE_VARIETY,
            GOOD_LUNCHTIME_TEACHER,
            GOOD_LUNCHTIME_STUDENT_GROUP,
            ROOM_PRIORITY,
            TEACHER_AVAILABILITY);

    @Override
    public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
        return new Constraint[] {
                // Hard constraints
                lessonDurationFitsStartTimeslot(constraintFactory),
                lessonDoesNotOverlapHardLunch(constraintFactory),
                roomConflict(constraintFactory),
                teacherConflict(constraintFactory),
                studentGroupConflict(constraintFactory),
                incorrectTeacher(constraintFactory),
                incorrectStudentGroup(constraintFactory),
                lunchTimebreakForTeachers(constraintFactory),
                lunchTimebreakForStudentGroups(constraintFactory),

                // Soft constraints
                teacherRoomStability(constraintFactory),
                studentRoomStability(constraintFactory),
                teacherTimeEfficiency(constraintFactory),
                studentTimeEfficiency(constraintFactory),
                studentGroupSubjectVariety(constraintFactory),
                studentGroupSubjectTypeVariety(constraintFactory),
                goodLunchtimeForTeacher(constraintFactory),
                goodLunchtimeForStudentGroup(constraintFactory),
                roomPriority(constraintFactory),
                teacherAvailability(constraintFactory)
        };
    }

    Constraint lessonDoesNotOverlapHardLunch(ConstraintFactory constraintFactory) {
        // No lesson may occupy the mandatory hard lunch block (13:00–13:30).
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null && lesson.overlapsHardLunch())
                .penalize(HardSoftScore.ONE_HARD,
                        lesson -> HARD_VIOLATION_WEIGHT * lesson.getHardLunchOverlapSlotCount())
                .asConstraint(LESSON_OVERLAPS_HARD_LUNCH);
    }

    Constraint lessonDurationFitsStartTimeslot(ConstraintFactory constraintFactory) {
        // A lesson must fit within contiguous available slots from its chosen start time.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null && !lesson.fitsAtStartTimeslot())
                .penalize(HardSoftScore.ONE_HARD, lesson -> HARD_VIOLATION_WEIGHT * lesson.getStartTimeslotOverrunSlotCount())
                .asConstraint("Lesson duration exceeds available contiguous time");
    }

    Constraint roomConflict(ConstraintFactory constraintFactory) {
        // A room can accommodate at most one lesson at any overlapping time.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getRoom))
                .filter((lesson1, lesson2) -> lesson1.getRoom() != null && lesson2.getRoom() != null)
                .filter(Lesson::overlaps)
                .penalize(HardSoftScore.ONE_HARD,
                        (lesson1, lesson2) -> HARD_VIOLATION_WEIGHT * Lesson.overlapSlotCount(lesson1, lesson2))
                .asConstraint("Room conflict");
    }

    Constraint teacherConflict(ConstraintFactory constraintFactory) {
        // A teacher can teach at most one lesson at any overlapping time.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getTeacher))
                .filter(Lesson::overlaps)
                .penalize(HardSoftScore.ONE_HARD,
                        (lesson1, lesson2) -> HARD_VIOLATION_WEIGHT * Lesson.overlapSlotCount(lesson1, lesson2))
                .asConstraint("Teacher conflict");
    }

    Constraint studentGroupConflict(ConstraintFactory constraintFactory) {
        // A student group can attend at most one lesson at any overlapping time.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getStudentGroup))
                .filter(Lesson::overlaps)
                .penalize(HardSoftScore.ONE_HARD,
                        (lesson1, lesson2) -> HARD_VIOLATION_WEIGHT * Lesson.overlapSlotCount(lesson1, lesson2))
                .asConstraint("Student group conflict");
    }

    Constraint incorrectTeacher(ConstraintFactory constraintFactory) {
        // Manual UI placement must remain in the lesson's fixed curriculum teacher column.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getManualTeacherPlacement() != null
                        && !Objects.equals(lesson.getTeacher(), lesson.getManualTeacherPlacement()))
                .penalize(HardSoftScore.ONE_HARD, lesson -> HARD_VIOLATION_WEIGHT)
                .asConstraint(INCORRECT_TEACHER);
    }

    Constraint incorrectStudentGroup(ConstraintFactory constraintFactory) {
        // Manual UI placement must remain in the lesson's fixed curriculum student-group column.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getManualStudentGroupPlacement() != null
                        && !Objects.equals(lesson.getStudentGroup(), lesson.getManualStudentGroupPlacement()))
                .penalize(HardSoftScore.ONE_HARD, lesson -> HARD_VIOLATION_WEIGHT)
                .asConstraint(INCORRECT_STUDENT_GROUP);
    }

    /**
     * Hard minimum 1-hour lunch break for each teacher on each teaching day.
     * Paired with {@link #lunchTimebreakForStudentGroups}; both enforce the {@link #LUNCH_TIMEBREAK} rule.
     */
    Constraint lunchTimebreakForTeachers(ConstraintFactory constraintFactory) {
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null)
                .groupBy(Lesson::getTeacher, lesson -> lesson.getTimeslot().getDayOfWeek(),
                        ConstraintCollectors.toList())
                .filter((teacher, day, lessons) -> !Lesson.hasLunchTimebreak(lessons))
                .penalize(HardSoftScore.ONE_HARD, (teacher, day, lessons) -> HARD_VIOLATION_WEIGHT)
                .asConstraint(LUNCH_TIMEBREAK_TEACHER);
    }

    /**
     * Hard minimum 1-hour lunch break for each student group on each teaching day.
     * Paired with {@link #lunchTimebreakForTeachers}; both enforce the {@link #LUNCH_TIMEBREAK} rule.
     */
    Constraint lunchTimebreakForStudentGroups(ConstraintFactory constraintFactory) {
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null)
                .groupBy(Lesson::getStudentGroup, lesson -> lesson.getTimeslot().getDayOfWeek(),
                        ConstraintCollectors.toList())
                .filter((studentGroup, day, lessons) -> !Lesson.hasLunchTimebreak(lessons))
                .penalize(HardSoftScore.ONE_HARD, (studentGroup, day, lessons) -> HARD_VIOLATION_WEIGHT)
                .asConstraint(LUNCH_TIMEBREAK_STUDENT_GROUP);
    }

    Constraint teacherRoomStability(ConstraintFactory constraintFactory) {
        // A teacher prefers to teach in a single room.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getTeacher))
                .filter((lesson1, lesson2) -> lesson1.getRoom() != lesson2.getRoom())
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(TEACHER_ROOM_STABILITY);
    }

    Constraint studentRoomStability(ConstraintFactory constraintFactory) {
        // A student group prefers to stay in a single room.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getStudentGroup))
                .filter((lesson1, lesson2) -> lesson1.getRoom() != lesson2.getRoom())
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(STUDENT_ROOM_STABILITY);
    }

    Constraint teacherTimeEfficiency(ConstraintFactory constraintFactory) {
        // A teacher prefers sequential lessons with no gap (back-to-back) on the same day.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getTeacher))
                .filter((lesson1, lesson2) -> shareSameDay(lesson1, lesson2) && areBackToBack(lesson1, lesson2))
                .reward(HardSoftScore.ONE_SOFT)
                .asConstraint(TEACHER_TIME_EFFICIENCY);
    }

    Constraint studentTimeEfficiency(ConstraintFactory constraintFactory) {
        // A student group prefers sequential lessons with no gap (back-to-back) on the same day.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getStudentGroup))
                .filter((lesson1, lesson2) -> shareSameDay(lesson1, lesson2) && areBackToBack(lesson1, lesson2))
                .reward(HardSoftScore.ONE_SOFT)
                .asConstraint(STUDENT_TIME_EFFICIENCY);
    }

    Constraint studentGroupSubjectVariety(ConstraintFactory constraintFactory) {
        // A student group dislikes back-to-back lessons on the same subject.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getSubject),
                        Joiners.equal(Lesson::getStudentGroup))
                .filter((lesson1, lesson2) -> shareSameDay(lesson1, lesson2) && areBackToBack(lesson1, lesson2))
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(STUDENT_GROUP_SUBJECT_VARIETY);
    }

    Constraint studentGroupSubjectTypeVariety(ConstraintFactory constraintFactory) {
        // A student group dislikes back-to-back lessons sharing any selected subject type tag.
        return constraintFactory
                .forEachUniquePair(Lesson.class,
                        Joiners.equal(Lesson::getStudentGroup))
                .filter((lesson1, lesson2) -> shareSameDay(lesson1, lesson2)
                        && areBackToBack(lesson1, lesson2)
                        && lesson1.sharesSubjectTypeWith(lesson2))
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(STUDENT_GROUP_SUBJECT_TYPE_VARIETY);
    }

    Constraint goodLunchtimeForTeacher(ConstraintFactory constraintFactory) {
        // Each teacher on each teaching day should have a 2-hour lunch gap around 13:00–13:30.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null)
                .groupBy(Lesson::getTeacher, lesson -> lesson.getTimeslot().getDayOfWeek(),
                        ConstraintCollectors.toList())
                .filter((teacher, day, lessons) -> !Lesson.hasGoodLunch(lessons))
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(GOOD_LUNCHTIME_TEACHER);
    }

    Constraint goodLunchtimeForStudentGroup(ConstraintFactory constraintFactory) {
        // Each student group on each teaching day should have a 2-hour lunch gap around 13:00–13:30.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null)
                .groupBy(Lesson::getStudentGroup, lesson -> lesson.getTimeslot().getDayOfWeek(),
                        ConstraintCollectors.toList())
                .filter((studentGroup, day, lessons) -> !Lesson.hasGoodLunch(lessons))
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(GOOD_LUNCHTIME_STUDENT_GROUP);
    }

    Constraint roomPriority(ConstraintFactory constraintFactory) {
        // Prefer rooms with higher priority for each assigned lesson.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getRoom() != null)
                .reward(HardSoftScore.ONE_SOFT, lesson -> lesson.getRoom().getPriority())
                .asConstraint(ROOM_PRIORITY);
    }

    Constraint teacherAvailability(ConstraintFactory constraintFactory) {
        // Penalize lessons scheduled on days a teacher marked unavailable.
        return constraintFactory
                .forEach(Lesson.class)
                .filter(lesson -> lesson.getTimeslot() != null
                        && lesson.getTeacherUnavailableDays() != null
                        && lesson.getTeacherUnavailableDays().contains(lesson.getTimeslot().getDayOfWeek().toString()))
                .penalize(HardSoftScore.ONE_SOFT)
                .asConstraint(TEACHER_AVAILABILITY);
    }

    private static boolean shareSameDay(Lesson first, Lesson second) {
        if (first.getTimeslot() == null || second.getTimeslot() == null) {
            return false;
        }
        return first.getTimeslot().getDayOfWeek().equals(second.getTimeslot().getDayOfWeek());
    }

    /** True when two lessons on the same day are adjacent with no gap between them. */
    private static boolean areBackToBack(Lesson first, Lesson second) {
        if (first.getEndTime() == null || second.getEndTime() == null) {
            return false;
        }
        Duration gapAfterFirst = Duration.between(first.getEndTime(), second.getTimeslot().getStartTime());
        Duration gapAfterSecond = Duration.between(second.getEndTime(), first.getTimeslot().getStartTime());
        return gapAfterFirst.equals(Duration.ZERO) || gapAfterSecond.equals(Duration.ZERO);
    }

}
