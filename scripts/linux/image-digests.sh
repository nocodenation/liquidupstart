#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

# Seven of the images this stack pulls hang on tags that can move, and one of
# them moved under us on 2026-09-05 and again on 2026-09-07. Recording what every
# tag resolves to lets a later difference be attributed: this repository, or an
# upstream move. Digests come from the registry rather than from local images, so
# a base image BuildKit pulled without ever tagging it locally is covered too.
#
# The script owns the file naming on purpose. An earlier version took an output
# path, and the procedure that called it told the operator to substitute "<this
# run>" into a command -- which they pasted literally, because that is what a
# copy-paste block invites. Nothing here has to be filled in.

OUT_DIR="${LU_DIGEST_DIR:-${PROJECT_DIR}/../liquidupstart-backups}"
STAMP_FILE="${OUT_DIR}/.digest-run"

usage() {
  cat >&2 <<'USAGE'
Usage: image-digests.sh before   snapshot now, and diff against the previous run
       image-digests.sh after    snapshot now, and diff against this run's "before"
       image-digests.sh show     print a snapshot to stdout, write nothing

Files land in ../liquidupstart-backups (override with LU_DIGEST_DIR).
USAGE
}

# A failed lookup must never be mistaken for a changed digest. Docker Hub
# rate-limits anonymous manifest requests (HTTP 429), and on 2026-09-07 a run
# that had queried it a few times too often came back with every Hub image
# "(lookup failed)" -- which, diffed against a good snapshot, reads as though
# every tag in the stack had moved at once. A check that cries wolf is worse
# than no check, so failures are counted and the verdict is withheld.
FAILED=0
digest() {
  local out
  if out="$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null)" && [[ -n "$out" ]]; then
    printf '%s' "$out"
  else
    FAILED=$((FAILED + 1))
    printf '(lookup failed)'
  fi
}

emit() {
  echo "# Registry digests, $(date -u +%Y-%m-%dT%H:%M:%SZ), branch $(git branch --show-current 2>/dev/null || echo '?')"

  echo "# Service images (compose.yml)"
  docker compose config --format json | jq -r '.services[].image' | sort -u | grep -v '^liquidupstart/' \
    | while read -r img; do printf '%s\t%s\n' "$img" "$(digest "$img")"; done

  echo "# Base images of the locally built ones"
  for f in config/*/Dockerfile config/*/templates/Dockerfile; do
    [ -f "$f" ] || continue
    b="$(grep -m1 '^FROM ' "$f" | awk '{print $2}')"
    [ -n "$b" ] && printf '%s\t%s\t%s\n' "$f" "$b" "$(digest "$b")"
  done

  # The pin, its predecessor and the floating tag side by side. Keeping all three
  # in one file is what turned "latest is presumably 2026.9.1" into a comparison
  # of two digests -- and what later showed :latest rebuilt without a version
  # change, same commit, different bits.
  echo "# OpenClaw tags side by side"
  for t in 2026.7.1 2026.9.1 latest; do
    printf 'ghcr.io/openclaw/openclaw:%s\t%s\n' "$t" "$(digest "ghcr.io/openclaw/openclaw:$t")"
  done
}

# An image whose digest could not be read on *either* side is dropped from
# *both*, matched on everything but the digest column. Excluding only the failed
# line leaves its counterpart in the other file, and the diff then shows it as a
# deletion -- which reads as "this image vanished" and is exactly the false alarm
# this guard exists to prevent. Found by running it: the warning was already
# right while the diff above it was still lying.
compare() {  # compare <older> <newer> <what-a-difference-means>
  local badfile skipped_a skipped_b
  # Through a file, not through `awk -v`: the keys are multi-line and -v cannot
  # carry a newline. The first run of this guard died on "awk: newline in string".
  badfile="$(mktemp)"
  # awk, not sed: BSD sed does not read \t as a tab, so `sed 's/\t[^\t]*$//'`
  # silently changed nothing and every key failed to match. awk's regex does.
  cat "$1" "$2" | awk -F'\t' '/\(lookup failed\)/ { k = $0; sub(/\t[^\t]*$/, "", k); print k }' > "$badfile" || true
  skipped_a="$(grep -c '(lookup failed)' "$1" || true)"
  skipped_b="$(grep -c '(lookup failed)' "$2" || true)"

  usable() {  # strip comments, drop every line whose key is unreadable anywhere
    awk -F'\t' '
      NR == FNR { drop[$0] = 1; next }
      /^#/ { next }
      { key = $0; sub(/\t[^\t]*$/, "", key); if (!(key in drop)) print }
    ' "$badfile" "$1" | sort
  }

  echo
  echo "--- $(basename "$1")  vs  $(basename "$2")"
  if diff <(usable "$1") <(usable "$2"); then
    # The verdict has to match what was actually compared. "nothing moved" while
    # fifteen of twenty-four images were excluded is a claim the data does not
    # carry, and a reader who skims stops at the first line.
    if (( skipped_a > 0 || skipped_b > 0 )); then
      echo "no difference among the images that could be read — see INCOMPLETE below"
    else
      echo "no difference — nothing moved"
    fi
  else
    echo
    echo "$3"
  fi
  rm -f "$badfile"
  # The advice has to match which side is incomplete. Telling the operator to
  # "wait, or authenticate" when only the historical snapshot has gaps is telling
  # them to fix something that already happened.
  if (( skipped_a > 0 || skipped_b > 0 )); then
    echo
    echo "INCOMPLETE: ${skipped_a} image(s) unreadable in the older snapshot, ${skipped_b} in the newer."
    echo "  Those images were excluded from both sides rather than compared, so nothing above is"
    echo "  about them."
    if (( skipped_b > 0 )); then
      echo "  Docker Hub allows 100 manifest requests per hour per public IP when nobody is signed"
      echo "  in, and answers 429 after that. Wait, or run 'docker login', then take another."
    else
      echo "  The gaps are in the older snapshot and cannot be filled retroactively. This one is"
      echo "  complete; nothing to do."
    fi
  fi
}

case "${1:-}" in
  show) emit; exit 0 ;;
  before)
    mkdir -p "$OUT_DIR"
    STAMP="$(date +%Y%m%d-%H%M%S)"
    OUT="${OUT_DIR}/digests-${STAMP}-before.txt"
    # The previous run's "before", if there is one, chosen before this one exists.
    PREV="$(ls -1 "${OUT_DIR}"/digests-*-before.txt 2>/dev/null | tail -1 || true)"
    emit > "$OUT"
    F="$(grep -c '(lookup failed)' "$OUT" || true)"
    # `(( F > 0 )) && echo` would abort under set -e when F is zero.
    if (( F > 0 )); then
      # Renamed out of the digests-*-before.txt pattern so it can never be picked
      # as the next run's reference. A rate-limited snapshot that becomes the
      # baseline poisons every comparison after it.
      mv "$OUT" "${OUT%-before.txt}-incomplete.txt"
      OUT="${OUT%-before.txt}-incomplete.txt"
      echo "wrote $OUT"
      echo "WARNING: ${F} image(s) could not be read. Kept as -incomplete so it cannot"
      echo "  become the reference for a later run; take another snapshot once the"
      echo "  registry answers again."
    else
      printf '%s' "$STAMP" > "$STAMP_FILE"
      echo "wrote $OUT"
    fi
    if [[ -n "$PREV" ]]; then
      compare "$PREV" "$OUT" \
        "A difference on a FROM line is expected when the pin was changed deliberately.
Any other difference is an upstream move — understand it before building on top of it."
    else
      echo "no earlier snapshot to compare against; this one becomes the reference"
    fi
    ;;
  after)
    [[ -f "$STAMP_FILE" ]] || { echo "no run in progress: run 'image-digests.sh before' first" >&2; exit 2; }
    STAMP="$(cat "$STAMP_FILE")"
    BEFORE="${OUT_DIR}/digests-${STAMP}-before.txt"
    [[ -f "$BEFORE" ]] || { echo "missing $BEFORE" >&2; exit 2; }
    OUT="${OUT_DIR}/digests-${STAMP}-after.txt"
    emit > "$OUT"
    echo "wrote $OUT"
    compare "$BEFORE" "$OUT" \
      "A tag moved while the run was in progress. Rare, and worth recording in the result."
    ;;
  *) usage; exit 2 ;;
esac
