#!/bin/sh
set -eu

REPOS=/repos
PROXY="${NAR_BUILD_PROXY:-proxy}"
PORT="${SYSTEM_HTTP_PORT:-8888}"
VHOST="nar-builder.localhost"
TIMEOUT="${NAR_BUILD_TIMEOUT:-1800}"

usage() {
  cat <<'USAGE'
Usage: nar-build [directory]
       nar-build --target

Compiles a Java source directory in the workspace into a NiFi NAR and writes it
where Liquid loads extensions from. The directory defaults to the one you are in.

  cd /repos/<repository>/<processor>
  nar-build

The Maven project is synthesised from what the directory holds — a processors
module and a nar module, built against the version the running Liquid reports.
If the directory carries its own pom.xml, that one is used unchanged, so a
processor with real dependencies is not capped by the synthesiser.

--target prints the NiFi and Java versions the build would target, the nifi-api
version it resolves through org.apache.nifi:nifi-utils, and where each came from.
NiFi versions nifi-api on its own line, so the two differ: the resolved one is
what Liquid loads and what the project is written against. Nothing is declared: a
build that cannot read or resolve them stops.

The artifact is not live until Liquid restarts, which is the operator's call.

Exit codes:
  0  built, and the answer names the file it wrote
  1  refused, or the build failed with the compiler's own message
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

if [ $# -gt 1 ]; then
  usage >&2
  exit 1
fi

ask() {
  method="$1"
  path="$2"
  payload="$3"
  body="$(mktemp)"
  errors="$(mktemp)"
  set -- -sS -o "$body" -w '%{http_code}' --max-time "$TIMEOUT" -H "Host: ${VHOST}:${PORT}"
  if [ -n "${NAR_BUILD_LIQUID_HOST:-}" ]; then
    set -- "$@" -H "X-Liquid-Host: ${NAR_BUILD_LIQUID_HOST}"
  fi
  if [ -n "${NAR_BUILD_API_PROBE_VERSION:-}" ]; then
    set -- "$@" -H "X-Nifi-Api-Probe-Version: ${NAR_BUILD_API_PROBE_VERSION}"
  fi
  set -- "$@" -X "$method" --data-binary "$payload" "http://${PROXY}:${PORT}${path}"
  set +e
  code="$(curl "$@" 2>"$errors")"
  curl_status=$?
  set -e

  if [ $curl_status -ne 0 ]; then
    echo "nar-build refused: the builder did not answer at http://${PROXY}:${PORT} (${VHOST})." >&2
    sed 's/^/  /' "$errors" >&2
    echo "The nar_builder service compiles the NAR; nothing here can do it without it." >&2
    echo "Ask the operator to start it: docker compose start nar_builder, or start the" >&2
    echo "whole stack with ./scripts/linux/start.sh, then run nar-build again." >&2
    rm -f "$body" "$errors"
    exit 1
  fi

  if [ "$code" = "200" ]; then
    cat "$body"
    rm -f "$body" "$errors"
    return 0
  fi

  cat "$body" >&2
  rm -f "$body" "$errors"
  exit 1
}

if [ "${1:-}" = "--target" ]; then
  ask GET /target ""
  exit 0
fi

dir="${1:-$PWD}"
if [ ! -d "$dir" ]; then
  echo "nar-build refused: ${dir} is not a directory, so there is no source to build." >&2
  echo "Change into the processor's source directory and run nar-build there, or give it" >&2
  echo "as an argument. Run git-repo-info <repository> to find where a clone is." >&2
  exit 1
fi

resolved="$(cd "$dir" && pwd -P)"
case "$resolved" in
  "${REPOS}"/?*) ;;
  *)
    echo "nar-build refused: ${resolved} is not inside ${REPOS}, and the builder shares only" >&2
    echo "the workspace with this container — it cannot read anything else." >&2
    echo "Work in a clone under ${REPOS} and run nar-build from there." >&2
    echo "Run git-repo-info <repository> to find where a repository's clone is." >&2
    exit 1
    ;;
esac

ask POST /build "${resolved#"${REPOS}"/}"
