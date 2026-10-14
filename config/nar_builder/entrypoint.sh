#!/bin/sh
set -eu

mkdir -p /m2 /deploy/nar_extensions /repos
chmod 700 /deploy

# **The shared cache has to be handed to the build user here, not in the image.**
#
# The Dockerfile's `chown builder /m2` applies to the image layer, and the compose
# bind mount shadows it. Under rootless Docker the host directory
# `./volumes/nar_builder/m2` belongs to the host user, which maps to container
# **root**, so the mount comes up `root:root` mode 775 -- and the build user
# (uid 1500) is neither root nor in group 0. Maven then dies before compiling:
#
#   [ERROR] java.nio.file.AccessDeniedException: /m2/org
#   [INFO] BUILD FAILURE
#
# C2 of the 2026-10-13 re-review, and it is the answer to the question the
# 2026-10-08 reply ended on -- *"whether an unprivileged Maven can write the
# bind-mounted /m2 on rootless Docker. You run rootless; I do not."* It cannot.
#
# **Nothing in the suite could see it**, because inside the image with no bind `/m2`
# is already builder-owned, and a throwaway container is how almost every case
# builds. That gap is the author's own open item #5 -- no automated case runs a real
# Maven as the build user -- and B6-35 now closes it against a root-owned mount.
#
# This runs as root, which the entrypoint already is, and it is the leaf only:
# `/deploy` stays root-only above, so handing `/m2` over does not widen what the
# build user can reach beyond the cache it has to write.
chown "${NAR_BUILDER_BUILD_USER:-builder}" /m2

exec java /opt/builder/BuildServer.java
