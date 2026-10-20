#!/usr/bin/env bash
# Where the work stands, computed.
#
# Everything here was typed by hand, repeatedly, and then written into
# HANDOFF.md -- where it went stale the moment something merged. On 2026-10-16
# that file said #21 was "never reviewed" while a review of it was being
# answered, and the reviewer asked for the row to be corrected; on 2026-10-17 its
# own current section said nine pull requests were open when twelve were. Two
# copies of one fact, one of which cannot keep up.
#
# So: the handover keeps the map and the lessons, and the state is asked for.
# `CLAUDE.md` puts it plainly -- prefer a computed answer to a rule an agent has
# to remember -- and a count of open pull requests is a fact, not a judgement.
#
# It needs `gh` and refuses without it rather than printing an empty picture:
# "cannot measure" is not "nothing open", which is the same rule the disk guard
# and the image check carry.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

if ! command -v gh >/dev/null 2>&1; then
  echo "state.sh needs the gh CLI to read the pull requests, and it is not on PATH." >&2
  echo "  Install it, or read the state at https://github.com/nocodenation/liquidupstart/pulls" >&2
  echo "  Nothing is printed rather than a picture with the pull requests missing:" >&2
  echo "  \"cannot measure\" is not \"nothing is open\"." >&2
  exit 2
fi

echo "=== main ==="
git fetch -q origin main 2>/dev/null || echo "  (could not fetch; the line below may be behind)"
git log --oneline -1 origin/main

echo
echo "=== open pull requests ==="
# The review state as the forge has it, not as a document remembers it. An empty
# reviewDecision means no review has been submitted, which jq's `//` cannot catch
# because the field is an empty string rather than null.
gh pr list --state open --limit 50 \
  --json number,title,reviewDecision,headRefName,updatedAt \
  --jq '.[] | "#\(.number)\t\(if (.reviewDecision // "") == "" then "first review open" else (.reviewDecision | ascii_downcase | gsub("_"; " ")) end)\t\(.updatedAt[0:10])\t\(.headRefName)"' \
  | sort -t'#' -k2 -n

# Does one branch still merge into another, and say so when it cannot tell.
#
# `git merge-tree` is the authority rather than the forge's `mergeable` field,
# which is computed lazily and answers UNKNOWN for minutes after a push --
# measured repeatedly on 2026-10-16, where every branch read UNKNOWN while this
# answered at once.
#
# Its **exit status** is the answer: 0 clean, 1 conflicts, anything else a failure
# to judge. The first version of this grepped the output inside a pipeline, and
# under `set -o pipefail` that reported every conflicting branch as **clean** --
# merge-tree exits 1 on conflict, pipefail hands the pipeline that 1, and the `if`
# took the else arm. Found on 2026-10-20 by using it: it called #16 clean while
# the forge called it CONFLICTING, which is the one thing a tool written to
# replace a stale narrative must never do. A17-2 holds it now.
#
# A function so a case can put branches through it -- the idiom B6-3 established.
lu_merge_state() {  # lu_merge_state <base-ref> <branch-ref>
  local out rc
  out="$(git merge-tree --write-tree --name-only "$1" "$2" 2>&1)" && rc=0 || rc=$?
  # The status alone is not enough, which the case for this found immediately
  # after the pipefail repair: a ref this host does not have **also** exits 1 --
  # `merge-tree: <ref> - not something we can merge` -- so a missing branch would
  # have been reported as a conflict in a file called nothing. Status first, then
  # the output decides which kind of non-zero it was.
  # `|| true` on the grep, and it is the third repair to this function in two
  # days -- each one shell error semantics meeting another. grep exits 1 when it
  # finds nothing, pipefail hands that to the assignment, and `set -e` then aborts
  # the function **before** it prints "clean": a clean merge produced an empty
  # answer, which the case for this caught at once.
  local named
  named="$(printf '%s\n' "$out" | grep -i '^CONFLICT' | sed 's/.*in //' | tr '\n' ' ' || true)"
  if [ "$rc" -eq 0 ]; then
    printf 'clean\n'
  elif [ -n "${named// /}" ]; then
    printf 'CONFLICT: %s\n' "$named"
  else
    # Not "clean" and not a conflict: say which, and say it loudly.
    printf 'CANNOT TELL (git exited %s): %s\n' "$rc" "$(printf '%s' "$out" | head -n1)"
  fi
}

echo
echo "=== does each open branch still merge into main? ==="
for b in $(gh pr list --state open --limit 50 --json headRefName --jq '.[].headRefName'); do
  git fetch -q origin "$b" 2>/dev/null || true
  printf '  %-42s %s\n' "$b" "$(lu_merge_state "origin/main" "origin/${b}")"
done

echo
echo "=== worktrees ==="
# Named because a branch under review usually has one, and a worktree whose
# branch has merged is litter: the retirement rule is in HANDOFF.md.
git worktree list | awk '{printf "  %-56s %s\n", $1, $3}'
