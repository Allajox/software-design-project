#Backend SIVCR (Spring Boot + Java 21)

#Etapa 1: compilar con Maven
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

#carpeta del proyecto Maven (la que contiene pom.xml), relativa al contexto de build.
#Su valor se define en docker-compose.yml (build.args).
ARG PROYECTO

COPY ${PROYECTO}/pom.xml .
COPY ${PROYECTO}/src ./src

#el cache de ~/.m2 evita volver a descargar dependencias en cada build
#se omiten los tests porque Testcontainers necesita Docker y no está disponible dentro del build
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -DskipTests clean package

#Etapa 2: imagen final, solo JRE
FROM eclipse-temurin:21-jre

WORKDIR /app

#ejecutar sin privilegios de root
RUN groupadd --system app && useradd --system --gid app app

COPY --from=build /app/target/*.jar app.jar

USER app

#que la JVM use hasta el 75% de la memoria del contenedor (por defecto usa solo 25%)
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]