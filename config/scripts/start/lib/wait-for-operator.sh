#!/usr/bin/env bash
# One implementation of "the start waits for the operator": announce it, poll for
# the thing that ends the wait, let the operator skip it, and stop at a deadline.
#
# Sourced by config/scripts/start/{git,openclaw}.sh. Before this existed each
# wait carried its own copy of the deadline -- the literal 900, four times in
# openclaw.sh -- and none of them could be skipped: an operator without their
# phone, or without access to the repository settings, could only wait the
# fifteen minutes out or kill the start.
#
# Requires PROJECT_DIR, and nothing else. It reads .env itself rather than
# calling the caller's get_env: openclaw.sh has one, git.sh does not, and a
# helper that depends on a function its caller may not define fails at the moment
# it is needed. Found by running it -- git.sh hung instead of waiting two
# seconds, because the lookup it could not perform left the deadline empty.

# Where a skip is signalled. A file rather than a signal or a pipe, because the
# two things that create it are in different processes and often different
# containers: the dashboard's server route, and an operator at a terminal.
lu_skip_dir() {
  printf '%s' "${LU_SKIP_DIR:-${PROJECT_DIR}/volumes/.start-skip}"
}

# Cleared once per start. A skip is a decision about *this* run; one that
# survived into the next would be a setting nobody remembers making, and the
# step it skips would stay silent for good.
lu_clear_skips() {
  rm -rf "$(lu_skip_dir)"
  mkdir -p "$(lu_skip_dir)"
  # The budget for the whole start, fixed here so that every wait after this
  # point shares one deadline. Per wait it was per wait: three unregistered
  # deploy keys and four sign-ins meant seven times the deadline, so an
  # unattended host could sit for an hour and three quarters on a setting that
  # reads as fifteen minutes. The operator asked what happens with more than one
  # key; this is the answer -- the number of waits no longer changes how long a
  # start can take.
  local secs
  secs="$(lu_wait_seconds)"
  printf '%s' "$(( $(date +%s) + secs ))" > "$(lu_skip_dir)/.deadline"
}

# The deadline, in seconds, from .env. 0 means do not wait at all -- which is
# what an unattended host wants, and is not the same as waiting forever.
lu_wait_seconds() {
  local v env_file
  env_file="${ENV_FILE:-${PROJECT_DIR}/.env}"
  v="$(grep -E '^SYSTEM_SIGNIN_WAIT_SECONDS=' "$env_file" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d "'\"" || true)"
  v="${v:-900}"
  [[ "$v" =~ ^[0-9]+$ ]] || v=900
  printf '%s' "$v"
}

lu_skip_hint() {  # lu_skip_hint <step>
  printf 'To skip this step and let the rest of the stack start: touch %s/%s' "$(lu_skip_dir)" "$1"
}

# The start-wide deadline written by lu_clear_skips, or nothing when this wait
# runs outside a start -- a test, or a script invoked by hand. Then the wait
# falls back to its own deadline, which is the old behaviour and right for a
# single wait standing on its own.
lu_budget_deadline() {
  local f="$(lu_skip_dir)/.deadline" v
  v="$(cat "$f" 2>/dev/null || true)"
  [[ "$v" =~ ^[0-9]+$ ]] && printf '%s' "$v"
}

# What the budget actually bounds is a start in which nothing happens. An
# operator who registers a key, or presses Skip, has shown they are there, and
# cutting them off at a deadline set before the first wait would punish exactly
# the person the wait exists for. So every wait that ends because someone acted
# gives the rest of the start a full budget again; a wait that ends at the
# deadline does not, which is the unattended case and the one that has to stay
# bounded.
lu_budget_refresh() {
  local f="$(lu_skip_dir)/.deadline"
  [[ -e "$f" ]] || return 0
  printf '%s' "$(( $(date +%s) + $(lu_wait_seconds) ))" > "$f"
}

# True when this step is skipped: its own file, or the group file named by
# LU_SKIP_GROUP. The group is how one click covers several waits -- the
# dashboard's "Skip all" for deploy keys writes git-key-all, and so can an
# operator at a terminal. It is named by the caller rather than derived from the
# step, so a group can never take in a wait that did not ask to be part of one.
lu_skipped() {  # lu_skipped <step>
  local dir; dir="$(lu_skip_dir)"
  [[ -e "${dir}/$1" ]] && return 0
  [[ -n "${LU_SKIP_GROUP:-}" && -e "${dir}/${LU_SKIP_GROUP}" ]] && return 0
  return 1
}

# lu_wait_for_operator <step> <poll-seconds> <condition...>
#   0 the condition came true
#   1 the operator skipped it
#   2 the deadline passed
#
# The condition is checked before anything is printed or waited on: a credential
# that is already there must not produce a banner.
lu_wait_for_operator() {
  local step="$1" interval="$2"; shift 2
  local secs skip now deadline
  skip="$(lu_skip_dir)/${step}"
  "$@" >/dev/null 2>&1 && return 0

  secs="$(lu_wait_seconds)"
  if [[ "$secs" == "0" ]]; then
    echo "Not waiting for ${step}: SYSTEM_SIGNIN_WAIT_SECONDS is 0." >&2
    return 2
  fi
  if lu_skipped "$step"; then
    echo "Skipping ${step}: the operator asked for it." >&2
    return 1
  fi

  deadline="$(lu_budget_deadline)"
  deadline="${deadline:-$(( $(date +%s) + secs ))}"
  if (( $(date +%s) >= deadline )); then
    echo "Not waiting for ${step}: this start has used up its ${secs}s wait budget." >&2
    return 2
  fi
  local slept
  while true; do
    # The interval is waited out in one-second steps, and the skip is checked in
    # each of them. Sleeping the whole interval and only then looking meant a
    # click was noticed up to interval + condition later: measured 2026-09-17,
    # a skip at 6s was acted on at 11s, because the condition -- a clone against
    # an unreachable host -- ran first. An operator pressed the button twice,
    # which is what a button that seems not to work invites.
    slept=0
    while (( slept < interval )); do
      if lu_skipped "$step"; then
        echo "Skipping ${step}: the operator asked for it." >&2
        lu_budget_refresh
        return 1
      fi
      sleep 1
      slept=$(( slept + 1 ))
    done
    if "$@" >/dev/null 2>&1; then
      lu_budget_refresh
      return 0
    fi
    if lu_skipped "$step"; then
      echo "Skipping ${step}: the operator asked for it." >&2
      lu_budget_refresh
      return 1
    fi
    now="$(date +%s)"
    (( now >= deadline )) && return 2
  done
}
