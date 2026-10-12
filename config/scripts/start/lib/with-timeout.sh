#!/usr/bin/env bash
# One bounded run, for every start script that needs one.
#
# Two copies of this lived in config/scripts/start/{openclaw,git}.sh, and both
# ended in the same `else "$@"` -- a host with neither `timeout` nor `gtimeout`
# ran the command with no bound at all, and nothing said so. macOS ships neither:
# they are GNU coreutils. So on the operator's own machine every "bounded"
# docker run in this stack was unbounded, which is the opposite of what the call
# site reads as, and the property N1 was written to guarantee.
#
# Measured 2026-09-17 on this machine, three times in one afternoon: the N1 probe
# container -- `docker run` on a node process that never exits, bounded at 8s
# with a 10s grace -- stood for 13 minutes, for over a minute, and for over a
# minute again, each time until something else removed it. The case could not
# even report it: a bun test cannot interrupt a synchronous spawn, so the suite
# hung rather than going red.
#
# `timeout` is still used where it exists, because it is the better instrument
# and it is present in every container here. What changed is the last branch: a
# watchdog rather than a shrug.
#
# The contract, unchanged from the coreutils version:
#   with_timeout 0 cmd...   runs unbounded and does NOT redirect stdin -- the
#                           branch the interactive sign-ins take, which have to
#                           be able to read the terminal
#   with_timeout N cmd...   runs with stdin closed, and comes back within N plus
#                           the 10s grace, with a non-zero status if it expired
#
# A caller reads any non-zero status as "the bound expired" and force-removes the
# container it named: a client killed with SIGKILL cleans nothing up, so --rm
# never fires. That is what N4 asserts at every call site.

LU_TIMEOUT_GRACE="${LU_TIMEOUT_GRACE:-10}"

with_timeout() {  # with_timeout <seconds> <command...>
  local secs="$1"; shift
  if [[ "$secs" == "0" ]]; then "$@"; return $?; fi

  if command -v timeout >/dev/null 2>&1; then
    timeout -k "$LU_TIMEOUT_GRACE" "$secs" "$@" </dev/null
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout -k "$LU_TIMEOUT_GRACE" "$secs" "$@" </dev/null
    return $?
  fi

  # No coreutils. Run it in the background and watch it here: SIGTERM at the
  # limit, SIGKILL after the grace -- which is what `-k` does, and what makes a
  # bound on `docker run` return at all. The kill is not belt and braces: the
  # docker client stays attached through SIGTERM often enough that three of four
  # bounds needed the kill on 2026-09-14.
  local stamp; stamp="$(mktemp)"
  "$@" </dev/null &
  local child=$!

  (
    waited=0
    while (( waited < secs )); do
      kill -0 "$child" 2>/dev/null || exit 0
      sleep 1
      waited=$(( waited + 1 ))
    done
    kill -0 "$child" 2>/dev/null || exit 0
    # Written before the signal, so the parent can tell a command that failed on
    # its own from one this watchdog ended. Without it a bound that expired and a
    # command that exited 1 are the same number to the caller.
    printf 'expired' > "$stamp"
    kill -TERM "$child" 2>/dev/null
    grace=0
    while (( grace < LU_TIMEOUT_GRACE )); do
      kill -0 "$child" 2>/dev/null || exit 0
      sleep 1
      grace=$(( grace + 1 ))
    done
    kill -KILL "$child" 2>/dev/null
  ) >/dev/null 2>&1 &
  # Its output goes nowhere on purpose: a caller capturing `$(with_timeout …)`
  # holds a pipe open until every writer is gone, and a watchdog that inherited
  # it would keep the substitution waiting after the command itself had finished.
  local watchdog=$!

  local rc=0
  # `2>/dev/null` on the wait, not on the command: bash announces a job it reaps
  # after a signal -- "Terminated: 15" -- and that line is written while wait
  # reaps, on this function's stderr, not the child's. Without this the caller
  # sees shell bookkeeping mixed into the output of the thing it ran; the child's
  # own stderr was inherited when it started and is untouched.
  wait "$child" 2>/dev/null || rc=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null || true

  # 124 is what coreutils `timeout` returns for an expired bound, and callers on
  # a host with coreutils already see it. A host without must not answer with a
  # different number for the same event.
  if [[ -s "$stamp" ]]; then rc=124; fi
  rm -f "$stamp"
  return $rc
}
