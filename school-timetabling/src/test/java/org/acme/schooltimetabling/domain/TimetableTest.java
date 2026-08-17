package org.acme.schooltimetabling.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ai.timefold.solver.core.api.score.HardSoftScore;
import ai.timefold.solver.core.api.domain.solution.ConstraintWeightOverrides;

import org.acme.schooltimetabling.solver.TimetableConstraintProvider;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;

@QuarkusTest
class TimetableTest {

    @Inject
    ObjectMapper objectMapper;

    @Test
    void applyEnabledSoftConstraints_disablesUncheckedConstraints() {
        Timetable timetable = new Timetable();
        timetable.applyEnabledSoftConstraints(Set.of(
                TimetableConstraintProvider.TEACHER_TIME_EFFICIENCY,
                TimetableConstraintProvider.STUDENT_TIME_EFFICIENCY));

        ConstraintWeightOverrides<HardSoftScore> overrides = timetable.getConstraintWeightOverrides();
        assertThat(overrides).isNotNull();
        assertThat(overrides.getConstraintWeight(TimetableConstraintProvider.TEACHER_ROOM_STABILITY))
                .isEqualTo(HardSoftScore.ZERO);
        assertThat(overrides.getConstraintWeight(TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY))
                .isEqualTo(HardSoftScore.ZERO);
        assertThat(overrides.getConstraintWeight(TimetableConstraintProvider.TEACHER_TIME_EFFICIENCY)).isNull();
        assertThat(overrides.getConstraintWeight(TimetableConstraintProvider.STUDENT_TIME_EFFICIENCY)).isNull();
    }

    @Test
    void applyEnabledSoftConstraints_allEnabledClearsOverrides() {
        Timetable timetable = new Timetable();
        timetable.applyEnabledSoftConstraints(Set.copyOf(TimetableConstraintProvider.SOFT_CONSTRAINTS));
        assertThat(timetable.getConstraintWeightOverrides()).isNotNull();
        assertThat(timetable.getConstraintWeightOverrides().getConstraintWeight(
                TimetableConstraintProvider.TEACHER_ROOM_STABILITY)).isNull();
    }

    @Test
    void constraintWeightOverrides_deserializeFromJson() throws Exception {
        String json = """
                {
                  "name": "dataset1",
                  "constraintWeightOverrides": {
                    "Teacher room stability": "0hard/0soft",
                    "Student group subject variety": "0hard/0soft"
                  }
                }
                """;
        Timetable timetable = objectMapper.readValue(json, Timetable.class);
        assertThat(timetable.getConstraintWeightOverrides()).isNotNull();
        assertThat(timetable.getConstraintWeightOverrides().getConstraintWeight(
                TimetableConstraintProvider.TEACHER_ROOM_STABILITY)).isEqualTo(HardSoftScore.ZERO);
        assertThat(timetable.getConstraintWeightOverrides().getConstraintWeight(
                TimetableConstraintProvider.STUDENT_GROUP_SUBJECT_VARIETY)).isEqualTo(HardSoftScore.ZERO);
    }

    @Test
    void lessonPinned_deserializeFromJson() throws Exception {
        String json = """
                {
                  "name": "dataset1",
                  "lessons": [
                    {
                      "id": "0",
                      "subject": "Math",
                      "teacher": "Gary Lam",
                      "studentGroup": "EG1A",
                      "pinned": true
                    }
                  ]
                }
                """;
        Timetable timetable = objectMapper.readValue(json, Timetable.class);
        assertThat(timetable.getLessons()).hasSize(1);
        assertThat(timetable.getLessons().get(0).isPinned()).isTrue();
    }

    @Test
    void lessonSubjectTypes_deserializeFromJson() throws Exception {
        String json = """
                {
                  "name": "dataset1",
                  "lessons": [
                    {
                      "id": "0",
                      "subject": "Engineering Science",
                      "teacher": "Gary Lam",
                      "studentGroup": "EG1A",
                      "subjectTypes": ["Theory", "Practical"]
                    }
                  ]
                }
                """;
        Timetable timetable = objectMapper.readValue(json, Timetable.class);
        assertThat(timetable.getLessons()).hasSize(1);
        assertThat(timetable.getLessons().get(0).getSubjectTypes()).containsExactly("Theory", "Practical");
    }

    @Test
    void updateLessonValueRanges_includesAssignedTimeslotThatSpansLunch() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(java.time.DayOfWeek.MONDAY));
        List<Room> rooms = List.of(new Room("0", "Room A"));
        Lesson lesson = new Lesson("0", "English", "A. Turing", "9th grade");
        lesson.setDurationInMinutes(60);
        Timeslot monday1230 = timeslots.stream()
                .filter(t -> t.getStartTime().toString().equals("12:30"))
                .findFirst()
                .orElseThrow();
        lesson.setTimeslot(monday1230);
        Timetable timetable = new Timetable("test", timeslots, rooms, List.of(lesson));

        assertThat(monday1230.getMaxConsecutiveMinutesFromStart()).isLessThan(60);
        assertThat(lesson.getValidTimeslotRange()).extracting(Timeslot::getId).contains(monday1230.getId());
    }

    @Test
    void updateLessonValueRanges_restrictsRoomsWhenAllowedRoomIdsPresent() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(java.time.DayOfWeek.MONDAY));
        List<Room> rooms = List.of(
                new Room("0", "Room A"),
                new Room("1", "Room B"),
                new Room("2", "Room C"));
        Lesson lesson = new Lesson("0", "Math", "A. Turing", "9th grade");
        lesson.setAllowedRoomIds(List.of("0", "2"));
        Timetable timetable = new Timetable("test", timeslots, rooms, List.of(lesson));

        assertThat(lesson.getValidRoomRange()).extracting(Room::getId).containsExactly("0", "2");
    }

    @Test
    void updateLessonValueRanges_usesAllRoomsWhenAllowedRoomIdsMissing() {
        List<Timeslot> timeslots = TimeslotGenerator.generate(EnumSet.of(java.time.DayOfWeek.MONDAY));
        List<Room> rooms = List.of(
                new Room("0", "Room A"),
                new Room("1", "Room B"));
        Lesson lesson = new Lesson("0", "Math", "A. Turing", "9th grade");
        Timetable timetable = new Timetable("test", timeslots, rooms, List.of(lesson));

        assertThat(lesson.getValidRoomRange()).extracting(Room::getId).containsExactly("0", "1");
    }

    @Test
    void allowedRoomIds_deserializeFromJson() throws Exception {
        String json = """
                {
                  "name": "CUSTOM",
                  "timeslots": [],
                  "rooms": [{"id": "0", "name": "Room A"}, {"id": "1", "name": "Room B"}],
                  "lessons": [{
                    "id": "0",
                    "subject": "Math",
                    "teacher": "A. Turing",
                    "studentGroup": "9th grade",
                    "durationInMinutes": 60,
                    "allowedRoomIds": ["1"]
                  }]
                }
                """;
        Timetable timetable = objectMapper.readValue(json, Timetable.class);
        assertThat(timetable.getLessons()).hasSize(1);
        assertThat(timetable.getLessons().get(0).getAllowedRoomIds()).containsExactly("1");
    }

    @Test
    void ecaBlocks_deserializeFromJson() throws Exception {
        String json = """
                {
                  "name": "CUSTOM",
                  "timeslots": [],
                  "rooms": [],
                  "lessons": [],
                  "ecaBlocks": [{
                    "label": "ECA",
                    "dayOfWeek": "WEDNESDAY",
                    "period": "PM",
                    "startTime": "13:30:00",
                    "endTime": "17:30:00",
                    "timeslotIds": ["12", "13", "14"]
                  }]
                }
                """;
        Timetable timetable = objectMapper.readValue(json, Timetable.class);
        assertThat(timetable.getEcaBlocks()).hasSize(1);
        assertThat(timetable.getEcaBlocks().get(0).getDayOfWeek()).isEqualTo("WEDNESDAY");
        assertThat(timetable.getEcaBlocks().get(0).getPeriod()).isEqualTo("PM");
        assertThat(timetable.getEcaBlocks().get(0).getTimeslotIds()).containsExactly("12", "13", "14");
    }

}
