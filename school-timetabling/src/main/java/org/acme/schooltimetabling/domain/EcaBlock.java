package org.acme.schooltimetabling.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * UI-only metadata for a reserved ECA (Extra-Curricular Activity) half-day block.
 * Not used by the Timefold solver; preserved through REST JSON round trips so Demo UI can render ECA rows.
 */
public class EcaBlock {

    private String label = "ECA";
    private String dayOfWeek;
    /** {@code AM} or {@code PM}. */
    private String period;
    /** Inclusive start of the reserved window (HH:mm:ss). */
    private String startTime;
    /** Exclusive end of the reserved window (HH:mm:ss). */
    private String endTime;
    private List<String> timeslotIds = new ArrayList<>();

    public EcaBlock() {
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getDayOfWeek() {
        return dayOfWeek;
    }

    public void setDayOfWeek(String dayOfWeek) {
        this.dayOfWeek = dayOfWeek;
    }

    public String getPeriod() {
        return period;
    }

    public void setPeriod(String period) {
        this.period = period;
    }

    public String getStartTime() {
        return startTime;
    }

    public void setStartTime(String startTime) {
        this.startTime = startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public void setEndTime(String endTime) {
        this.endTime = endTime;
    }

    public List<String> getTimeslotIds() {
        return timeslotIds;
    }

    public void setTimeslotIds(List<String> timeslotIds) {
        this.timeslotIds = timeslotIds == null ? new ArrayList<>() : timeslotIds;
    }
}
