#!/usr/bin/env bash
# Point this repository's hooks at scripts/hooks, and then prove it took.
#
# `core.hooksPath` is local configuration: it cannot be committed, so every
# clone runs this once. One setting covers every worktree of the clone.
#
# It is written **absolute and against the main working tree**, never against
# the worktree this script happens to run from. A worktree gets removed when its
# branch lands, and `core.hooksPath` pointing into a directory that no longer
# exists does not fail -- git finds no hooks there and proceeds, so the guard
# would be off and nothing would say so. A relative `scripts/hooks` has the
# neighbouring problem: each worktree would use its own copy, and a branch that
# predates the guard carries none.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# The main working tree, whichever worktree this was invoked from.
COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
MAIN_ROOT="$(dirname "$COMMON_DIR")"
HOOKS_DIR="${MAIN_ROOT}/scripts/hooks"

if [[ ! -x "${HOOKS_DIR}/commit-msg" ]]; then
  cat >&2 <<NOTYET
${HOOKS_DIR}/commit-msg is not there yet.

The hooks live with the main working tree so that removing a worktree cannot
switch the guard off silently. ${MAIN_ROOT} does not carry them, which is the
state before the commit-message guard has landed on its default branch.

Run this again from ${MAIN_ROOT} once it does. To point somewhere else on
purpose:
    git config core.hooksPath <absolute directory>
NOTYET
  exit 2
fi

current="$(git config --get core.hooksPath || true)"
if [[ -n "$current" && "$current" != "$HOOKS_DIR" ]]; then
  echo "core.hooksPath is already ${current}." >&2
  echo "Refusing to overwrite it. Set it by hand if that is what you want:" >&2
  echo "    git config core.hooksPath ${HOOKS_DIR}" >&2
  exit 2
fi

# What this setting switches off, said out loud: hooks under .git/hooks stop
# running once hooksPath points elsewhere, and samples do not count.
bypassed="$(find "${COMMON_DIR}/hooks" -maxdepth 1 -type f ! -name '*.sample' -exec basename {} \; 2>/dev/null | sort | tr '\n' ' ')"
[[ -z "${bypassed// /}" ]] || echo "note: hooks in .git/hooks will no longer run: ${bypassed}"

git config core.hooksPath "$HOOKS_DIR"
echo "core.hooksPath = $(git config --get core.hooksPath)"

# Compute the answer rather than claim it: a message that must be refused, and
# one that must pass.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'test: this resolves #9999\n' > "${tmp}/bad"
printf 'test: the #9999 conflict, answered on #9998\n' > "${tmp}/good"

"${HOOKS_DIR}/commit-msg" "${tmp}/bad" >/dev/null 2>&1 && { echo "SELF-TEST FAILED: a closing keyword was accepted" >&2; exit 1; }
"${HOOKS_DIR}/commit-msg" "${tmp}/good" >/dev/null 2>&1 || { echo "SELF-TEST FAILED: ordinary prose was refused" >&2; exit 1; }
echo "self-test: refuses a closing keyword, passes prose that names the same number"
