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
# image: /opt/builder is root-owned and mode 755, so it is already closed to it,
# and /repos is mounted read-only in compose.yml.
#
# **The drop directory needed more than its own mode.** The first version of this
# relied on /nar_extensions being root-owned and 755 in the image -- which it is,
# until compose mounts the host directory over it, and
# `config/scripts/start/liquid.sh:85` makes that one `chmod 777` because Liquid
# runs as nifi and rootless Docker leaves the bind mount owned by container root
# (blocker 4 of the 2026-09-28 review). Measured against a 777 mount, the build
# user wrote a bundle into the load path and deleted the quarantine directory --
# so a bundle could reach NiFi's autoloader without ever passing narcheck, which
# is blocker 6 of that same review.
#
# Traversal is decided by the parent, and the parent is in this image rather than
# on the host. So the mount target moved under a root-only directory: the leaf
# keeps whatever mode the host gives it, and the build user cannot reach it at
# all. Measured: `builder` cannot write it and cannot even list it; root can.
#
# **And /m2 belongs to that user, which is the other half.** Maven writes its
# dependency cache there, and the directory this image creates is root-owned: as
# `builder` Maven died with `java.nio.file.AccessDeniedException: /m2/org`. On a
# running stack it is a bind mount the host owns and Docker Desktop hands over,
# so the installation worked and every throwaway container did not -- and a
# throwaway container is how most of the suite builds. Measured in the image
# before this line: `touch /m2/probe` as builder, `Permission denied`.
RUN useradd -r -u 1500 -m -d /home/builder builder

RUN mkdir -p /opt/builder /repos /deploy/nar_extensions /m2 /liquid/logs \
    && chmod 700 /deploy \
    && chown builder /m2

COPY build.sh /opt/builder/build.sh
COPY BuildServer.java /opt/builder/BuildServer.java
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/builder/build.sh /entrypoint.sh

WORKDIR /opt/builder

ENTRYPOINT ["/entrypoint.sh"]
