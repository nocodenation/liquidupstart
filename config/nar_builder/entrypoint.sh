#!/bin/sh
set -eu

mkdir -p /m2 /nar_extensions /repos

exec java /opt/builder/BuildServer.java
