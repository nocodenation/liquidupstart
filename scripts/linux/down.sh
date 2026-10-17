#!/usr/bin/env bash
set -euo pipefail

# docker compose resolves compose.yml from the cwd, so run from the project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "Stopping existing containers..."

# --remove-orphans, because the line above says "existing" and a bare
# `docker compose down` does not mean that: it acts on the services the *current*
# compose.yml declares. A container from another branch's stack is not in that
# list, so it survives the teardown and keeps running beside a stack that has no
# such service. Met on 2026-09-08 switching from feature/liquid-java-extensions,
# where `nar_builder` outlived the teardown and had to be removed by hand.
#
# Compose says so itself, on every single invocation afterwards:
#   WARN Found orphan containers (nar_builder) for this project ...
#   you can run this command with the --remove-orphans flag to clean it up
# A warning on every call that nobody acts on is how a project learns to read
# past warnings, which is the one failure mode this repository keeps records
# about.
#
# It was left alone for five weeks because this file was byte-identical on four
# branches and the same repair arriving separately is how one file becomes two
# that differ. Measured 2026-10-17: identical (08fa75a66f) on 17 of 18 branches,
# so one change here reaches all of them by merge -- and scripts/install/update.sh
# already passed the flag, so the two teardown paths had drifted apart anyway.
# A11-11 holds both of them to it.
#
# What it means, stated rather than implied: teardown removes whatever this
# project has running that the current file does not declare. Every stack's state
# is in ./volumes/ on the host, so nothing of the operator's is lost by it, and
# this stack runs one instance per host by design.
docker compose down --remove-orphans
