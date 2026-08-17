package org.acme.schooltimetabling.rest;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.DayOfWeek;
import java.util.Set;
import java.util.stream.Collectors;

import org.acme.schooltimetabling.domain.Timetable;
import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;

@QuarkusTest
class TimetableDemoResourceTest {

    /** Each weekday in the school day has 18 thirty-minute slots (08:30–17:30, including lunch rows). */
    private static final int SLOTS_PER_DAY = 18;

    @Test
    void smallDemoDataUsesMondayAndTuesdayOnly() {
        Timetable small = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        Set<DayOfWeek> days = small.getTimeslots().stream()
                .map(ts -> ts.getDayOfWeek())
                .collect(Collectors.toSet());

        assertEquals(Set.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY), days);
        assertEquals(SLOTS_PER_DAY * 2, small.getTimeslots().size());
        assertFalse(days.contains(DayOfWeek.WEDNESDAY));
        assertFalse(days.contains(DayOfWeek.THURSDAY));
        assertFalse(days.contains(DayOfWeek.FRIDAY));
    }

    @Test
    void largeDemoDataUsesMondayThroughFriday() {
        Timetable large = given()
                .when().get("/demo-data/dataset2")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        Set<DayOfWeek> days = large.getTimeslots().stream()
                .map(ts -> ts.getDayOfWeek())
                .collect(Collectors.toSet());

        assertEquals(Set.of(
                DayOfWeek.MONDAY,
                DayOfWeek.TUESDAY,
                DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY,
                DayOfWeek.FRIDAY), days);
        assertEquals(SLOTS_PER_DAY * 5, large.getTimeslots().size());
        assertTrue(days.contains(DayOfWeek.WEDNESDAY));
        assertTrue(days.contains(DayOfWeek.THURSDAY));
        assertTrue(days.contains(DayOfWeek.FRIDAY));
    }
}
