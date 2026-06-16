#!/usr/bin/env sh

mkdir -p /bun_app
mkdir -p /build_info
mkdir -p /logs

cd /bun_app

while [ ! -f /bun_app/package.json ]; do
  sleep 5s
done

install_and_build() {
  bun install >> /logs/install.log 2>&1
  bun run build >> /logs/build.log 2>&1
  cp /bun_app/package.json /build_info/package.json
}

if [ ! -f /build_info/package.json ] || ! cmp -s /build_info/package.json /bun_app/package.json; then
  install_and_build
fi

PORT=3000 bun start >> /logs/start.log 2>&1 &
APP_PID=$!

trap 'kill $APP_PID; exit' TERM INT

while true; do
  sleep 5s
  if [ -f /bun_app/package.json ] && ! cmp -s /build_info/package.json /bun_app/package.json; then
    kill $APP_PID 2>/dev/null
    wait $APP_PID 2>/dev/null
    install_and_build
    PORT=3000 bun start >> /logs/start.log 2>&1 &
    APP_PID=$!
  fi
done
