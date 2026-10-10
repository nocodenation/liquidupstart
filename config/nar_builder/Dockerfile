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
# **There is no shared /m2 any more, which was the other half of this.** It used
# to be a host bind mounted read-write, and build-time code could plant an
# artifact there that every later build resolved -- the last of B1's four legs.
# Each build now resolves into its own local repository, created for it and
# discarded with it, and reads a root-owned seed below. So the question of who
# owns the cache does not arise: nothing is shared between two builds.
RUN useradd -r -u 1500 -m -d /home/builder builder

# `/liquid/api` is here although this container only ever reads it, and the uid is
# written as a number on purpose.
#
# Since 2026-10-09 that path is a volume shared with `liquid` rather than a host
# bind, and docker gives a fresh named volume the ownership of the image path it is
# **first** mounted on. Neither service declares a `depends_on` that would fix the
# order, so if this container were created first the volume would be root-owned and
# Liquid -- uid 1000 -- could not write the load index into it. Both images
# therefore name the directory with the same owner, and the order stops mattering.
# 1000 is nifi's uid in the Liquid image; B6-33 reads both images and asserts they
# agree, rather than trusting this comment.
RUN mkdir -p /opt/builder /repos /deploy/nar_extensions /liquid/logs /liquid/api \
    && chmod 700 /deploy \
    && chown 1000:1000 /liquid/api

COPY build.sh /opt/builder/build.sh
COPY BuildServer.java /opt/builder/BuildServer.java
COPY lifecycle-pins.xml /opt/builder/lifecycle-pins.xml
COPY settings.xml /opt/builder/settings.xml
COPY seed.sh /opt/builder/seed.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /opt/builder/build.sh /opt/builder/seed.sh /entrypoint.sh

# The seed: the closure of the project `build.sh` synthesises, resolved once here
# so an ordinary build copies out of the image instead of out of the internet.
#
# The versions are arguments with defaults rather than a key in `.env.example`,
# because a stale seed costs time and never correctness -- `build.sh` still reads
# the running Liquid's version for the pom it generates, and a dependency the
# seed lacks is fetched. It writes `${SEED}.record` so `build.sh` can say in one
# line that the seed holds a different version, instead of re-fetching silently.
#
# Root-owned and mode 755: readable by `builder`, writable by nobody but root.
# Measured 2026-10-10 -- after a build the seed's jar count and mtime are
# unchanged and `touch` by the build user is refused.
# One version, not two. The nifi-api version is resolved by the step itself,
# because NiFi versions it separately -- 2.11.0 ships nifi-api 2.10.0 -- and an
# argument for it is an argument that can disagree with reality. It did: the
# first end-to-end run reported `downloads 438, from_seed 329`.
ARG SEED_NIFI_VERSION=2.11.0
ARG SEED_NAR_PLUGIN_VERSION=2.4.0
RUN /opt/builder/seed.sh \
      "$SEED_NIFI_VERSION" "$SEED_NAR_PLUGIN_VERSION" /opt/builder/m2-seed \
    && chmod -R a+rX /opt/builder/m2-seed /opt/builder/m2-seed.record

WORKDIR /opt/builder

ENTRYPOINT ["/entrypoint.sh"]
