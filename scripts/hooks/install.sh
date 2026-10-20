#!/usr/bin/env bash
# Install the commit-message guard where no checkout can switch it off, and then
# prove it took.
#
# `core.hooksPath` is local configuration: it cannot be committed, so every clone
# runs this once.
#
# **The hook is copied into the shared hooks directory, not pointed at.** The
# first version set `core.hooksPath` to `<main working tree>/scripts/hooks`,
# which is *content of a checkout*: the moment the main tree checks out a branch
# that predates the guard, the directory is empty and git proceeds with no hooks
# at all. Reproduced by the reviewer on 2026-10-20 -- install, add a worktree,
# check out `e3a391a` in the main tree, and the worktree committed
# `both are merged and resolved: #18` with rc 0. Every other open branch of this
# repository predates `scripts/hooks`, so `gh pr checkout <n>` was enough. That
# is the same silent-off state this script's own rationale ruled out for a
# removed worktree, reached by the other door.
#
# `$(git rev-parse --git-common-dir)/hooks` is shared by every worktree and is
# not part of any checkout, so nothing a branch does can empty it. The price of
# a copy is that it can fall behind the source, and that price is paid by
# computing it rather than remembering it: the source blob id is written beside
# the copy, and the hook compares it with `origin/main`'s on every run.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
MAIN_ROOT="$(dirname "$COMMON_DIR")"
SHARED_HOOKS="${COMMON_DIR}/hooks"
SRC="$(pwd -P)/scripts/hooks/commit-msg"
INSTALLED="${SHARED_HOOKS}/commit-msg"
STAMP="${SHARED_HOOKS}/commit-msg.blob"

# Which hook will git actually run here? `core.hooksPath` when set, the shared
# directory otherwise. Asked rather than assumed, because the answer is what
# --check reports and what a reader wants to know.
effective_hook() {
  local configured
  configured="$(git config --get core.hooksPath || true)"
  if [[ -n "$configured" ]]; then
    case "$configured" in
      /*) printf '%s/commit-msg\n' "$configured" ;;
      *) printf '%s/%s/commit-msg\n' "$MAIN_ROOT" "$configured" ;;
    esac
  else
    printf '%s\n' "$INSTALLED"
  fi
}

# Does that hook refuse what it must refuse and pass what it must pass? This is
# the question "is the guard on", computed. Before this existed the answer could
# only be remembered, and on the author's own machine it was remembered wrongly.
self_test() {
  local hook="$1" tmp
  [[ -x "$hook" ]] || { echo "no executable hook at ${hook}" >&2; return 1; }
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  printf 'test: this resolves #9999\n' > "${tmp}/bad"
  printf 'test: the #9999 conflict, answered on #9998\n' > "${tmp}/good"
  "$hook" "${tmp}/bad" >/dev/null 2>&1 && { echo "a closing keyword was accepted" >&2; return 1; }
  "$hook" "${tmp}/good" >/dev/null 2>&1 || { echo "ordinary prose was refused" >&2; return 1; }
  return 0
}

if [[ "${1:-}" == "--check" ]]; then
  hook="$(effective_hook)"
  if self_test "$hook"; then
    echo "commit-message guard: on, at ${hook}"
    exit 0
  fi
  echo "commit-message guard: OFF or broken (${hook}) -- run scripts/hooks/install.sh" >&2
  exit 1
fi

if [[ ! -x "$SRC" ]]; then
  cat >&2 <<NOTYET
${SRC} is not there yet.

This is the state before the commit-message guard has landed in this checkout.
Run it again from a tree that carries scripts/hooks. To point somewhere else on
purpose:
    git config core.hooksPath <absolute directory>
NOTYET
  exit 2
fi

# A foreign hooksPath is somebody's decision and is not overwritten. The one
# exception is this script's own earlier answer -- a path into a checkout -- which
# is the defect being repaired, so it is migrated and said out loud.
current="$(git config --get core.hooksPath || true)"
if [[ -n "$current" ]]; then
  if [[ "$current" == "${MAIN_ROOT}/scripts/hooks" ]]; then
    git config --unset core.hooksPath
    echo "migrated: core.hooksPath pointed into a checkout (${current}) and was unset"
    current=""
  else
    echo "core.hooksPath is already ${current}." >&2
    echo "Refusing to overwrite it. Install by hand if that is what you want:" >&2
    echo "    install -m 755 ${SRC} ${current}/commit-msg" >&2
    exit 2
  fi
fi

mkdir -p "$SHARED_HOOKS"
if [[ -e "$INSTALLED" ]] && ! cmp -s "$SRC" "$INSTALLED"; then
  echo "note: replacing an older ${INSTALLED}"
fi
install -m 755 "$SRC" "$INSTALLED"
git hash-object "$SRC" > "$STAMP"
echo "installed: ${INSTALLED} (source blob $(cat "$STAMP"))"
echo "core.hooksPath = $(git config --get core.hooksPath || echo '(unset -- git uses the shared hooks directory)')"

# What this would switch off, said out loud, in the one case where it does.
other="$(find "$SHARED_HOOKS" -maxdepth 1 -type f ! -name '*.sample' ! -name 'commit-msg' ! -name 'commit-msg.blob' -exec basename {} \; 2>/dev/null | sort | tr '\n' ' ')"
[[ -z "${other// /}" ]] || echo "note: other hooks in ${SHARED_HOOKS} are unaffected: ${other}"

if self_test "$(effective_hook)"; then
  echo "self-test: refuses a closing keyword, passes prose that names the same number"
else
  echo "SELF-TEST FAILED" >&2
  exit 1
fi
