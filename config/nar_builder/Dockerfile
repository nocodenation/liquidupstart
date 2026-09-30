FROM maven:3.9-eclipse-temurin-21

# python3 for narcheck.py, which decides whether a built NAR may be deployed.
# The checker itself is mounted rather than copied: it belongs to Liquid, runs in
# the liquid container too, and a second copy in this image would be a second
# thing to keep in step.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl python3 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/builder /repos /nar_extensions /m2 /liquid/logs

COPY build.sh /opt/builder/build.sh
COPY BuildServer.java /opt/builder/BuildServer.java
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/builder/build.sh /entrypoint.sh

WORKDIR /opt/builder

ENTRYPOINT ["/entrypoint.sh"]
