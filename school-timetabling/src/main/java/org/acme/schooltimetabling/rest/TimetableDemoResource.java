package org.acme.schooltimetabling.rest;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.acme.schooltimetabling.domain.Lesson;
import org.acme.schooltimetabling.domain.Room;
import org.acme.schooltimetabling.domain.Timeslot;
import org.acme.schooltimetabling.domain.TimeslotGenerator;
import org.acme.schooltimetabling.domain.Timetable;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Tag(name = "Demo data", description = "Timefold-provided demo school timetable data.")
@Path("demo-data")
public class TimetableDemoResource {

    public enum DemoData {
        dataset1,
        dataset2
    }

    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "List of demo data represented as IDs.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = DemoData.class, type = SchemaType.ARRAY))) })
    @Operation(summary = "List demo data.")
    @GET
    public DemoData[] list() {
        return DemoData.values();
    }

    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "Unsolved demo timetable.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = Timetable.class)))})
    @Operation(summary = "Find an unsolved demo timetable by ID.")
    @GET
    @Path("/{demoDataId}")
    public Response generate(@Parameter(description = "Unique identifier of the demo data.",
            required = true) @PathParam("demoDataId") DemoData demoData) {
        // dataset1 uses Mon–Tue only; Wed–Fri timeslots are available in dataset2 demo data.
        EnumSet<DayOfWeek> days = demoData == DemoData.dataset2
                ? EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY)
                : EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY);
        List<Timeslot> timeslots = TimeslotGenerator.generate(days);

        List<Room> rooms = new ArrayList<>(2);
        long nextRoomId = 0L;
        rooms.add(new Room(Long.toString(nextRoomId++), "Room A"));
        rooms.add(new Room(Long.toString(nextRoomId++), "Room B"));
        if (demoData == DemoData.dataset2) {
            rooms.add(new Room(Long.toString(nextRoomId++), "Room C"));
            rooms.add(new Room(Long.toString(nextRoomId++), "Room E"));
        }

        // Each demo dataset is self-contained: dataset1 returns set1 only, dataset2 returns set2 only.
        List<Lesson> lessons = new ArrayList<>();

        if (demoData == DemoData.dataset1) {
            // set1 — Mon–Tue, core subjects (6 lessons).
            lessons.add(new Lesson("0001", "Math", "Gary Lam", "EG1A", 120));
            lessons.add(new Lesson("0002", "Math", "Gary Lam", "EG1B", 120));
            Lesson evaMakEnglish = new Lesson("0003", "English", "Eva Mak", "EG1A", 120);
            evaMakEnglish.setTeacherUnavailableDays(List.of("MONDAY", "TUESDAY"));
            lessons.add(evaMakEnglish);
            lessons.add(new Lesson("0004", "Chinese", "Johnny Kwong", "EG1B", 120));
            lessons.add(new Lesson("0005", "Physics", "Rex Boo", "EG1A", 120));
            lessons.add(new Lesson("0006", "Physics", "Rex Boo", "EG1B", 120));
        } else {
            // set2 — Mon–Fri, extended subjects only (8 lessons; does not include set1 lessons).
            lessons.add(new Lesson("0001", "Engineering Science", "Apple Chan", "EG1A", 120));
            lessons.add(new Lesson("0002", "Computer Aided Design in Engineering", "Apple Chan", "EG1A", 120));
            lessons.add(new Lesson("0003", "Electrical and Electronics Principles", "Bill Ng", "EG1A", 120));
            lessons.add(new Lesson("0004", "Mathematics 1", "David Wong", "EG1A", 120));
            lessons.add(new Lesson("0005", "Mechanical Principles", "Bill Ng", "EG1A", 120));
            lessons.add(new Lesson("0006", "Additive Manufacturing Processes", "Eric Yu", "EG1A", 120));
            lessons.add(new Lesson("0007", "Chinese 1", "Ivan Lam", "EG1A", 120));
            lessons.add(new Lesson("0009", "English in Action", "Henry Mak", "EG1A", 120));
            lessons.add(new Lesson("0010", "Self-Discovery", "Franky Choi", "EG1A", 120));

            lessons.add(new Lesson("0011", "Engineering Science", "Bill Ng", "EG1B", 120));
            lessons.add(new Lesson("0012", "Computer Aided Design in Engineering", "Cathy Chang", "EG1B", 120));
            lessons.add(new Lesson("0013", "Electrical and Electronics Principles", "Bill Ng", "EG1B", 120));
            lessons.add(new Lesson("0014", "Mathematics 1", "Eric Yu", "EG1B", 120));
            lessons.add(new Lesson("0015", "Mechanical Principles", "Cathy Chang", "EG1B", 120));
            lessons.add(new Lesson("0016", "Additive Manufacturing Processes", "Eric Yu", "EG1B", 120));
            lessons.add(new Lesson("0017", "Chinese 1", "Ivan Lam", "EG1B", 120));
            lessons.add(new Lesson("0018", "English 1", "Gloria Tang", "EG1A", 120));
            lessons.add(new Lesson("0019", "English in Action", "Henry Mak", "EG1B", 120));
            lessons.add(new Lesson("0020", "Self-Discovery", "Franky Choi", "EG1B", 120));

            lessons.add(new Lesson("0021", "Engineering Science", "Bill Ng", "EG1C", 120));
            lessons.add(new Lesson("0022", "Computer Aided Design in Engineering", "Cathy Chang", "EG1C", 120));
            lessons.add(new Lesson("0023", "Electrical and Electronics Principles", "Cathy Chang", "EG1C", 120));
            lessons.add(new Lesson("0024", "Mathematics 1", "Apple Chan", "EG1C", 120));
            lessons.add(new Lesson("0025", "Mechanical Principles", "Cathy Chang", "EG1C", 120));
            lessons.add(new Lesson("0026", "Additive Manufacturing Processes", "David Wong", "EG1C", 120));
            lessons.add(new Lesson("0027", "Chinese 1", "Franky Choi", "EG1C", 120));
            lessons.add(new Lesson("0028", "English 1", "Gloria Tang", "EG1B", 120));
            lessons.add(new Lesson("0029", "English in Action", "Henry Mak", "EG1C", 120));
            lessons.add(new Lesson("0030", "Self-Discovery", "Franky Choi", "EG1C", 120));

            lessons.add(new Lesson("0037", "English 1", "Henry Mak", "EG1C", 120));

            lessons.add(new Lesson("0038", "Engineering Science", "Apple Chan", "EG1A", 90));
            lessons.add(new Lesson("0039", "Engineering Science", "Bill Ng", "EG1B", 90));
            lessons.add(new Lesson("0040", "Engineering Science", "Bill Ng", "EG1C", 90));

            lessons.add(new Lesson("0041", "English 1", "Gloria Tang", "EG1A", 120));
            lessons.add(new Lesson("0042", "English 1", "Gloria Tang", "EG1B", 120));
            lessons.add(new Lesson("0043", "English 1", "Henry Mak", "EG1C", 120));
            lessons.add(new Lesson("0044", "English 1", "Gloria Tang", "EG1A", 120));
            lessons.add(new Lesson("0045", "English 1", "Gloria Tang", "EG1B", 120));
            lessons.add(new Lesson("0046", "English 1", "Henry Mak", "EG1C", 120));

            lessons.add(new Lesson("0047", "Mathematics 1", "David Wong", "EG1A", 120));
            lessons.add(new Lesson("0048", "Mathematics 1", "Eric Yu", "EG1B", 120));
            lessons.add(new Lesson("0049", "Mathematics 1", "Apple Chan", "EG1C", 120));

            lessons.add(new Lesson("0050", "Chinese 1", "Ivan Lam", "EG1A", 60));
            lessons.add(new Lesson("0051", "Chinese 1", "Ivan Lam", "EG1B", 60));
            lessons.add(new Lesson("0052", "Chinese 1", "Franky Choi", "EG1C", 60));
        }

        // Chinese, English, Math, and Self-Discovery are Generic; all other demo subjects are Trade.
        applyDemoSubjectTypes(lessons);
        return Response.ok(new Timetable(demoData.name(), timeslots, rooms, lessons)).build();
    }

    /** Subject-type tag for core language, math, and self-discovery lessons in demo data. */
    private static final List<String> GENERIC_SUBJECT_TYPE = List.of("Generic");

    /** Subject-type tag for vocational/trade lessons in demo data. */
    private static final List<String> TRADE_SUBJECT_TYPE = List.of("Trade");

    /** Sets Generic or Trade on every demo lesson based on its subject name. */
    private static void applyDemoSubjectTypes(List<Lesson> lessons) {
        for (Lesson lesson : lessons) {
            lesson.setSubjectTypes(demoSubjectTypesFor(lesson.getSubject()));
        }
    }

    /**
     * Returns Generic for Chinese, English, Math, and Self-Discovery subjects;
     * Trade for all remaining demo subjects (e.g. Physics, Engineering Science).
     */
    private static List<String> demoSubjectTypesFor(String subject) {
        return isGenericDemoSubject(subject) ? GENERIC_SUBJECT_TYPE : TRADE_SUBJECT_TYPE;
    }

    private static boolean isGenericDemoSubject(String subject) {
        if (subject == null || subject.isBlank()) {
            return false;
        }
        String normalized = subject.trim().toLowerCase();
        return normalized.contains("chinese")
                || normalized.contains("english")
                || normalized.contains("math")
                || normalized.equals("self-discovery");
    }

}
