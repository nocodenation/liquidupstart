#!/usr/bin/env bash
set -euo pipefail

lu_git_trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

lu_git_slug() {
  printf '%s' "$1/$2" | tr '/' '_' | sed -E 's/[^A-Za-z0-9._-]/_/g'
}

lu_git_reject() {
  echo "Error: repository entry '${1}': ${2}" >&2
  exit 2
}

lu_git_parse() {
  local declaration entry field_url field_access field_policy extra
  local url host path name slug
  local -a names=() rows=()
  declaration="$(lu_git_trim "${1:-}")"
  [[ -n "$declaration" ]] || return 0

  local IFS=','
  read -ra entries <<< "$declaration"
  unset IFS

  for entry in "${entries[@]}"; do
    entry="$(lu_git_trim "$entry")"
    [[ -n "$entry" ]] || continue

    IFS='|' read -r field_url field_access field_policy extra <<< "$entry"
    field_url="$(lu_git_trim "${field_url:-}")"
    field_access="$(lu_git_trim "${field_access:-}")"
    field_policy="$(lu_git_trim "${field_policy:-}")"
    extra="$(lu_git_trim "${extra:-}")"
    if [[ -z "$field_url" || -z "$field_access" || -z "$field_policy" || -n "$extra" ]]; then
      lu_git_reject "$entry" "expected <ssh-url>|<access>|<policy>"
    fi

    url="$field_url"
    case "$url" in
      https://*|http://*)
        lu_git_reject "$entry" \
          "the stack's credentials are SSH-only, so '${url}' is refused rather than rewritten; declare it as git@host:owner/repo.git"
        ;;
      ssh://*)
        local rest="${url#ssh://}"
        rest="${rest#*@}"
        host="${rest%%/*}"
        host="${host%%:*}"
        path="${rest#*/}"
        [[ "$rest" == */* && -n "$host" && -n "$path" ]] \
          || lu_git_reject "$entry" "'${url}' is not an SSH URL (expected git@host:path or ssh://host/path)"
        ;;
      *:*)
        local left="${url%%:*}"
        host="${left##*@}"
        path="${url#*:}"
        path="${path#/}"
        [[ -n "$host" && -n "$path" && "$host" != */* ]] \
          || lu_git_reject "$entry" "'${url}' is not an SSH URL (expected git@host:path or ssh://host/path)"
        ;;
      *)
        lu_git_reject "$entry" "'${url}' is not an SSH URL (expected git@host:path or ssh://host/path)"
        ;;
    esac

    path="${path%.git}"
    path="${path%/}"
    name="${path##*/}"
    [[ -n "$name" ]] || lu_git_reject "$entry" "'${url}' names no repository"

    case "$field_access" in
      read|write) ;;
      *) lu_git_reject "$entry" "access must be read or write, not '${field_access}'" ;;
    esac
    case "$field_policy" in
      protected|direct) ;;
      *) lu_git_reject "$entry" "policy must be protected or direct, not '${field_policy}'" ;;
    esac

    slug="$(lu_git_slug "$host" "$path")"
    names+=("$name")
    rows+=("${name}	${url}	${host}	${path}	${field_access}	${field_policy}	${slug}")
  done

  local row row_name occurrences dir
  for row in ${rows[@]+"${rows[@]}"}; do
    row_name="${row%%	*}"
    occurrences=0
    for name in ${names[@]+"${names[@]}"}; do
      [[ "$name" == "$row_name" ]] && occurrences=$((occurrences + 1))
    done
    if [[ $occurrences -gt 1 ]]; then
      dir="${row##*	}"
    else
      dir="$row_name"
    fi
    printf '%s\t%s\n' "$row" "$dir"
  done
}

lu_git_keys() {
  local secrets_dir="$1" declaration="${2:-}" parsed
  parsed="$(lu_git_parse "$declaration")"
  [[ -n "$parsed" ]] || return 0

  local name url host path access policy slug dir key_dir key
  while IFS=$'\t' read -r name url host path access policy slug dir; do
    [[ -n "$slug" ]] || continue
    key_dir="${secrets_dir}/repos/${slug}"
    key="${key_dir}/id_ed25519"
    mkdir -p "$key_dir"
    chmod 700 "$key_dir"
    if [[ ! -f "$key" ]]; then
      ssh-keygen -t ed25519 -N '' -C "liquidupstart-${slug}" -f "$key" >/dev/null
      echo "Generated deploy key for ${url}: ${key}.pub" >&2
    fi
    chmod 600 "$key"
    chmod 644 "${key}.pub"
    printf '%s\t%s\n' "$slug" "${key}.pub"
  done <<< "$parsed"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    parse) lu_git_parse "${2:-}" ;;
    keys)
      [[ $# -ge 2 ]] || { echo "usage: git-repos.sh keys <secrets-dir> [declaration]" >&2; exit 2; }
      lu_git_keys "$2" "${3:-}"
      ;;
    *) echo "usage: git-repos.sh {parse|keys} ..." >&2; exit 2 ;;
  esac
fi
