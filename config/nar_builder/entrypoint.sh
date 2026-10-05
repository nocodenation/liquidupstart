#!/bin/sh
set -eu

mkdir -p /m2 /deploy/nar_extensions /repos
chmod 700 /deploy

exec java /opt/builder/BuildServer.java
