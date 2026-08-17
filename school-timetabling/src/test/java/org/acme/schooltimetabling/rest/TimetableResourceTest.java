package org.acme.schooltimetabling.rest;

import static io.restassured.RestAssured.get;
import static io.restassured.RestAssured.given;
import static org.awaitility.Awaitility.await;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import ai.timefold.solver.core.api.solver.SolverStatus;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Timetable;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

@QuarkusTest
class TimetableResourceTest {

    @Inject
    ObjectMapper objectMapper;

    @Test
    void solveDemoDataUntilFeasible() {
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        String jobId = given()
                .contentType(ContentType.JSON)
                .body(testTimetable)
                .expect().contentType(ContentType.TEXT)
                .when().post("/timetables")
                .then()
                .statusCode(200)
                .extract()
                .asString();

        await()
                .atMost(Duration.ofMinutes(1))
                .pollInterval(Duration.ofMillis(500L))
                .until(() -> SolverStatus.NOT_SOLVING.name().equals(
                        get("/timetables/" + jobId + "/status")
                                .jsonPath().get("solverStatus")));

        Timetable solution = get("/timetables/" + jobId).then().extract().as(Timetable.class);
        assertEquals(SolverStatus.NOT_SOLVING, solution.getSolverStatus());
        assertNotNull(solution.getLessons());
        assertNotNull(solution.getTimeslots());
        assertNotNull(solution.getRooms());
        assertNotNull(solution.getLessons().get(0).getRoom());
        assertNotNull(solution.getLessons().get(0).getTimeslot());
        assertTrue(solution.getScore().isFeasible());
    }

    @Test
    void solveDemoDataWithTeacherAvailabilityConstraint() {
        // Load dataset1 which now has Eva Mak unavailable on Monday and Tuesday.
        // Since dataset1 only has Mon–Tue timeslots, Eva Mak's lesson MUST be scheduled
        // on an unavailable day, producing a soft penalty of 1 for "Teacher availability".
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        // Verify the lesson carries the unavailable-days marker before solving.
        Lesson evaMakInput = testTimetable.getLessons().stream()
                .filter(lesson -> "Eva Mak".equals(lesson.getTeacher()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Eva Mak lesson not found in dataset1"));
        assertEquals(java.util.List.of("MONDAY", "TUESDAY"), evaMakInput.getTeacherUnavailableDays());

        // Solve the timetable (all soft constraints active by default).
        String jobId = given()
                .contentType(ContentType.JSON)
                .body(testTimetable)
                .expect().contentType(ContentType.TEXT)
                .when().post("/timetables")
                .then()
                .statusCode(200)
                .extract()
                .asString();

        await()
                .atMost(Duration.ofMinutes(1))
                .pollInterval(Duration.ofMillis(500L))
                .until(() -> SolverStatus.NOT_SOLVING.name().equals(
                        get("/timetables/" + jobId + "/status")
                                .jsonPath().get("solverStatus")));

        Timetable solution = get("/timetables/" + jobId).then().extract().as(Timetable.class);
        assertTrue(solution.getScore().isFeasible());

        // Eva Mak's lesson must be scheduled (soft constraint does not prevent assignment).
        Lesson evaMakLesson = solution.getLessons().stream()
                .filter(lesson -> "Eva Mak".equals(lesson.getTeacher()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Eva Mak lesson not found in solution"));
        assertNotNull(evaMakLesson.getTimeslot(), "Eva Mak lesson should be scheduled");

        // The lesson is on Monday or Tuesday (only options in dataset1), which is unavailable,
        // so the violation labeler should have flagged it.
        assertTrue(evaMakLesson.getViolations().stream()
                        .anyMatch(v -> "Teacher availability".equals(v.getConstraintName())),
                "Expected a 'Teacher availability' violation on Eva Mak's lesson, got: "
                        + evaMakLesson.getViolations());
    }

    /**
     * Mimics browser JSON.stringify after drag-drop: lessons carry embedded timeslot/room objects
     * instead of Jackson identity-reference id strings.
     */
    @Test
    void refreshScoreWithBrowserLikeEmbeddedReferences() throws Exception {
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        ObjectMapper mapper = objectMapper;
        ObjectNode root = (ObjectNode) mapper.valueToTree(testTimetable);
        ObjectNode lesson0 = (ObjectNode) root.get("lessons").get(0);
        lesson0.set("timeslot", root.get("timeslots").get(0));
        lesson0.set("room", root.get("rooms").get(0));
        // Frontend normalizeScheduleReferencesForApi converts embedded refs to id strings.
        lesson0.put("timeslot", lesson0.get("timeslot").get("id").asText());
        lesson0.put("room", lesson0.get("room").get("id").asText());
        root.put("solverStatus", "NOT_SOLVING");
        root.put("score", "0hard/0soft");

        given()
                .contentType(ContentType.JSON)
                .body(root.toString())
                .when()
                .put("/timetables/score")
                .then()
                .statusCode(200);
    }

    @Test
    void refreshScoreAcceptsStartTimeslotTooShortForLessonDurationAndLabelsViolation() {
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        var timeslots = testTimetable.getTimeslots();
        Lesson lesson = testTimetable.getLessons().get(0);
        // 120-minute Math lesson cannot start at MONDAY 16:00 (only 90 contiguous minutes remain).
        var monday1600 = timeslots.stream()
                .filter(t -> t.getDayOfWeek().name().equals("MONDAY")
                        && t.getStartTime().toString().equals("16:00"))
                .findFirst()
                .orElseThrow();
        lesson.setTimeslot(monday1600);
        lesson.setRoom(testTimetable.getRooms().get(0));

        Timetable scored = given()
                .contentType(ContentType.JSON)
                .body(testTimetable)
                .when()
                .put("/timetables/score")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        assertNotNull(scored.getScore());
        assertTrue(scored.getScore().hardScore() < 0);
        assertTrue(scored.getLessons().get(0).getViolations().stream()
                .anyMatch(v -> "Lesson duration exceeds available contiguous time".equals(v.getConstraintName())));
    }

    @Test
    void refreshScoreAfterManualEdit() {
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        var rooms = testTimetable.getRooms();
        var timeslots = testTimetable.getTimeslots();
        Lesson firstLesson = testTimetable.getLessons().get(0);
        Lesson secondLesson = testTimetable.getLessons().get(1);
        firstLesson.setRoom(rooms.get(0));
        firstLesson.setTimeslot(timeslots.get(0));
        // Overlap same room and timeslot to create a hard room conflict.
        secondLesson.setRoom(rooms.get(0));
        secondLesson.setTimeslot(timeslots.get(0));

        Timetable scored = given()
                .contentType(ContentType.JSON)
                .body(testTimetable)
                .when()
                .put("/timetables/score")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);

        assertNotNull(scored.getScore());
        assertTrue(scored.getScore().hardScore() < 0);
        assertNotNull(scored.getLessons().get(0).getViolations());
        assertTrue(scored.getLessons().get(0).getViolations().stream()
                .anyMatch(v -> "Room conflict".equals(v.getConstraintName())));
    }

    @EnabledIfSystemProperty(named = "enterprise", matches = ".*")
    @Test
    void analyze() {
        Timetable testTimetable = given()
                .when().get("/demo-data/dataset1")
                .then()
                .statusCode(200)
                .extract()
                .as(Timetable.class);
        var rooms = testTimetable.getRooms();
        var timeslots = testTimetable.getTimeslots();
        int i = 0;
        for (var lesson : testTimetable.getLessons()) { // Initialize the solution.
            lesson.setRoom(rooms.get(i % rooms.size()));
            lesson.setTimeslot(timeslots.get(i % timeslots.size()));
            i += 1;
        }

        String analysis = given()
                .contentType(ContentType.JSON)
                .body(testTimetable)
                .expect().contentType(ContentType.JSON)
                .when()
                .put("/timetables/analyze")
                .then()
                .extract()
                .asString();
        assertNotNull(analysis); // Too long to validate in its entirety.

        String analysis2 = given()
                .contentType(ContentType.JSON)
                .queryParam("fetchPolicy", "FETCH_SHALLOW")
                .body(testTimetable)
                .expect().contentType(ContentType.JSON)
                .when()
                .put("/timetables/analyze")
                .then()
                .extract()
                .asString();
        assertNotNull(analysis2); // Too long to validate in its entirety.
    }

}