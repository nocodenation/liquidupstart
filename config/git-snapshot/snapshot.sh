#!/bin/sh
set -u

git config --global user.name "${GITEA_USER}"
git config --global user.email "${GITEA_EMAIL}"
git config --global init.defaultBranch main
git config --global --add safe.directory '*'
git config --global credential.helper 'store --file=/root/.git-credentials'

if [ -n "${GITEA_OPENCLAW_TOKEN:-}" ] && [ "${GITEA_OPENCLAW_TOKEN}" != "generate_this_with_shell_script" ]; then
  printf 'http://%s:%s@gitea:3000\n' "${GITEA_USER}" "${GITEA_OPENCLAW_TOKEN}" > /root/.git-credentials
  chmod 600 /root/.git-credentials
fi

INTERVAL="${GIT_SNAPSHOT_INTERVAL:-300}"
echo "git-snapshot: snapshotting dirty repos under /repos every ${INTERVAL}s"

while true; do
  for gitdir in $(find /repos -maxdepth 4 -type d -name .git 2>/dev/null); do
    repo=$(dirname "$gitdir")
    cd "$repo" || continue
    git add -A 2>/dev/null || true
    if ! git diff --cached --quiet 2>/dev/null; then
      ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      git commit -m "snapshot ${ts}" >/dev/null 2>&1 || true
      echo "git-snapshot: committed ${repo} @ ${ts}"
    fi
    # No-op when the repo has no remote/upstream yet; the agent sets that up.
    git push >/dev/null 2>&1 || true
  done
  sleep "${INTERVAL}"
done
