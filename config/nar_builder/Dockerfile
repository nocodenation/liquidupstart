FROM maven:3.9-eclipse-temurin-21

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/builder /repos /nar_extensions /m2 /liquid/logs

COPY build.sh /opt/builder/build.sh
COPY BuildServer.java /opt/builder/BuildServer.java
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/builder/build.sh /entrypoint.sh

WORKDIR /opt/builder

ENTRYPOINT ["/entrypoint.sh"]
