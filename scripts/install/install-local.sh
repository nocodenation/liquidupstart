#!/usr/bin/env bash
#
# install-local.sh — install Liquid Upstart from THIS checkout
#
# Same as install.sh (Docker bootstrap, launcher, version stamp) except the
# project is copied from this working tree instead of a GitHub release. Files
# ignored by git — .env, volumes/, rendered config, node_modules — are skipped,
# so an existing install keeps its data and only the code is refreshed.
#
#   ./scripts/install/install-local.sh [--tracked-only] [--dest DIR]
#
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  SDIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in /*) ;; *) SOURCE="${SDIR}/${SOURCE}" ;; esac
done
SELF_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
SRC_DIR="$(cd "${SELF_DIR}/../.." && pwd)"

LU_INSTALL_LIB=1 . "${SELF_DIR}/install.sh"

TRACKED_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tracked-only) TRACKED_ONLY=1; shift ;;
    --dest) [ $# -ge 2 ] || die "--dest needs a directory."; DEST="$2"; shift 2 ;;
    -h|--help)
      printf 'usage: %s [--tracked-only] [--dest DIR]\n' "$(basename "$0")"
      printf '  --tracked-only  copy only git-tracked files (skip untracked ones)\n'
      printf '  --dest DIR      install into DIR instead of %s\n' "$DEST"
      exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
VERSION_FILE="${DEST}/.liquidupstart-version"
MANIFEST_FILE="${DEST}/.liquidupstart-manifest"

is_git_repo() {
  command -v git >/dev/null 2>&1 \
    && git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

local_version() {
  local sha
  if is_git_repo; then
    sha="$(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    if [ -n "$(git -C "$SRC_DIR" status --porcelain 2>/dev/null)" ]; then
      printf 'local-%s-dirty\n' "$sha"
    else
      printf 'local-%s\n' "$sha"
    fi
  else
    printf 'local\n'
  fi
}

copy_with_git() {
  local tmp="$1" f
  local flags=( --cached --others )
  [ "$TRACKED_ONLY" -eq 1 ] && flags=( --cached )
  git -C "$SRC_DIR" ls-files -z "${flags[@]}" --exclude-standard > "${tmp}/all.z"
  : > "${tmp}/list.z"
  while IFS= read -r -d '' f; do
    [ -e "${SRC_DIR}/${f}" ] && printf '%s\0' "$f" >> "${tmp}/list.z"
  done < "${tmp}/all.z"
  [ -s "${tmp}/list.z" ] || die "git listed no files to copy from ${SRC_DIR}."
  tr '\0' '\n' < "${tmp}/list.z" > "${tmp}/manifest"
  ( cd "$SRC_DIR" && tar --null -T "${tmp}/list.z" -cf - ) | ( cd "$DEST" && tar -xf - )
}

# No git (e.g. an extracted release zip): approximate the ignore rules by
# feeding every .gitignore pattern in the tree to tar --exclude.
copy_with_tar() {
  local tmp="$1" excludes=() gi dir pat anchored prefix
  while IFS= read -r gi; do
    dir="$(dirname "$gi")"
    dir="${dir#"$SRC_DIR"}"
    dir="${dir#/}"
    prefix="./${dir:+${dir}/}"
    while IFS= read -r pat || [ -n "$pat" ]; do
      case "$pat" in ''|\#*|\!*) continue ;; esac
      anchored=0
      case "$pat" in /*) anchored=1; pat="${pat#/}" ;; esac
      pat="${pat%/}"
      [ -n "$pat" ] || continue
      excludes+=( "--exclude=${prefix}${pat}" )
      [ "$anchored" -eq 1 ] || excludes+=( "--exclude=${prefix}*/${pat}" )
    done < "$gi"
  done < <(find "$SRC_DIR" -name .gitignore -not -path '*/.git/*')
  ( cd "$SRC_DIR" \
    && tar --exclude=.git --exclude='*/.git' \
         ${excludes[@]+"${excludes[@]}"} -cf - . ) > "${tmp}/archive.tar"
  tar -tf "${tmp}/archive.tar" \
    | sed -e 's|^\./||' -e '/\/$/d' -e '/^$/d' > "${tmp}/manifest"
  ( cd "$DEST" && tar -xf "${tmp}/archive.tar" )
}

# Never delete these, whatever a manifest claims: they are runtime state, not
# installed files.
protected_path() {
  case "$1" in
    .env|.env.local|.install-result|.needs-rebuild|run.compose.yml) return 0 ;;
    .liquidupstart-version|.liquidupstart-manifest)                 return 0 ;;
    volumes|volumes/*)                                              return 0 ;;
    *) return 1 ;;
  esac
}

# Delete what the previous install wrote and this one no longer ships. Files the
# installer never created are absent from the old manifest, so they survive.
prune_stale() {
  local new="$1" f dirs=() d removed=0
  if [ ! -f "$MANIFEST_FILE" ]; then
    warn "No manifest from a previous install — nothing pruned this time."
    return 0
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    protected_path "$f" && continue
    [ -e "${DEST}/${f}" ] || [ -L "${DEST}/${f}" ] || continue
    rm -f "${DEST}/${f}" || { warn "Could not remove stale ${f}"; continue; }
    ok "removed stale ${f}"
    removed=$((removed + 1))
    d="$(dirname "$f")"
    [ "$d" = . ] || dirs+=( "$d" )
  done < <(comm -23 <(sort -u "$MANIFEST_FILE") <(sort -u "$new"))

  if [ "${#dirs[@]}" -gt 0 ]; then
    printf '%s\n' "${dirs[@]}" | sort -ru | while IFS= read -r d; do
      [ -n "$d" ] && rmdir -p "${DEST}/${d}" 2>/dev/null || true
    done
  fi
  [ "$removed" -gt 0 ] && ok "Pruned ${removed} stale file(s)" || ok "No stale files to prune"
}

copy_project() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$DEST"
  if is_git_repo; then
    log "Copying the working tree (git decides what is ignored)"
    copy_with_git "$tmp" || rc=$?
  else
    warn "Not a git checkout — falling back to .gitignore patterns via tar."
    copy_with_tar "$tmp" || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    log "Pruning files left over from a previous install"
    prune_stale "${tmp}/manifest" || rc=$?
    cp "${tmp}/manifest" "$MANIFEST_FILE"
  fi
  rm -rf "$tmp"
  return "$rc"
}

[ -d "$SRC_DIR/config" ] && [ -f "$SRC_DIR/compose.yml" ] \
  || die "${SRC_DIR} does not look like a Liquid Upstart checkout."

if [ "$(cd "$SRC_DIR" && pwd -P)" = "$(cd "$DEST" 2>/dev/null && pwd -P || echo /nonexistent)" ]; then
  die "Source and destination are the same directory (${DEST}).
  Run this from a separate checkout, or pass --dest with another path."
fi

log "Installing from ${SRC_DIR}"

case "$(uname -s)" in
  Darwin) run_macos ;;
  Linux)  run_linux ;;
  *)      die "Unsupported OS: $(uname -s). This installer supports Linux/WSL2 and macOS." ;;
esac

[ -d "$DEST" ] && log "Refreshing the existing install at ${DEST} (.env and volumes/ are kept)"
copy_project
local_version > "$VERSION_FILE"
ok "Installed $(cat "$VERSION_FILE") into ${DEST}"

link_launcher
print_done "$DEST"
