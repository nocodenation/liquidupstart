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

# judge <file> -- 0 when the bundle was loaded, 1 when it was refused, 2 when it
# may still be arriving and should be looked at again.
#
# **The copy is judged, not the original.** The inbox is writable by the agents
# (compose.yml:339, 817, 926) and by the builder, and this used to judge the file
# at its inbox path and then copy it by that same path -- so the bytes that were
# judged and the bytes that loaded were two reads of a file somebody else can
# replace in between. SKILL.md section 6.4 and FR30 say everything in the inbox is
# judged before anything is loaded; that was true of a read, not of the file.
# S6 of the 2026-10-01 review. Copying first closes it: what is judged is the copy
# under the dot-name, and what is renamed into place is that same copy.
#
# `promote` collapsed into this, because the copy now happens before the check
# rather than after it, and a separate function would have had nothing left to do
# but the rename.
judge() {  # judge <file>
  base="$(basename "$1")"
  part="${LOAD_DIR}/.${base}.part"
  # The auto-loader skips a dot-file ("Skipping non-nar file"), so a partial copy
  # cannot be read even while it sits in the load directory.
  if ! cp "$1" "$part" 2>/dev/null; then
    rm -f "$part"
    say "WARNING: ${base} could not be copied into ${LOAD_DIR}; it is not loaded."
    say "  ${LOAD_DIR} is inside the container and is written by this script"
    say "  alone, so this means the container's own filesystem is full or"
    say "  read-only."
    return 1
  fi
  if REFUSAL="$(python3 "$NAR_CHECK" check "$part" "$LIB_DIR" 2>&1)"; then
    if mv "$part" "${LOAD_DIR}/${base}"; then
      say "loaded ${base}: it passed the deployment check"
      return 0
    fi
    rm -f "$part"
    say "WARNING: ${base} passed the check and could not be copied into ${LOAD_DIR};"
    say "  it is not loaded. ${LOAD_DIR} is inside the container and is written by"
    say "  this script alone, so this means the container's own filesystem is full"
    say "  or read-only."
    return 1
  fi
  rm -f "$part"
  # narcheck names the file it was handed, which is the dot-copy. The operator
  # reads the name they dropped. This substitution runs before the case below, and
  # must not touch the sentence that case keys on -- it replaces a path, and the
  # sentence holds none.
  REFUSAL="$(printf '%s\n' "$REFUSAL" | sed "s|${part}|${1}|g")"
  case "$REFUSAL" in
    *"could not be opened as an archive"*)
      say "${base} cannot be opened as an archive, so it was not judged and is not"
      say "  loaded. It stays in the inbox, which is not the load path. If it is"
      say "  still being copied in, it is judged again as soon as it changes; if it"
      say "  is corrupt, replace it or remove it."
      return 1
      ;;
  esac
  refuse "$1" "$REFUSAL"
  return 1
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
    judge "$nar" || true
    # The stamp taken *before* the judgement, not after. A file swapped between
    # the copy and this line would otherwise be recorded as judged under its new
    # bytes and never looked at again -- which is the hole S6 is about, moved one
    # line down. With the pre-judge stamp, a swap no longer matches `seen` and
    # the new contents are judged on the next pass. Nothing is recorded for a
    # bundle still in the inbox, which an unreadable archive is: one line in the
    # log, and it is judged again when it changes.
    if [ -f "$nar" ]; then
      next_seen="${next_seen}${st} "
    fi
  done
  seen="$next_seen"
  sizes="$next_sizes"
}

say "watching ${INBOX_DIR}; only bundles that pass the check reach ${LOAD_DIR}"
while true; do
  sweep
  sleep "$INTERVAL"
done
