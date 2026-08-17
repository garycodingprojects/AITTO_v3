package org.acme.schooltimetabling;

import java.io.File;

import org.acme.schooltimetabling.domain.Timetable;
import org.acme.schooltimetabling.rest.TimetableDemoResource;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * One-shot utility test to refresh {@code sample.json} from the current demo data generator.
 */
class SampleJsonExporterTest {

    @Test
    void exportSmallDemoDataToSampleJson() throws Exception {
        TimetableDemoResource resource = new TimetableDemoResource();
        Timetable timetable = (Timetable) resource.generate(TimetableDemoResource.DemoData.dataset1).getEntity();

        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

        File sampleFile = new File("sample.json");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(sampleFile, timetable);
    }
}
