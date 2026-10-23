#!/usr/bin/env bash
# Where the work stands, computed: main's head, the open pull requests with the
# forge's own review state, whether each still merges into its base, and the
# worktrees. A count of open pull requests is a fact, so it is asked for rather
# than written into HANDOFF.md, where it went stale.
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
# which is computed lazily and answers UNKNOWN for minutes after a push.
#
# Its **exit status** says whether: 0 clean, 1 conflicts, anything else a
# failure to judge. A ref this host does not have **also** exits 1, so the
# status alone would report a missing branch as a conflict; the first line
# settles it, because only a merge that ran prints a tree id there.
#
# The conflicted paths are read from the list `--name-only` prints between the
# tree id and the first blank line, never from the CONFLICT messages after it,
# which are translated and worded differently per kind of conflict.
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
# walk are both read from this answer.
#
# An empty reviewDecision means no decision, not no review: a review that only
# comments never sets it. And `//` cannot catch the empty string, because the
# field is "" rather than null.
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
echo "=== does each open branch, alone, merge textually into its base's current head? ==="
probe="$(lu_merge_state origin/main origin/main)"
if [ "${probe}" != "clean" ]; then
  # merge-tree learned --write-tree in git 2.38. Ubuntu 22.04 ships 2.34.1, which
  # answers `fatal: unknown rev --write-tree` with 128, and would otherwise put
  # that line under every branch.
  printf '  CANNOT TELL for any branch: git merge-tree --write-tree does not work here (%s).\n' "${probe}"
  printf '  It needs git 2.38 or newer, and this is %s.\n' "$(git --version)"
elif [ -n "${prs}" ]; then
  # Each head by its pull request's number and each base every time, into refs
  # this script owns: a fetch by name writes only FETCH_HEAD where the refspec
  # does not cover the branch, and a fork's branch is not origin's at all, so
  # `origin/<name>` can be another commit than the one asked about. A stacked
  # pull request is judged into its own base, which is not main.
  trap 'git for-each-ref --format="delete %(refname)" refs/lu-state/ | git update-ref --stdin' EXIT
  while IFS=$'\t' read -r num _ _ _ head base; do
    n="${num#\#}"
    if ! git fetch -q origin "+refs/pull/${n}/head:refs/lu-state/head/${n}" 2>/dev/null; then
      printf '  %-6s %-42s %s\n' "${num}" "${head}" "CANNOT TELL: could not fetch it"
      continue
    fi
    if ! git fetch -q origin "+refs/heads/${base}:refs/lu-state/base/${n}" 2>/dev/null; then
      printf '  %-6s %-42s %s\n' "${num}" "${head}" "CANNOT TELL: could not fetch its base ${base}"
      continue
    fi
    into=""
    [ "${base}" = "main" ] || into="  (into ${base})"
    printf '  %-6s %-42s %s%s\n' "${num}" "${head}" "$(lu_merge_state "refs/lu-state/base/${n}" "refs/lu-state/head/${n}")" "${into}"
  done <<< "$(printf '%s\n' "${prs}" | sort -t'#' -k2 -n)"
  echo "  (git merge-tree only: no tests run on the result, and the branches are not merged with each other)"
fi

echo
echo "=== worktrees ==="
# Named because a branch under review usually has one, and a worktree whose
# branch has merged is litter: the retirement rule is in HANDOFF.md.
git worktree list | awk '{printf "  %-56s %s\n", $1, $3}'
