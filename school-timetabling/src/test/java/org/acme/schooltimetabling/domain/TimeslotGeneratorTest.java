package org.acme.schooltimetabling.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.Test;

class TimeslotGeneratorTest {

    @Test
    void generatesThirtyMinuteSlotsIncludingHardLunchRow() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(DayOfWeek.MONDAY));
        assertEquals(18, timeslots.size());
        assertEquals(LocalTime.of(8, 30), timeslots.get(0).getStartTime());
        assertEquals(LocalTime.of(9, 0), timeslots.get(0).getEndTime());
        assertEquals(LocalTime.of(17, 0), timeslots.get(timeslots.size() - 1).getStartTime());
        assertEquals(LocalTime.of(17, 30), timeslots.get(timeslots.size() - 1).getEndTime());
        assertTrue(timeslots.stream().anyMatch(ts -> ts.getStartTime().equals(TimeslotGenerator.LUNCH_HARD_START)));
        assertTrue(timeslots.stream().anyMatch(ts -> ts.getStartTime().equals(LocalTime.of(12, 30))));
    }

    @Test
    void computesMaxConsecutiveMinutesBeforeHardLunchAndDayEnd() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(DayOfWeek.MONDAY));
        Timeslot slot1200 = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(LocalTime.of(12, 0)))
                .findFirst()
                .orElseThrow();
        assertEquals(60, slot1200.getMaxConsecutiveMinutesFromStart());

        Timeslot slot1230 = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(LocalTime.of(12, 30)))
                .findFirst()
                .orElseThrow();
        assertEquals(30, slot1230.getMaxConsecutiveMinutesFromStart());

        Timeslot hardLunchSlot = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(TimeslotGenerator.LUNCH_HARD_START))
                .findFirst()
                .orElseThrow();
        assertEquals(0, hardLunchSlot.getMaxConsecutiveMinutesFromStart());

        Timeslot slot1330 = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(TimeslotGenerator.LUNCH_HARD_END))
                .findFirst()
                .orElseThrow();
        assertEquals(240, slot1330.getMaxConsecutiveMinutesFromStart());

        Timeslot lastAfternoonSlot = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(LocalTime.of(17, 0)))
                .findFirst()
                .orElseThrow();
        assertEquals(30, lastAfternoonSlot.getMaxConsecutiveMinutesFromStart());

        Timeslot threeHourStart = timeslots.stream()
                .filter(ts -> ts.getStartTime().equals(LocalTime.of(16, 0)))
                .findFirst()
                .orElseThrow();
        assertEquals(90, threeHourStart.getMaxConsecutiveMinutesFromStart());
    }
}
