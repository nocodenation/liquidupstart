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
# This runs as root, which the entrypoint already is. `/deploy` stays root-only
# above, so handing `/m2` over does not widen what the build user can reach
# beyond the cache it has to write.
#
# **Recursive, which the first form of this was not.** The leaf-only `chown`
# left anything already inside the cache root-owned, and a cache filled before
# Maven moved to the build user is exactly that: `FEATURE-liquid-java-extensions.md`
# records 85 MB of it on the author's machine. Reproduced in the builder image --
# after the leaf-only chown, `/m2` was `builder:root` while `/m2/org` stayed
# `0:0`, and the build user was denied writing through it; the reviewer got
# `AccessDeniedException: /m2/org/apache/maven` and `BUILD FAILURE` from a real
# Maven. N7 of the 2026-10-14 re-review.
#
# `-h` and coreutils' default `-P` together mean symlinks are neither followed
# nor chowned through, so a link the build user planted in the cache cannot aim
# this at anything outside it. The mount point itself the build user cannot
# replace.
# **On this branch there is no `/m2` mount, and this stays anyway.** The seeded
# per-build repository removes the shared cache: `compose.yml` mounts nothing at
# `/m2`, `repo_for` copies the seed into the build own work directory, and the
# lines above therefore act on an empty directory inside the container. They are
# kept rather than deleted for two reasons. `B6-36` and `B6-38` on #10 drive this
# file against a root-owned `/m2` they create themselves, so deleting the handling
# would redden two signed cases that are not this branch to retire; and until #10
# and this branch have both landed, the file has to be correct for the arrangement
# #10 ships.
#
# What that means for N7 of the 2026-10-14 re-review is worth stating here rather
# than leaving to the BACKLOG entry: its second consequence -- on rootless Docker
# the host user cannot delete `volumes/nar_builder/m2` after a build -- is closed
# by this branch through deletion, because there is no such directory any more.
# The first consequence, a pre-populated cache staying root-owned, is fixed on #10
# by the recursive chown above and is inert here.
chown -R -h "${NAR_BUILDER_BUILD_USER:-builder}" /m2

exec java /opt/builder/BuildServer.java
