#!/bin/sh
set -eu

NAMESPACE="agent/"

say() { printf '%s\n' "$1" >&2; }
out() { printf '%s\n' "$1"; }

usage() {
  cat <<'USAGE'
Usage: git-publish [remote]

Publishes the branch you are on, and is the one way work leaves this stack. It
reads the repository's declaration, checks the branch namespace, scans the
commits it would send for credentials, and then pushes — or refuses with one
message saying what to do instead. A push made with git push is refused.

Run it from inside the clone, on the branch you want published:

  git switch -c agent/<name>
  git add .; git commit -m "add the thing"
  git-publish

Branches live under agent/ so that everything published from here can be found
under one prefix afterwards. Where a repository's policy is direct, its default
branch may be published too. Run git-repo-info <repository> to see what a
repository is declared with.

The remote defaults to origin, which is what the stack configures.

Exit codes:
  0  published, or there was nothing new to publish
  1  refused, or the push itself was not accepted
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [ $# -gt 1 ]; then
  usage >&2
  exit 1
fi

REMOTE="${1:-origin}"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  say "git-publish refused: this is not a git repository."
  say "Every repository this stack can reach is cloned under /repos; cd into one and publish from there."
  say "Run git-repo-info <repository> to find out where a repository's clone is."
  exit 1
fi

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [ -z "$branch" ]; then
  say "git-publish refused: HEAD is detached, so there is no branch to publish."
  say "Put the work on a branch first: git switch -c ${NAMESPACE}<name>."
  say "Then run git-publish again."
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  say "git-publish refused: this clone has no remote called ${REMOTE}."
  say "The stack configures the remote and the key when it clones a declared repository."
  say "Run git-repo-info <repository>, work in the clone it names, and publish from there."
  exit 1
fi

access="$(git config --get liquidupstart.access 2>/dev/null || true)"
policy="$(git config --get liquidupstart.policy 2>/dev/null || true)"

if [ -z "$access" ]; then
  say "git-publish refused: this clone carries no declaration, so nothing here says what may leave it."
  say "Run git-repo-info <repository>: it says whether the repository is declared in this stack and where its clone is."
  say "Work in the clone it names, or report that the repository is not declared and ask the operator to declare it."
  exit 1
fi

if [ "$access" = read ]; then
  say "git-publish refused: this repository is declared with access read in this stack."
  say "Nothing may be pushed to it from here, whatever is being pushed and wherever it goes."
  say "Report the refusal and ask the operator; do not look for a way around it."
  exit 1
fi

default_branch="$(git symbolic-ref --quiet --short "refs/remotes/${REMOTE}/HEAD" 2>/dev/null || true)"
default_branch="${default_branch#${REMOTE}/}"

if [ "$policy" = protected ] && [ -n "$default_branch" ] && [ "$branch" = "$default_branch" ]; then
  say "git-publish refused: ${branch} is the default branch here and this repository's policy is protected."
  say "Publish from a branch of your own instead: git switch -c ${NAMESPACE}<name>, then git-publish."
  say "Changing ${branch} is the operator's call — report what you have and ask."
  exit 1
fi

case "$branch" in
  ${NAMESPACE}?*) namespaced=yes ;;
  *) namespaced=no ;;
esac

if [ "$namespaced" = no ] && [ "$branch" != "$default_branch" ]; then
  say "git-publish refused: ${branch} is outside the ${NAMESPACE} namespace this stack publishes under."
  say "Everything published from here lives under ${NAMESPACE}, so that it can be listed and removed afterwards."
  say "Move the work onto one: git switch -c ${NAMESPACE}<name>, then git-publish."
  exit 1
fi

commits="$(git rev-list HEAD --not --remotes="$REMOTE" 2>/dev/null || true)"

for commit in $commits; do
  for path in $(git diff-tree -r -m --root --no-commit-id --name-only --diff-filter=AM "$commit" 2>/dev/null || true); do
    base="${path##*/}"
    case "$base" in
      .env|.env.*)
        say "git-publish refused: commit $(git rev-parse --short "$commit") adds ${path}."
        say "A .env file holds this stack's credentials, and a remote never forgets what reaches it."
        say "Take it out of the history you are publishing — git rm --cached ${path}, commit, and publish again — and say plainly that you did."
        exit 1
        ;;
    esac
    if git show "${commit}:${path}" 2>/dev/null | grep -q -- '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----'; then
      say "git-publish refused: commit $(git rev-parse --short "$commit") adds ${path}, which contains a private key."
      say "A key that reaches a remote is a key to replace, so it is refused here rather than at the remote."
      say "Take it out of the history you are publishing — git rm --cached ${path}, commit, and publish again — and say plainly that you did."
      exit 1
    fi
  done
done

if [ -z "$commits" ]; then
  out "nothing to publish: ${REMOTE} already holds every commit on ${branch}."
  out "Commit the work first, then run git-publish again."
  exit 0
fi

token="$(git rev-parse --absolute-git-dir)/liquidupstart-publish"
short="$(git rev-parse --short HEAD)"

printf '%s %s\n' "$branch" "$(git rev-parse HEAD)" > "$token"

set +e
git push "$REMOTE" "refs/heads/${branch}:refs/heads/${branch}"
pushed=$?
set -e
rm -f "$token"

if [ "$pushed" -ne 0 ]; then
  say "git-publish: the push was not accepted, and nothing was published."
  say "The message above says what refused it. Report it as it stands and ask the operator; do not look for another way through."
  exit 1
fi

out "published ${branch} to ${REMOTE}, at commit ${short}."
out "$(git log -1 --format='  %h  %s')"
out "Say what you published and where; whether it goes further is the operator's call."
