package org.acme.schooltimetabling.domain;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.entity.PlanningPin;
import ai.timefold.solver.core.api.domain.common.PlanningId;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;
import com.fasterxml.jackson.annotation.JsonIdentityReference;
import com.fasterxml.jackson.annotation.JsonIgnore;

@PlanningEntity
public class Lesson {

    /** Default lesson length when duration is not specified (1 hour). */
    public static final int DEFAULT_DURATION_MINUTES = 60;

    @PlanningId
    private String id;

    private String subject;
    private String teacher;
    private String studentGroup;

    /**
     * Optional manual teacher-column placement used by the Demo UI.
     * The fixed {@link #teacher} remains the curriculum identity shown on the card.
     */
    private String manualTeacherPlacement;

    /**
     * Optional manual student-group-column placement used by the Demo UI.
     * The fixed {@link #studentGroup} remains the curriculum identity shown on the card.
     */
    private String manualStudentGroupPlacement;

    /** Fixed lesson length in minutes; must be a multiple of {@link Timeslot#SLOT_MINUTES}. */
    private int durationInMinutes = DEFAULT_DURATION_MINUTES;

    /** Start timeslot; the lesson occupies consecutive 30-minute slots from this start. */
    @JsonIdentityReference
    @PlanningVariable(valueRangeProviderRefs = "validTimeslotRange")
    private Timeslot timeslot;

    @JsonIdentityReference
    @PlanningVariable(valueRangeProviderRefs = "validRoomRange")
    private Room room;

    /**
     * Eligible classroom IDs for this lesson; solver may assign any room in this set.
     * When null or empty, all rooms in the timetable are eligible (backward compatible with demo data).
     */
    private List<String> allowedRoomIds;

    /**
     * Entity-specific start times that can fit this lesson's duration.
     * This prevents the solver from selecting starts that cross lunch or the end of the school day.
     */
    @JsonIgnore
    private List<Timeslot> validTimeslotRange;

    /**
     * Entity-specific rooms the solver may assign for this lesson.
     * Built from {@link #allowedRoomIds} by {@link Timetable#updateLessonValueRanges()}.
     */
    @JsonIgnore
    private List<Room> validRoomRange;

    /**
     * Constraint violations for UI display only; populated after solve by TimetableViolationLabeler.
     * Ignored by Timefold during planning.
     */
    private List<ViolationInfo> violations = new ArrayList<>();

    /**
     * When true, the solver and manual drag/drop must not change this lesson's timeslot or room.
     * Set from the Demo UI pin control on placed lesson cards.
     */
    private boolean pinned;

    /**
     * Subject type tags selected for this lesson card (e.g. Theory, Practical).
     * Populated from Preparation workspace; used by the subject-type variety soft constraint.
     */
    private List<String> subjectTypes = new ArrayList<>();

    /**
     * Days of week this teacher is unavailable for this lesson.
     * Populated from Preparation workspace; used by the teacher availability soft constraint.
     */
    private List<String> teacherUnavailableDays = new ArrayList<>();

    public Lesson() {
    }

    public Lesson(String id, String subject, String teacher, String studentGroup) {
        this(id, subject, teacher, studentGroup, DEFAULT_DURATION_MINUTES);
    }

    public Lesson(String id, String subject, String teacher, String studentGroup, int durationInMinutes) {
        this.id = id;
        this.subject = subject;
        this.teacher = teacher;
        this.studentGroup = studentGroup;
        this.durationInMinutes = durationInMinutes;
    }

    public Lesson(String id, String subject, String teacher, String studentGroup, Timeslot timeslot, Room room) {
        this(id, subject, teacher, studentGroup);
        this.timeslot = timeslot;
        this.room = room;
    }

    public Lesson(String id, String subject, String teacher, String studentGroup, int durationInMinutes,
            Timeslot timeslot, Room room) {
        this(id, subject, teacher, studentGroup, durationInMinutes);
        this.timeslot = timeslot;
        this.room = room;
    }

    /** End time of this lesson on its assigned day, or null if not yet assigned a start slot. */
    @JsonIgnore
    public LocalTime getEndTime() {
        if (timeslot == null) {
            return null;
        }
        return timeslot.getStartTime().plusMinutes(durationInMinutes);
    }

    /** Number of 30-minute atomic slots this lesson occupies. */
    @JsonIgnore
    public int getDurationSlotCount() {
        return durationInMinutes / Timeslot.SLOT_MINUTES;
    }

    /** True when the assigned start slot has enough contiguous time for this lesson's duration. */
    public boolean fitsAtStartTimeslot() {
        if (timeslot == null) {
            return true;
        }
        return timeslot.getMaxConsecutiveMinutesFromStart() >= durationInMinutes;
    }

    /** Number of 30-minute slots by which this lesson exceeds its selected start slot, if any. */
    @JsonIgnore
    public int getStartTimeslotOverrunSlotCount() {
        if (timeslot == null || fitsAtStartTimeslot()) {
            return 0;
        }
        int missingMinutes = durationInMinutes - timeslot.getMaxConsecutiveMinutesFromStart();
        return (int) Math.ceil((double) missingMinutes / Timeslot.SLOT_MINUTES);
    }

    /**
     * True when two assigned lessons overlap in time on the same day.
     * Unassigned lessons (null timeslot) never overlap.
     */
    public static boolean overlaps(Lesson first, Lesson second) {
        return overlapMinutes(first, second) > 0;
    }

    /** Number of overlapping 30-minute slots between two assigned lessons. */
    public static int overlapSlotCount(Lesson first, Lesson second) {
        return (int) Math.ceil((double) overlapMinutes(first, second) / Timeslot.SLOT_MINUTES);
    }

    /** Number of overlapping minutes between two assigned lessons. */
    private static int overlapMinutes(Lesson first, Lesson second) {
        if (first.getTimeslot() == null || second.getTimeslot() == null) {
            return 0;
        }
        if (!Objects.equals(first.getTimeslot().getDayOfWeek(), second.getTimeslot().getDayOfWeek())) {
            return 0;
        }
        LocalTime firstStart = first.getTimeslot().getStartTime();
        LocalTime firstEnd = first.getEndTime();
        LocalTime secondStart = second.getTimeslot().getStartTime();
        LocalTime secondEnd = second.getEndTime();
        LocalTime overlapStart = firstStart.isAfter(secondStart) ? firstStart : secondStart;
        LocalTime overlapEnd = firstEnd.isBefore(secondEnd) ? firstEnd : secondEnd;
        if (!overlapStart.isBefore(overlapEnd)) {
            return 0;
        }
        return (int) java.time.Duration.between(overlapStart, overlapEnd).toMinutes();
    }

    /** True when this lesson overlaps the mandatory hard lunch block (13:00–13:30). */
    @JsonIgnore
    public boolean overlapsHardLunch() {
        return overlapMinutesWithWindow(TimeslotGenerator.LUNCH_HARD_START, TimeslotGenerator.LUNCH_HARD_END) > 0;
    }

    /** Number of 30-minute slots overlapping the hard lunch block. */
    @JsonIgnore
    public int getHardLunchOverlapSlotCount() {
        return (int) Math.ceil((double) overlapMinutesWithWindow(
                TimeslotGenerator.LUNCH_HARD_START, TimeslotGenerator.LUNCH_HARD_END) / Timeslot.SLOT_MINUTES);
    }

    /** True when this lesson overlaps the half-open interval [windowStart, windowEnd). */
    @JsonIgnore
    public boolean overlapsTimeWindow(LocalTime windowStart, LocalTime windowEnd) {
        return overlapMinutesWithWindow(windowStart, windowEnd) > 0;
    }

    /**
     * True when every lesson on the same day has a 2-hour lunch gap around the hard block:
     * no overlap with 13:00–13:30, and either 11:30–13:00 or 13:30–15:00 is free.
     */
    public static boolean hasGoodLunch(java.util.List<Lesson> lessonsOnSameDay) {
        if (lessonsOnSameDay.stream().anyMatch(Lesson::overlapsHardLunch)) {
            return false;
        }
        boolean freeBeforeLunch = lessonsOnSameDay.stream()
                .noneMatch(lesson -> lesson.overlapsTimeWindow(
                        TimeslotGenerator.LUNCH_SOFT_BEFORE_START, TimeslotGenerator.LUNCH_HARD_START));
        boolean freeAfterLunch = lessonsOnSameDay.stream()
                .noneMatch(lesson -> lesson.overlapsTimeWindow(
                        TimeslotGenerator.LUNCH_HARD_END, TimeslotGenerator.LUNCH_SOFT_AFTER_END));
        return freeBeforeLunch || freeAfterLunch;
    }

    /**
     * True when every lesson on the same day satisfies the mandatory 1-hour lunch timebreak:
     * no overlap with 13:00–13:30, and either 12:30–13:00 or 13:30–14:00 is free.
     */
    public static boolean hasLunchTimebreak(java.util.List<Lesson> lessonsOnSameDay) {
        if (lessonsOnSameDay.stream().anyMatch(Lesson::overlapsHardLunch)) {
            return false;
        }
        boolean freeBeforeLunch = lessonsOnSameDay.stream()
                .noneMatch(lesson -> lesson.overlapsTimeWindow(
                        TimeslotGenerator.LUNCH_TIMEBREAK_BEFORE_START, TimeslotGenerator.LUNCH_HARD_START));
        boolean freeAfterLunch = lessonsOnSameDay.stream()
                .noneMatch(lesson -> lesson.overlapsTimeWindow(
                        TimeslotGenerator.LUNCH_HARD_END, TimeslotGenerator.LUNCH_TIMEBREAK_AFTER_END));
        return freeBeforeLunch || freeAfterLunch;
    }

    /** Overlap in minutes between this lesson and [windowStart, windowEnd). */
    private int overlapMinutesWithWindow(LocalTime windowStart, LocalTime windowEnd) {
        if (timeslot == null) {
            return 0;
        }
        LocalTime lessonStart = timeslot.getStartTime();
        LocalTime lessonEnd = getEndTime();
        LocalTime overlapStart = lessonStart.isAfter(windowStart) ? lessonStart : windowStart;
        LocalTime overlapEnd = lessonEnd.isBefore(windowEnd) ? lessonEnd : windowEnd;
        if (!overlapStart.isBefore(overlapEnd)) {
            return 0;
        }
        return (int) java.time.Duration.between(overlapStart, overlapEnd).toMinutes();
    }

    /**
     * True when this lesson and another share at least one subject type tag.
     * Empty type lists never match (no penalty from type variety alone).
     */
    public boolean sharesSubjectTypeWith(Lesson other) {
        if (other == null || subjectTypes == null || subjectTypes.isEmpty()
                || other.subjectTypes == null || other.subjectTypes.isEmpty()) {
            return false;
        }
        for (String type : subjectTypes) {
            if (other.subjectTypes.contains(type)) {
                return true;
            }
        }
        return false;
    }

    /** Returns the intersection of subject type tags shared with another lesson. */
    public List<String> getSharedSubjectTypesWith(Lesson other) {
        if (other == null || subjectTypes == null || subjectTypes.isEmpty()
                || other.subjectTypes == null || other.subjectTypes.isEmpty()) {
            return List.of();
        }
        return subjectTypes.stream()
                .filter(type -> other.subjectTypes.contains(type))
                .distinct()
                .toList();
    }

    @Override
    public String toString() {
        return subject + "(" + id + ")";
    }

    // ************************************************************************
    // Getters and setters
    // ************************************************************************

    public String getId() {
        return id;
    }

    public String getSubject() {
        return subject;
    }

    public String getTeacher() {
        return teacher;
    }

    public String getStudentGroup() {
        return studentGroup;
    }

    /**
     * Returns the manually selected teacher column, or null when the lesson is in its expected column.
     */
    public String getManualTeacherPlacement() {
        return manualTeacherPlacement;
    }

    public void setManualTeacherPlacement(String manualTeacherPlacement) {
        this.manualTeacherPlacement = manualTeacherPlacement;
    }

    /**
     * Returns the manually selected student-group column, or null when the lesson is in its expected column.
     */
    public String getManualStudentGroupPlacement() {
        return manualStudentGroupPlacement;
    }

    public void setManualStudentGroupPlacement(String manualStudentGroupPlacement) {
        this.manualStudentGroupPlacement = manualStudentGroupPlacement;
    }

    public int getDurationInMinutes() {
        return durationInMinutes;
    }

    public void setDurationInMinutes(int durationInMinutes) {
        this.durationInMinutes = durationInMinutes;
    }

    @ValueRangeProvider(id = "validTimeslotRange")
    @JsonIgnore
    public List<Timeslot> getValidTimeslotRange() {
        return validTimeslotRange;
    }

    public void setValidTimeslotRange(List<Timeslot> validTimeslotRange) {
        this.validTimeslotRange = validTimeslotRange;
    }

    public List<String> getAllowedRoomIds() {
        return allowedRoomIds;
    }

    public void setAllowedRoomIds(List<String> allowedRoomIds) {
        this.allowedRoomIds = allowedRoomIds;
    }

    @ValueRangeProvider(id = "validRoomRange")
    @JsonIgnore
    public List<Room> getValidRoomRange() {
        return validRoomRange;
    }

    public void setValidRoomRange(List<Room> validRoomRange) {
        this.validRoomRange = validRoomRange;
    }

    public Timeslot getTimeslot() {
        return timeslot;
    }

    public void setTimeslot(Timeslot timeslot) {
        this.timeslot = timeslot;
    }

    public Room getRoom() {
        return room;
    }

    public void setRoom(Room room) {
        this.room = room;
    }

    public List<ViolationInfo> getViolations() {
        return violations;
    }

    public void setViolations(List<ViolationInfo> violations) {
        this.violations = violations != null ? new ArrayList<>(violations) : new ArrayList<>();
    }

    /** True when this lesson is pinned and must keep its current assignment. */
    @PlanningPin
    public boolean isPinned() {
        return pinned;
    }

    public void setPinned(boolean pinned) {
        this.pinned = pinned;
    }

    /** Subject type tags for this lesson (never null after set). */
    public List<String> getSubjectTypes() {
        return subjectTypes;
    }

    public void setSubjectTypes(List<String> subjectTypes) {
        this.subjectTypes = subjectTypes == null ? new ArrayList<>() : new ArrayList<>(subjectTypes);
    }

    /** Teacher unavailable days for this lesson (never null after set). */
    public List<String> getTeacherUnavailableDays() {
        return teacherUnavailableDays;
    }

    public void setTeacherUnavailableDays(List<String> teacherUnavailableDays) {
        this.teacherUnavailableDays = teacherUnavailableDays == null ? new ArrayList<>() : new ArrayList<>(teacherUnavailableDays);
    }
}
