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
# and the image check carry. The same holds for a forge that does not answer, a
# branch that cannot be fetched, and a git too old to judge a merge.
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

# Does one branch still merge into another, and say so when it cannot tell.
#
# `git merge-tree` is the authority rather than the forge's `mergeable` field,
# which is computed lazily and answers UNKNOWN for minutes after a push --
# measured repeatedly on 2026-10-16, where every branch read UNKNOWN while this
# answered at once.
#
# Its **exit status** says whether: 0 clean, 1 conflicts, anything else a
# failure to judge. A ref this host does not have **also** exits 1, so the
# status alone would report a missing branch as a conflict; the first line
# settles it, because only a merge that ran prints a tree id there.
#
# The conflicted paths are read from the list `--name-only` prints between the
# tree id and the first blank line, never from the CONFLICT messages after it.
# Those are translated -- `KONFLIKT (Inhalt)` under de_DE, measured 2026-10-20 --
# and worded differently per kind, so the earlier
# `grep '^CONFLICT' | sed 's/.*in //'` reported every conflict on a German-locale
# machine as CANNOT TELL, and a modify/delete as a conflict in a file called
# `tree.`.
#
# A function so a case can put branches through it -- the idiom B6-3 established.
lu_merge_state() {  # lu_merge_state <base-ref> <branch-ref>
  local out rc first named
  local oid='^[0-9a-f]{40}([0-9a-f]{24})?$'
  out="$(git merge-tree --write-tree --name-only "$1" "$2" 2>&1)" && rc=0 || rc=$?
  first="${out%%$'\n'*}"
  named="$(printf '%s\n' "$out" | awk 'NR == 1 { next } /^$/ { exit } { printf "%s ", $0 }')"
  if [ "$rc" -eq 0 ]; then
    printf 'clean\n'
  elif [ "$rc" -eq 1 ] && [[ "$first" =~ $oid ]]; then
    printf 'CONFLICT: %s\n' "${named% }"
  else
    # Not "clean" and not a conflict: say which, and say it loudly.
    printf 'CANNOT TELL (git exited %s): %s\n' "$rc" "$first"
  fi
}

echo "=== main ==="
git fetch -q origin main 2>/dev/null || echo "  (could not fetch; the line below may be behind)"
git log --oneline -1 origin/main

# One question to the forge, and its status is checked: the table and the merge
# walk are both read from this answer. The walk used to ask again in
# `for b in $(gh ...)`, whose status not even `set -e` sees, so a rate limit or
# an expired token printed the merge heading over nothing -- which reads as
# "nothing to check".
#
# An empty reviewDecision means no decision, not no review: a review that only
# comments never sets it (measured 2026-10-20 on cli/cli and oven-sh/bun, where
# such pull requests still read REVIEW_REQUIRED). And `//` cannot catch the
# empty string, because the field is "" rather than null.
LIMIT=100
if ! prs="$(gh pr list --state open --limit "${LIMIT}" \
    --json number,author,reviewDecision,reviews,headRefName,baseRefName,updatedAt \
    --jq '.[] | ["#\(.number)",
                 (if (.reviewDecision // "") != "" then (.reviewDecision | ascii_downcase | gsub("_"; " "))
                  elif ((.reviews // []) | length) > 0 then "reviewed, no decision"
                  else "first review open" end),
                 .updatedAt[0:10], (.author.login // "unknown"), .headRefName, .baseRefName] | join("\t")')"; then
  echo "state.sh could not read the open pull requests from the forge (gh's own message is above)." >&2
  echo "  \"cannot measure\" is not \"nothing is open\"." >&2
  exit 3
fi

echo
echo "=== open pull requests ==="
if [ -z "${prs}" ]; then
  echo "  none"
else
  printf '%s\n' "${prs}" | cut -f1-5 | sort -t'#' -k2 -n
fi
if [ "$(printf '%s\n' "${prs}" | grep -c . || true)" -ge "${LIMIT}" ]; then
  echo "  (the forge was asked for at most ${LIMIT}; there may be more)"
fi

echo
echo "=== does each open branch still merge into its base? ==="
# Into its own base, which for a stacked pull request is not main: #17 targets
# feature/mutation-registry, and an answer about main does not apply to it.
probe="$(lu_merge_state origin/main origin/main)"
if [ "${probe}" != "clean" ]; then
  # merge-tree learned --write-tree in git 2.38. Ubuntu 22.04 ships 2.34.1, which
  # answers `fatal: unknown rev --write-tree` with 128 -- measured 2026-10-20 --
  # and would otherwise put that line under every branch.
  printf '  CANNOT TELL for any branch: git merge-tree --write-tree does not work here (%s).\n' "${probe}"
  printf '  It needs git 2.38 or newer, and this is %s.\n' "$(git --version)"
elif [ -n "${prs}" ]; then
  while IFS=$'\t' read -r _ _ _ _ head base; do
    # A branch that cannot be fetched would be judged on whatever ref is lying
    # here, which may be days old, so it is not judged at all.
    if ! git fetch -q origin "${head}" 2>/dev/null; then
      printf '  %-42s %s\n' "${head}" "CANNOT TELL: could not fetch it, and what is here may be stale"
      continue
    fi
    if [ "${base}" != "main" ] && ! git fetch -q origin "${base}" 2>/dev/null; then
      printf '  %-42s %s\n' "${head}" "CANNOT TELL: could not fetch its base ${base}"
      continue
    fi
    into=""
    [ "${base}" = "main" ] || into="  (into ${base})"
    printf '  %-42s %s%s\n' "${head}" "$(lu_merge_state "origin/${base}" "origin/${head}")" "${into}"
  done <<< "${prs}"
fi

echo
echo "=== worktrees ==="
# Named because a branch under review usually has one, and a worktree whose
# branch has merged is litter: the retirement rule is in HANDOFF.md.
git worktree list | awk '{printf "  %-56s %s\n", $1, $3}'
