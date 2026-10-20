#!/usr/bin/env bash
# Which source address does nginx see, by route?
#
# A documented manual check. N3 of the 2026-10-13 re-review: the readings in
# `BACKLOG.md` under *`operator.admin` is reachable from any container on the
# stack network* were prose -- no commands, no config, no capture -- so nobody
# could repeat them, and N2 showed what an unlisted route can change.
#
# The question it answers is the one the planned identity rule rests on: can
# nginx tell the operator's own browser from a container on the stack network?
# Run it on each host whose combination is still missing -- rootless and rootful,
# Linux and macOS -- and paste the table into the entry beside the others.
#
#   ./tests/verify/address-routes.sh            all-interfaces publish
#   ./tests/verify/address-routes.sh --loopback also bind one to 127.0.0.1
#
# It creates a throwaway network, a throwaway nginx and nothing else, and removes
# both afterwards. It does not touch the stack, `./volumes/`, or any published
# port the stack uses.
set -euo pipefail

PORT_ALL=18999
PORT_LOOP=18998
NET=addr-probe-net
NGINX=addr-probe-nginx
CLIENT_IMAGE=curlimages/curl:latest
WITH_LOOPBACK=0
[ "${1:-}" = "--loopback" ] && WITH_LOOPBACK=1

cleanup() {
  docker rm -f "$NGINX" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The stack's own shape: a /24 with the upper /25 as the dynamic pool and no
# explicit gateway, which is what compose.yml declares. Reproduced here so the
# reading is about the stack's network and not about docker's defaults.
docker network create --subnet 10.77.5.0/24 --ip-range 10.77.5.128/25 "$NET" >/dev/null

conf=$(mktemp)
cat > "$conf" <<'NGINXCONF'
server {
  listen 80 default_server;
  location / { default_type text/plain; return 200 "$remote_addr\n"; }
}
NGINXCONF

publish=(-p "${PORT_ALL}:80")
[ "$WITH_LOOPBACK" = 1 ] && publish+=(-p "127.0.0.1:${PORT_LOOP}:80")
docker run -d --name "$NGINX" --network "$NET" \
  "${publish[@]}" -v "$conf:/etc/nginx/conf.d/default.conf:ro" nginx:latest >/dev/null
sleep 2

lan=""
if command -v ipconfig >/dev/null 2>&1; then
  lan=$(ipconfig getifaddr en0 2>/dev/null || true)
fi
[ -z "$lan" ] && lan=$(hostname -I 2>/dev/null | awk '{print $1}')
gw=$(docker network inspect "$NET" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
nginx_ip=$(docker inspect "$NGINX" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$v.IPAddress}}{{end}}')

say() { printf '  %-58s %s\n' "$1" "$2"; }
from_host() { curl -fsS --max-time 8 "$1" 2>/dev/null || echo "(no answer)"; }
from_net()  { docker run --rm --network "$1" "$CLIENT_IMAGE" -fsS --max-time 8 "$2" 2>/dev/null || echo "(no answer)"; }

echo "host: $(uname -s)  docker: $(docker version --format '{{.Server.Version}}')"
echo "rootless: $(docker info --format '{{json .SecurityOptions}}' | grep -c rootless || true)   network gateway: ${gw}   nginx: ${nginx_ip}   lan: ${lan:-unknown}"
echo "client -> target                                           \$remote_addr nginx saw"
say "host -> 127.0.0.1:${PORT_ALL}"                  "$(from_host "http://127.0.0.1:${PORT_ALL}/")"
[ -n "$lan" ] && say "host -> lan ${lan}:${PORT_ALL}" "$(from_host "http://${lan}:${PORT_ALL}/")"
say "stack-network container -> nginx directly"      "$(from_net "$NET" "http://${nginx_ip}/")"
[ -n "$lan" ] && say "stack-network container -> lan ${lan}:${PORT_ALL}" "$(from_net "$NET" "http://${lan}:${PORT_ALL}/")"
say "unrelated-network container -> lan:${PORT_ALL}" "$([ -n "$lan" ] && from_net bridge "http://${lan}:${PORT_ALL}/" || echo '(no lan)')"
say "stack-network container -> gateway ${gw}:${PORT_ALL}" "$(from_net "$NET" "http://${gw}:${PORT_ALL}/")"
if [ "$WITH_LOOPBACK" = 1 ]; then
  say "host -> 127.0.0.1:${PORT_LOOP} (loopback-bound)" "$(from_host "http://127.0.0.1:${PORT_LOOP}/")"
  [ -n "$lan" ] && say "stack-network container -> lan:${PORT_LOOP} (loopback-bound)" "$(from_net "$NET" "http://${lan}:${PORT_LOOP}/")"
fi
rm -f "$conf"
