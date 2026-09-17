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
  if [[ -e "$skip" ]]; then
    echo "Skipping ${step}: ${skip} is present." >&2
    return 1
  fi

  deadline=$(( $(date +%s) + secs ))
  while true; do
    sleep "$interval"
    "$@" >/dev/null 2>&1 && return 0
    if [[ -e "$skip" ]]; then
      echo "Skipping ${step}: the operator asked for it." >&2
      return 1
    fi
    now="$(date +%s)"
    (( now >= deadline )) && return 2
  done
}
