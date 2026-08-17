package org.acme.schooltimetabling.domain;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Builds 30-minute timeslots for the school day and computes contiguous availability per start slot.
 */
public final class TimeslotGenerator {

    public static final LocalTime SCHOOL_DAY_START = LocalTime.of(8, 30);
    public static final LocalTime SCHOOL_DAY_END = LocalTime.of(17, 30);

    /** Mandatory lunch block: no lesson may overlap this interval (hard constraint). */
    public static final LocalTime LUNCH_HARD_START = LocalTime.of(13, 0);
    public static final LocalTime LUNCH_HARD_END = LocalTime.of(13, 30);

    /** Optional adjacent slots before hard lunch for a 2-hour soft lunch gap (11:30–13:00). */
    public static final LocalTime LUNCH_SOFT_BEFORE_START = LocalTime.of(11, 30);

    /** End of optional adjacent slots after hard lunch for a 2-hour soft lunch gap (13:30–15:00). */
    public static final LocalTime LUNCH_SOFT_AFTER_END = LocalTime.of(15, 0);

    /** Minimum adjacent slots before hard lunch for the 1-hour hard lunch timebreak (12:30–13:00). */
    public static final LocalTime LUNCH_TIMEBREAK_BEFORE_START = LocalTime.of(12, 30);

    /** End of minimum adjacent slots after hard lunch for the 1-hour hard lunch timebreak (13:30–14:00). */
    public static final LocalTime LUNCH_TIMEBREAK_AFTER_END = LocalTime.of(14, 0);

    private TimeslotGenerator() {
    }

    /**
     * Generates every 30-minute slot from 08:30 until 17:30 for each given day, including the
     * hard lunch row (13:00–13:30) so the UI can display the full school-day grid.
     * Each slot receives {@code maxConsecutiveMinutesFromStart} for duration validation.
     */
    public static List<Timeslot> generate(EnumSet<DayOfWeek> days) {
        AtomicLong nextId = new AtomicLong(0L);
        List<Timeslot> timeslots = new ArrayList<>();
        List<DayOfWeek> sortedDays = days.stream().sorted(Comparator.comparing(DayOfWeek::getValue)).toList();
        for (DayOfWeek day : sortedDays) {
            LocalTime slotStart = SCHOOL_DAY_START;
            while (slotStart.plusMinutes(Timeslot.SLOT_MINUTES).compareTo(SCHOOL_DAY_END) <= 0) {
                LocalTime slotEnd = slotStart.plusMinutes(Timeslot.SLOT_MINUTES);
                timeslots.add(new Timeslot(Long.toString(nextId.getAndIncrement()), day, slotStart, slotEnd));
                slotStart = slotEnd;
            }
        }
        computeMaxConsecutiveMinutes(timeslots);
        return timeslots;
    }

    /** True when a slot starts inside the mandatory hard lunch block. */
    public static boolean isHardLunchSlotStart(LocalTime slotStart) {
        return !slotStart.isBefore(LUNCH_HARD_START) && slotStart.isBefore(LUNCH_HARD_END);
    }

    /**
     * For each day, walk forward from every start slot and count contiguous 30-minute slots
     * until the hard lunch block or school-day end is reached.
     */
    static void computeMaxConsecutiveMinutes(List<Timeslot> timeslots) {
        timeslots.stream()
                .collect(java.util.stream.Collectors.groupingBy(Timeslot::getDayOfWeek))
                .values()
                .forEach(daySlots -> {
                    daySlots.sort(Comparator.comparing(Timeslot::getStartTime));
                    for (int i = 0; i < daySlots.size(); i++) {
                        Timeslot startSlot = daySlots.get(i);
                        if (isHardLunchSlotStart(startSlot.getStartTime())) {
                            startSlot.setMaxConsecutiveMinutesFromStart(0);
                            continue;
                        }
                        int consecutiveMinutes = Timeslot.SLOT_MINUTES;
                        for (int j = i + 1; j < daySlots.size(); j++) {
                            Timeslot previous = daySlots.get(j - 1);
                            Timeslot current = daySlots.get(j);
                            if (!previous.getEndTime().equals(current.getStartTime())) {
                                break;
                            }
                            // Lessons cannot extend across the mandatory 13:00–13:30 lunch block.
                            if (current.getStartTime().equals(LUNCH_HARD_START)) {
                                break;
                            }
                            consecutiveMinutes += Timeslot.SLOT_MINUTES;
                        }
                        startSlot.setMaxConsecutiveMinutesFromStart(consecutiveMinutes);
                    }
                });
    }
}

