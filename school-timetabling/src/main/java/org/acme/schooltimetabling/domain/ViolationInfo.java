package org.acme.schooltimetabling.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * Describes one constraint violation attached to a lesson for UI display.
 * Not used by Timefold during solving — populated after solve for the demo UI only.
 */
public class ViolationInfo {

    /** Constraint name; matches {@code asConstraint(...)} in TimetableConstraintProvider. */
    private String constraintName;

    /** {@code hard} or {@code soft}. */
    private String scoreLevel;

    /** Human-readable explanation shown in the violation modal. */
    private String message;

    /** Other lesson IDs involved in this violation (empty for single-lesson violations). */
    private List<String> relatedLessonIds = new ArrayList<>();

    public ViolationInfo() {
    }

    public ViolationInfo(String constraintName, String scoreLevel, String message, List<String> relatedLessonIds) {
        this.constraintName = constraintName;
        this.scoreLevel = scoreLevel;
        this.message = message;
        if (relatedLessonIds != null) {
            this.relatedLessonIds = new ArrayList<>(relatedLessonIds);
        }
    }

    public String getConstraintName() {
        return constraintName;
    }

    public void setConstraintName(String constraintName) {
        this.constraintName = constraintName;
    }

    public String getScoreLevel() {
        return scoreLevel;
    }

    public void setScoreLevel(String scoreLevel) {
        this.scoreLevel = scoreLevel;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public List<String> getRelatedLessonIds() {
        return relatedLessonIds;
    }

    public void setRelatedLessonIds(List<String> relatedLessonIds) {
        this.relatedLessonIds = relatedLessonIds != null ? new ArrayList<>(relatedLessonIds) : new ArrayList<>();
    }
}
