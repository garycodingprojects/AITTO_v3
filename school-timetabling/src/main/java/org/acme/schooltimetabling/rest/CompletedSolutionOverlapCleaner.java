package org.acme.schooltimetabling.rest;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Timetable;

/**
 * Post-processes a completed solver solution so hard-overlap lessons are returned as unassigned.
 * <p>
 * Policy: pinned lessons are always kept (violations may remain visible in the UI).
 * Unpinned lessons are scanned in deterministic order (day, start time, lesson id).
 * Keep the earliest/first unpinned lesson; unassign any later unpinned lesson that overlaps
 * an already-kept lesson with the same room, teacher, or student group.
 * Also unassign impossible single-lesson placements for unpinned lessons only.
 */
public final class CompletedSolutionOverlapCleaner {

    /** Sort assigned lessons by day, then start time, then id for stable keep-earliest behavior. */
    private static final Comparator<Lesson> ASSIGNED_LESSON_ORDER = Comparator
            .comparing((Lesson lesson) -> lesson.getTimeslot().getDayOfWeek())
            .thenComparing(lesson -> lesson.getTimeslot().getStartTime())
            .thenComparing(Lesson::getId);

    private CompletedSolutionOverlapCleaner() {
    }

    /**
     * Removes invalid and overlapping lesson assignments from {@code timetable}.
     * Unassigned lessons have both {@code timeslot} and {@code room} cleared so the UI
     * renders them in the unassigned-lessons panel.
     */
    public static void cleanup(Timetable timetable) {
        if (timetable.getLessons() == null) {
            return;
        }

        List<Lesson> assignedLessons = timetable.getLessons().stream()
                .filter(lesson -> lesson.getTimeslot() != null && lesson.getRoom() != null)
                .sorted(ASSIGNED_LESSON_ORDER)
                .toList();

        List<Lesson> keptLessons = new ArrayList<>();

        // Pinned lessons are never unassigned by cleanup; they may still show hard violations in the UI.
        for (Lesson lesson : assignedLessons) {
            if (lesson.isPinned()) {
                keptLessons.add(lesson);
            }
        }

        for (Lesson lesson : assignedLessons) {
            if (lesson.isPinned()) {
                continue;
            }
            if (isInvalidSingleLessonPlacement(lesson)) {
                unassign(lesson);
                continue;
            }
            if (conflictsWithAnyKeptLesson(lesson, keptLessons)) {
                unassign(lesson);
            } else {
                keptLessons.add(lesson);
            }
        }
    }

    /** True when a lesson alone violates hard placement rules (lunch block or duration overflow). */
    private static boolean isInvalidSingleLessonPlacement(Lesson lesson) {
        return lesson.overlapsHardLunch() || !lesson.fitsAtStartTimeslot();
    }

    /**
     * True when {@code candidate} overlaps in time with a kept lesson and shares
     * room, teacher, or student group with that kept lesson.
     */
    private static boolean conflictsWithAnyKeptLesson(Lesson candidate, List<Lesson> keptLessons) {
        for (Lesson kept : keptLessons) {
            if (hardOverlapConflict(candidate, kept)) {
                return true;
            }
        }
        return false;
    }

    private static boolean hardOverlapConflict(Lesson first, Lesson second) {
        if (!Lesson.overlaps(first, second)) {
            return false;
        }
        return Objects.equals(first.getRoom(), second.getRoom())
                || Objects.equals(first.getTeacher(), second.getTeacher())
                || Objects.equals(first.getStudentGroup(), second.getStudentGroup());
    }

    /** Clears planning variables so the lesson appears in the unassigned-lessons UI section. */
    private static void unassign(Lesson lesson) {
        lesson.setTimeslot(null);
        lesson.setRoom(null);
    }
}
