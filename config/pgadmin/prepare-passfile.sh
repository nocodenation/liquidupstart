#!/bin/sh
set -eu

# pgAdmin reads a server's password from storage/<email with @ replaced by _>,
# a path only writable from inside the container, so place the file here and
# then hand over to the image's own entrypoint.
if [ -n "${PGADMIN_DEFAULT_EMAIL:-}" ] && [ -f /pgadmin4/pgpass ]; then
  dir="/var/lib/pgadmin/storage/$(printf '%s' "$PGADMIN_DEFAULT_EMAIL" | tr '@' '_')"
  mkdir -p "$dir"
  cp /pgadmin4/pgpass "$dir/passfile"
  chmod 600 "$dir/passfile"
  echo "pgadmin: passfile installed at $dir/passfile"
else
  echo "pgadmin: PGADMIN_DEFAULT_EMAIL or /pgadmin4/pgpass missing - skipping passfile setup" >&2
fi

exec /entrypoint.sh "$@"
