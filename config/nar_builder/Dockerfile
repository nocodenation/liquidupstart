FROM maven:3.9-eclipse-temurin-21

# python3 for narcheck.py, which decides whether a built NAR may be deployed.
# The checker itself is mounted rather than copied: it belongs to Liquid, runs in
# the liquid container too, and a second copy in this image would be a second
# thing to keep in step.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl python3 \
    && rm -rf /var/lib/apt/lists/*

# Maven runs as this user, not as root. Build-time code is the author's: a pom,
# a plugin or a dependency can run anything it likes during `package`, and as
# root that reached every clone under /repos, the shared cache in /m2 and
# /opt/builder/build.sh -- the script that holds the narcheck gate, which stayed
# rewritten until the container was recreated. B1 of the 2026-10-01 review.
#
# `build.sh` itself still runs as root: it has to read /repos, write the drop
# directory and run the check. Only the Maven call is dropped to this user, so
# what the author's code can reach is what this user can reach. Measured in the
# image: /opt/builder and /nar_extensions are root-owned and mode 755, so they
# are already closed to it; /repos is mounted read-only in compose.yml.
RUN useradd -r -u 1500 -m -d /home/builder builder

RUN mkdir -p /opt/builder /repos /nar_extensions /m2 /liquid/logs

COPY build.sh /opt/builder/build.sh
COPY BuildServer.java /opt/builder/BuildServer.java
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/builder/build.sh /entrypoint.sh

WORKDIR /opt/builder

ENTRYPOINT ["/entrypoint.sh"]
