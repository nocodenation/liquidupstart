#!/usr/bin/env bash
# Judge every bundle that appears in the inbox, and promote only the sound ones.
#
# NiFi's auto-loader watches nifi.nar.library.autoload.directory and loads what
# it finds there within seconds. The image's own start.sh points that setting at
# ${NIFI_HOME}/nar_extensions on every start, so while the operator's drop
# directory was mounted there, a bundle copied in by hand was loaded unchecked --
# measured 2026-09-28: refused by narcheck, dropped ~35s after start, loaded ~5s
# later. FR30 "judged before it lands" and FR36 "never enters the catalogue" held
# for nar-build alone. Item 11 of the 2026-09-28 review.
#
# The two directories are separate now. The inbox is the bind mount everybody
# writes to; the load directory is inside the container and only this script
# writes to it. A bundle reaches the catalogue by passing the check.
#
# It fails closed: if this script dies, nothing is promoted and nothing loads.
set -u

NIFI_HOME="${NIFI_HOME:-/opt/nifi/nifi-current}"
INBOX_DIR="${NIFI_HOME}/nar_inbox"
LOAD_DIR="${NIFI_HOME}/nar_extensions"
REFUSED_DIR="${INBOX_DIR}/refused"
NAR_CHECK="$(cd "$(dirname "$0")" && pwd)/narcheck.py"
LIB_DIR="${NIFI_HOME}/lib"
INTERVAL="${NAR_WATCH_INTERVAL_SECONDS:-2}"

say() { echo "[nar-watch] $*"; }

# name|size|mtime of everything already judged, so an unchanged file is not
# checked once per interval for the lifetime of the container.
seen=""
# The size seen one interval ago, so a file still being copied in is left alone.
# The builder renames an already-written dot-file into place and is never caught
# mid-write; an operator's `cp` is not atomic, and judging half a file would
# refuse a sound bundle -- the failure this whole check exists to avoid.
sizes=""

stamp() {  # stamp <file>
  printf '%s|%s|%s' "$1" "$(stat -c %s "$1" 2>/dev/null || echo 0)" \
                        "$(stat -c %Y "$1" 2>/dev/null || echo 0)"
}

promote() {  # promote <file>
  base="$(basename "$1")"
  part="${LOAD_DIR}/.${base}.part"
  # Into place under its own name only once it is whole: the auto-loader skips a
  # dot-file ("Skipping non-nar file"), so it cannot read a partial copy.
  if cp "$1" "$part" && mv "$part" "${LOAD_DIR}/${base}"; then
    say "loaded ${base}: it passed the deployment check"
    return 0
  fi
  rm -f "$part"
  say "WARNING: ${base} passed the check and could not be copied into ${LOAD_DIR};"
  say "  it is not loaded. ${LOAD_DIR} is inside the container and is written by"
  say "  this script alone, so this means the container's own filesystem is full"
  say "  or read-only."
  return 1
}

refuse() {  # refuse <file> <reason>
  base="$(basename "$1")"
  say "REFUSED ${base}: it was not loaded."
  printf '%s\n' "$2" | sed 's/^/[nar-watch]   /'
  if mkdir -p "$REFUSED_DIR" && mv "$1" "${REFUSED_DIR}/"; then
    say "  Moved to ${REFUSED_DIR}/: nothing here deletes it."
  else
    say "  WARNING: it could not be moved to ${REFUSED_DIR}. It stays in the inbox,"
    say "  which is not the load path, so it is still not loaded -- but this script"
    say "  will judge it again on every pass. Remove it by hand."
  fi
}

judge() {  # judge <file>
  if REFUSAL="$(python3 "$NAR_CHECK" check "$1" "$LIB_DIR" 2>&1)"; then
    promote "$1"
  else
    refuse "$1" "$REFUSAL"
  fi
}

sweep() {
  next_seen=""
  next_sizes=""
  for nar in "$INBOX_DIR"/*.nar; do
    [ -f "$nar" ] || continue
    base="$(basename "$nar")"
    size="$(stat -c %s "$nar" 2>/dev/null || echo 0)"
    next_sizes="${next_sizes}${base}=${size} "
    st="$(stamp "$nar")"
    case " $seen " in *" $st "*) next_seen="${next_seen}${st} "; continue ;; esac
    # Still growing: wait for a pass where the size did not change.
    case " $sizes " in
      *" ${base}=${size} "*) ;;
      *) continue ;;
    esac
    judge "$nar"
    [ -f "$nar" ] && next_seen="${next_seen}$(stamp "$nar") "
  done
  seen="$next_seen"
  sizes="$next_sizes"
}

say "watching ${INBOX_DIR}; only bundles that pass the check reach ${LOAD_DIR}"
while true; do
  sweep
  sleep "$INTERVAL"
done
