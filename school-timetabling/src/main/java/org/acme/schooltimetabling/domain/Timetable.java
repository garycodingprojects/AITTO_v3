package org.acme.schooltimetabling.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.HardSoftScore;
import ai.timefold.solver.core.api.domain.solution.ConstraintWeightOverrides;
import ai.timefold.solver.core.api.solver.SolverStatus;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;

import org.acme.schooltimetabling.solver.TimetableConstraintProvider;

@PlanningSolution
public class Timetable {

    private String name;

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<Timeslot> timeslots;
    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<Room> rooms;
    @PlanningEntityCollectionProperty
    private List<Lesson> lessons;

    @PlanningScore
    private HardSoftScore score;

    // Ignored by Timefold, used by the UI to display solve or stop solving button
    private SolverStatus solverStatus;

    /**
     * Runtime soft-constraint toggles from the demo UI.
     * Unchecked constraints are sent as {@code 0hard/0soft} to disable them for this solve request.
     * Must never be null — Timefold requires a non-null overrides supplier when this field exists.
     */
    private ConstraintWeightOverrides<HardSoftScore> constraintWeightOverrides = emptyConstraintWeightOverrides();

    /**
     * Reserved ECA half-day blocks for Demo UI display only; ignored by the solver.
     * Populated from Preparation workspace export.
     */
    private List<EcaBlock> ecaBlocks;

    // No-arg constructor required for Timefold
    public Timetable() {
    }

    public Timetable(String name, HardSoftScore score, SolverStatus solverStatus) {
        this.name = name;
        this.score = score;
        this.solverStatus = solverStatus;
    }

    public Timetable(String name, List<Timeslot> timeslots, List<Room> rooms, List<Lesson> lessons) {
        this.name = name;
        this.timeslots = timeslots;
        this.rooms = rooms;
        this.lessons = lessons;
        updateLessonValueRanges();
    }

    /**
     * Builds entity-specific valid start times and eligible rooms for every lesson.
     * Long lessons may only start where enough contiguous 30-minute slots remain before a break or day end
     * (solver search space). Any timeslot or room already assigned on a lesson is always kept in that
     * lesson's value range so manual Demo UI edits can be scored and labeled as violations instead of
     * failing with an out-of-range error.
     * Lessons with {@code allowedRoomIds} may only be assigned rooms from that set; otherwise all rooms apply.
     */
    public void updateLessonValueRanges() {
        if (timeslots == null || lessons == null) {
            return;
        }
        Map<String, Room> roomById = rooms == null ? Map.of() : rooms.stream()
                .collect(Collectors.toMap(Room::getId, room -> room, (first, second) -> first));
        List<Room> allRooms = rooms == null ? List.of() : List.copyOf(rooms);

        for (Lesson lesson : lessons) {
            List<Timeslot> validTimeslotRange = timeslots.stream()
                    .filter(timeslot -> timeslot.getMaxConsecutiveMinutesFromStart() >= lesson.getDurationInMinutes())
                    .collect(Collectors.toCollection(ArrayList::new));
            includeAssignedTimeslotInValueRange(lesson, timeslots, validTimeslotRange);

            List<Room> validRoomRange = new ArrayList<>(resolveValidRoomsForLesson(lesson, roomById, allRooms));
            includeAssignedRoomInValueRange(lesson, roomById, validRoomRange);

            lesson.setValidTimeslotRange(validTimeslotRange);
            lesson.setValidRoomRange(validRoomRange);
        }
    }

    /**
     * Keeps a manually assigned start slot in the lesson's value range even when it spans lunch or
     * exceeds contiguous time, so score refresh can penalize the violation instead of rejecting the request.
     */
    private static void includeAssignedTimeslotInValueRange(
            Lesson lesson, List<Timeslot> allTimeslots, List<Timeslot> validTimeslotRange) {
        Timeslot assignedTimeslot = lesson.getTimeslot();
        if (assignedTimeslot == null) {
            return;
        }
        Timeslot canonicalTimeslot = allTimeslots.stream()
                .filter(timeslot -> timeslot.getId().equals(assignedTimeslot.getId()))
                .findFirst()
                .orElse(null);
        if (canonicalTimeslot == null) {
            return;
        }
        boolean alreadyIncluded = validTimeslotRange.stream()
                .anyMatch(timeslot -> timeslot.getId().equals(canonicalTimeslot.getId()));
        if (!alreadyIncluded) {
            validTimeslotRange.add(canonicalTimeslot);
        }
        if (assignedTimeslot != canonicalTimeslot) {
            lesson.setTimeslot(canonicalTimeslot);
        }
    }

    /**
     * Keeps a manually assigned room in the lesson's value range even when it is outside allowedRoomIds,
     * so score refresh can surface a room conflict or stability violation instead of failing outright.
     */
    private static void includeAssignedRoomInValueRange(
            Lesson lesson, Map<String, Room> roomById, List<Room> validRoomRange) {
        Room assignedRoom = lesson.getRoom();
        if (assignedRoom == null) {
            return;
        }
        Room canonicalRoom = roomById.get(assignedRoom.getId());
        if (canonicalRoom == null) {
            return;
        }
        boolean alreadyIncluded = validRoomRange.stream()
                .anyMatch(room -> room.getId().equals(canonicalRoom.getId()));
        if (!alreadyIncluded) {
            validRoomRange.add(canonicalRoom);
        }
        if (assignedRoom != canonicalRoom) {
            lesson.setRoom(canonicalRoom);
        }
    }

    /**
     * Resolves eligible rooms for one lesson from its allowedRoomIds, or all rooms when unset.
     */
    private static List<Room> resolveValidRoomsForLesson(Lesson lesson, Map<String, Room> roomById, List<Room> allRooms) {
        List<String> allowedRoomIds = lesson.getAllowedRoomIds();
        if (allowedRoomIds == null || allowedRoomIds.isEmpty()) {
            return allRooms;
        }
        Set<String> allowedIdSet = Set.copyOf(allowedRoomIds);
        return allRooms.stream()
                .filter(room -> allowedIdSet.contains(room.getId()))
                .toList();
    }

    // ************************************************************************
    // Getters and setters
    // ************************************************************************

    public String getName() {
        return name;
    }

    public List<Timeslot> getTimeslots() {
        return timeslots;
    }

    public List<Room> getRooms() {
        return rooms;
    }

    public List<Lesson> getLessons() {
        return lessons;
    }

    public HardSoftScore getScore() {
        return score;
    }

    public void setScore(HardSoftScore score) {
        this.score = score;
    }

    public SolverStatus getSolverStatus() {
        return solverStatus;
    }

    public void setSolverStatus(SolverStatus solverStatus) {
        this.solverStatus = solverStatus;
    }

    public ConstraintWeightOverrides<HardSoftScore> getConstraintWeightOverrides() {
        if (constraintWeightOverrides == null) {
            constraintWeightOverrides = emptyConstraintWeightOverrides();
        }
        return constraintWeightOverrides;
    }

    @JsonIgnore
    public void setConstraintWeightOverrides(ConstraintWeightOverrides<HardSoftScore> constraintWeightOverrides) {
        this.constraintWeightOverrides = constraintWeightOverrides == null
                ? emptyConstraintWeightOverrides()
                : constraintWeightOverrides;
    }

    /** Empty overrides mean all constraints keep their default weights from the constraint provider. */
    private static ConstraintWeightOverrides<HardSoftScore> emptyConstraintWeightOverrides() {
        return ConstraintWeightOverrides.of(Map.<String, HardSoftScore>of());
    }

    /**
     * Deserializes UI-provided constraint weight overrides from JSON.
     * Keys must match constraint IDs in {@link TimetableConstraintProvider}.
     */
    @JsonSetter("constraintWeightOverrides")
    public void setConstraintWeightOverridesFromJson(Map<String, String> overridesByConstraintName) {
        if (overridesByConstraintName == null || overridesByConstraintName.isEmpty()) {
            this.constraintWeightOverrides = emptyConstraintWeightOverrides();
            return;
        }
        Map<String, HardSoftScore> parsedOverrides = new HashMap<>();
        for (Map.Entry<String, String> entry : overridesByConstraintName.entrySet()) {
            parsedOverrides.put(entry.getKey(), HardSoftScore.parseScore(entry.getValue()));
        }
        this.constraintWeightOverrides = ConstraintWeightOverrides.of(parsedOverrides);
    }

    /**
     * Builds overrides that disable any soft constraint not present in {@code enabledSoftConstraintNames}.
     * All soft constraints are enabled when the set is null or contains every soft constraint name.
     */
    public void applyEnabledSoftConstraints(java.util.Set<String> enabledSoftConstraintNames) {
        if (enabledSoftConstraintNames == null
                || enabledSoftConstraintNames.containsAll(TimetableConstraintProvider.SOFT_CONSTRAINTS)) {
            this.constraintWeightOverrides = emptyConstraintWeightOverrides();
            return;
        }
        Map<String, HardSoftScore> overrides = new HashMap<>();
        for (String softConstraintName : TimetableConstraintProvider.SOFT_CONSTRAINTS) {
            if (!enabledSoftConstraintNames.contains(softConstraintName)) {
                overrides.put(softConstraintName, HardSoftScore.ZERO);
            }
        }
        this.constraintWeightOverrides = overrides.isEmpty()
                ? emptyConstraintWeightOverrides()
                : ConstraintWeightOverrides.of(overrides);
    }

    public List<EcaBlock> getEcaBlocks() {
        return ecaBlocks;
    }

    public void setEcaBlocks(List<EcaBlock> ecaBlocks) {
        this.ecaBlocks = ecaBlocks;
    }

}
