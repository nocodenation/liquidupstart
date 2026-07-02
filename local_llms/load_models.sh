#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

expected=$(grep -cE '^[[:space:]]*hf-repo[[:space:]]*=' models.ini)
[ "$expected" -gt 0 ] || { echo "no hf-repo entries in models.ini" >&2; exit 1; }

mkdir -p models

was_up=$(docker compose ps -q llm 2>/dev/null || true)

echo "Fetching $expected model(s) from models.ini into ./models ..."
docker compose up -d

loaded=0
for _ in $(seq 1 360); do
    loaded=$(curl -s localhost:8090/models 2>/dev/null | grep -o '"loaded"' | wc -l)
    [ "$loaded" -ge "$expected" ] && break
    sleep 10
done

if [ -z "$was_up" ]; then
    docker compose down
fi

if [ "$loaded" -ge "$expected" ]; then
    echo "OK: $loaded/$expected model(s) cached ($(du -sh models | cut -f1) in ./models)."
else
    echo "TIMEOUT: only $loaded/$expected model(s) loaded — see: docker compose logs" >&2
    exit 1
fi
