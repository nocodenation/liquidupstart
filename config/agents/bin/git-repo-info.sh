#!/bin/sh
set -eu

MANIFEST="${GIT_REPOSITORIES_MANIFEST:-/git-secrets/repositories.json}"

usage() {
  cat <<'USAGE'
Usage: git-repo-info <repository>

Says whether a repository is declared in this stack, where its clone is, what
access and branch policy it carries, and whether the clone succeeded. The
repository may be given as a bare name, an SSH URL or an HTTPS URL; all three
give the same answer.

  git-repo-info agent-skills
  git-repo-info git@github.com:owner/agent-skills.git
  git-repo-info https://github.com/owner/agent-skills

Exit codes:
  0  declared, and its clone is in place
  2  not declared here
  3  declared, but its clone is missing
  1  the question could not be answered
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [ $# -ne 1 ] || [ -z "$1" ]; then
  usage >&2
  exit 1
fi

if [ ! -r "$MANIFEST" ]; then
  echo "git-repo-info: no repository manifest at ${MANIFEST}." >&2
  echo "The stack writes it when it starts; ask the operator to start the stack again." >&2
  exit 1
fi

PARSED="$(awk -v q="$1" '
function norm(s,  t) {
  t = tolower(s)
  sub(/\/+$/, "", t)
  sub(/^[a-z0-9+.-]+:\/\//, "", t)
  sub(/^[^@\/]+@/, "", t)
  sub(/:/, "/", t)
  sub(/\.git$/, "", t)
  sub(/\/+$/, "", t)
  return t
}
function unquote(s,  t) {
  sub(/[ \t]*,[ \t]*$/, "", s)
  if (s ~ /^".*"$/) {
    t = substr(s, 2, length(s) - 2)
    gsub(/\\"/, "\"", t)
    gsub(/\\\\/, "\\", t)
    return t
  }
  return s
}
function matches(  qn, n, parts) {
  qn = norm(q)
  if (qn == "") return 0
  if (qn == norm(f["name"])) return 1
  if (qn == norm(f["path"])) return 1
  if (qn == norm(f["host"] "/" f["path"])) return 1
  if (qn == norm(f["url"])) return 1
  n = split(f["path"], parts, "/")
  if (n > 0 && qn == norm(parts[n])) return 1
  return 0
}
/^[ \t]*\{/ { split("", f); inrec = 1; next }
/^[ \t]*\}/ {
  if (inrec && f["name"] != "") {
    names = names (names == "" ? "" : ", ") f["name"]
    if (!found) {
      if (matches()) {
        found = 1
        for (k in f) out[k] = f[k]
      }
    }
  }
  inrec = 0
  next
}
inrec && /^[ \t]*"[^"]*"[ \t]*:/ {
  line = $0
  sub(/^[ \t]*"/, "", line)
  key = substr(line, 1, index(line, "\"") - 1)
  value = substr(line, index(line, ":") + 1)
  sub(/^[ \t]+/, "", value)
  f[key] = unquote(value)
  next
}
END {
  if (found) {
    print "MATCH"
    for (k in out) printf "%s\t%s\n", k, out[k]
  } else {
    print "NOMATCH"
    printf "names\t%s\n", names
  }
}
' "$MANIFEST")"

TAB="$(printf '\t')"
status=""
names=""
r_name=""
r_url=""
r_access=""
r_policy=""
r_clone=""
r_key=""
r_cloned=""
r_error=""

while IFS="$TAB" read -r key value; do
  case "$key" in
    MATCH) status=declared ;;
    NOMATCH) status=undeclared ;;
    names) names="$value" ;;
    name) r_name="$value" ;;
    url) r_url="$value" ;;
    access) r_access="$value" ;;
    policy) r_policy="$value" ;;
    containerClone) r_clone="$value" ;;
    containerKey) r_key="$value" ;;
    cloned) r_cloned="$value" ;;
    error) r_error="$value" ;;
  esac
done <<PARSED
${PARSED}
PARSED

if [ "$status" = "undeclared" ]; then
  cat <<UNDECLARED
${1} is not declared in this stack.

The stack holds no deploy key for it, so it cannot be cloned, fetched or pushed
from here, and there is no clone of it under /repos. That says nothing about the
repository itself: it may exist and be perfectly reachable from somewhere else.

To make it available the operator adds it to GIT_REPOSITORIES in .env, starts
the stack again, and registers the deploy key the start prints with the
repository host. You cannot do any of that yourself — say so and ask.

Declared here: ${names:-(none)}
UNDECLARED
  exit 2
fi

if [ "$status" != "declared" ]; then
  echo "git-repo-info: could not read the manifest at ${MANIFEST}." >&2
  exit 1
fi

case "$r_access" in
  read) access_note="read — fetch and read it; do not push to it" ;;
  write) access_note="write — you may push, once the operator has asked you to" ;;
  *) access_note="$r_access" ;;
esac

r_default=""
if [ "$r_cloned" = "true" ] && [ -d "$r_clone" ]; then
  r_default="$(git -C "$r_clone" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  r_default="${r_default#origin/}"
fi

case "$r_policy" in
  protected) policy_note="protected — work on a feature branch; the default branch is not yours to push" ;;
  direct) policy_note="direct — the default branch may be written to, but a push is still the operator's call" ;;
  *) policy_note="$r_policy" ;;
esac

field() {
  printf '  %-14s %s\n' "$1" "$2"
}

if [ "$r_cloned" = "true" ]; then
  printf '%s is declared in this stack, and its clone is in place.\n\n' "$r_name"
  field "clone" "$r_clone"
  field "remote" "$r_url"
  field "access" "$access_note"
  field "branch policy" "$policy_note"
  if [ -n "$r_default" ]; then field "default branch" "$r_default"; fi
  field "deploy key" "${r_key}.pub (the path; never print or copy a key)"
  field "clone status" "cloned"
  printf '\nWork in %s. Its remote and its key are already configured there, so\n' "$r_clone"
  printf 'fetch, pull and push need no URL and no credentials from you.\n'
  if [ -n "$r_default" ]; then
    printf 'Start new work from %s: git switch -c <name> origin/%s.\n' "$r_default" "$r_default"
  fi
  exit 0
fi

printf '%s is declared in this stack, but it is not cloned.\n\n' "$r_name"
field "clone" "${r_clone} (missing)"
field "remote" "$r_url"
field "access" "$access_note"
field "branch policy" "$policy_note"
field "deploy key" "${r_key}.pub (the path; never print or copy a key)"
field "clone status" "not cloned — ${r_error:-no reason recorded}"
printf '\nThe declaration is in place; the clone itself failed. The operator has to\n'
printf 'register the deploy key above with the repository host and start the stack\n'
printf 'again. Report that rather than cloning it yourself.\n'
exit 3
