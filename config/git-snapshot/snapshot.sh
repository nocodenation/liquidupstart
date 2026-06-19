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

DEBOUNCE="${GIT_SNAPSHOT_DEBOUNCE:-30}"
FALLBACK="${GIT_SNAPSHOT_INTERVAL:-300}"

AREAS="data:${GIT_VERSION_DATA:-0}
python_extensions:${GIT_VERSION_PYTHON_EXTENSIONS:-0}
nar_extensions:${GIT_VERSION_NAR_EXTENSIONS:-0}
nar_extensions_src:${GIT_VERSION_NAR_EXTENSIONS_SRC:-0}"

ENABLED=$(echo "$AREAS" | awk -F: '$2==1{print $1}')

write_default_gitignore() {
  case "$1" in
    bun_app)            extra='node_modules/\ndist/\n' ;;
    python_extensions)  extra='__pycache__/\n*.pyc\n.venv/\n' ;;
    nar_extensions_src) extra='target/\nbuild/\n' ;;
    *)                  extra='' ;;
  esac
  printf ".env\n*.token\n*.key\n.DS_Store\n${extra}" > .gitignore
}

snapshot_area() {
  area="$1"
  dir="/repos/$area"
  [ -d "$dir" ] || return 0
  cd "$dir" || return 0
  if [ ! -e "$dir/.git" ]; then
    git init -q
    [ -f .gitignore ] || write_default_gitignore "$area"
    echo "git-snapshot: initialized repo for ${area}"
  fi
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "http://gitea:3000/${GITEA_USER}/${area}.git"
  git add -A 2>/dev/null || true
  if ! git diff --cached --quiet 2>/dev/null; then
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    git commit -m "snapshot ${ts}" >/dev/null 2>&1 || true
    echo "git-snapshot: committed ${area} @ ${ts}"
  fi
  git push -u origin HEAD >/dev/null 2>&1 || true
}

sweep() {
  for area in $ENABLED; do
    snapshot_area "$area"
  done
}

WATCH=""
for area in $ENABLED; do
  [ -d "/repos/$area" ] && WATCH="$WATCH /repos/$area"
done

echo "git-snapshot: enabled areas:$(for a in $ENABLED; do printf ' %s' "$a"; done)"
sweep

if [ -z "$WATCH" ]; then
  echo "git-snapshot: no enabled areas; idling."
  while true; do sleep "$FALLBACK"; done
fi

command -v inotifywait >/dev/null 2>&1 || apk add --no-cache inotify-tools >/dev/null 2>&1 || true

if command -v inotifywait >/dev/null 2>&1; then
  echo "git-snapshot: watching for changes (debounce ${DEBOUNCE}s, fallback ${FALLBACK}s)"
  while true; do
    if inotifywait -r -q -t "$FALLBACK" --exclude '(^|/)(\.git|node_modules)(/|$)' \
         -e close_write,create,delete,move $WATCH >/dev/null 2>&1; then
      while inotifywait -r -q -t "$DEBOUNCE" --exclude '(^|/)(\.git|node_modules)(/|$)' \
              -e close_write,create,delete,move $WATCH >/dev/null 2>&1; do
        :
      done
    fi
    sweep
  done
else
  echo "git-snapshot: inotify-tools unavailable; polling every ${FALLBACK}s"
  while true; do
    sleep "$FALLBACK"
    sweep
  done
fi
