# Build the Quarkus timetable backend (Timefold solver + web UI).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

# Runtime image with curl for container health checks.
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/target/quarkus-app/ ./
EXPOSE 8080
USER 1000
CMD ["java", "-jar", "quarkus-run.jar"]
