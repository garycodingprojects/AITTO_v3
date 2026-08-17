package org.acme.schooltimetabling.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;

import ai.timefold.solver.core.api.domain.common.PlanningId;
import com.fasterxml.jackson.annotation.JsonIdentityInfo;
import com.fasterxml.jackson.annotation.ObjectIdGenerators;

@JsonIdentityInfo(scope = Timeslot.class, generator = ObjectIdGenerators.PropertyGenerator.class, property = "id")
public class Timeslot {

    /** Length of one atomic scheduling slot in minutes. */
    public static final int SLOT_MINUTES = 30;

    @PlanningId
    private String id;

    private DayOfWeek dayOfWeek;
    private LocalTime startTime;
    private LocalTime endTime;

    /**
     * Maximum minutes a lesson may run when starting at this slot without crossing a break or school-day end.
     * Computed when demo/problem timeslots are generated.
     */
    private int maxConsecutiveMinutesFromStart;

    public Timeslot() {
    }

    public Timeslot(String id, DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime) {
        this.id = id;
        this.dayOfWeek = dayOfWeek;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    /** Convenience constructor for a single 30-minute slot starting at {@code startTime}. */
    public Timeslot(String id, DayOfWeek dayOfWeek, LocalTime startTime) {
        this(id, dayOfWeek, startTime, startTime.plusMinutes(SLOT_MINUTES));
    }

    @Override
    public String toString() {
        return dayOfWeek + " " + startTime;
    }

    // ************************************************************************
    // Getters and setters
    // ************************************************************************

    public String getId() {
        return id;
    }

    public DayOfWeek getDayOfWeek() {
        return dayOfWeek;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public int getMaxConsecutiveMinutesFromStart() {
        return maxConsecutiveMinutesFromStart;
    }

    public void setMaxConsecutiveMinutesFromStart(int maxConsecutiveMinutesFromStart) {
        this.maxConsecutiveMinutesFromStart = maxConsecutiveMinutesFromStart;
    }
}
