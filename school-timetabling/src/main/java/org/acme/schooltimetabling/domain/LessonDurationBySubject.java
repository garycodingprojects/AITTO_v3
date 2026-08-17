package org.acme.schooltimetabling.domain;

import java.util.Map;

/**
 * Maps demo lesson subjects to fixed durations (1, 2, 2.5, or 3 hours).
 */
public final class LessonDurationBySubject {

    private static final Map<String, Integer> DURATION_BY_SUBJECT = Map.ofEntries(
            Map.entry("Math", 60),
            Map.entry("Physics", 60),
            Map.entry("Chemistry", 60),
            Map.entry("Biology", 60),
            Map.entry("History", 60),
            Map.entry("English", 60),
            Map.entry("Spanish", 60),
            Map.entry("French", 60),
            Map.entry("Geography", 60),
            Map.entry("Geology", 60),
            Map.entry("ICT", 120),
            Map.entry("Art", 120),
            Map.entry("Drama", 150),
            Map.entry("Physical education", 180));

    private LessonDurationBySubject() {
    }

    /** Returns duration in minutes for a subject; defaults to 60 minutes when unknown. */
    public static int durationMinutesForSubject(String subject) {
        return DURATION_BY_SUBJECT.getOrDefault(subject, Lesson.DEFAULT_DURATION_MINUTES);
    }
}
