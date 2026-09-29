/**
 * M-B5 · Integration · Who the build server takes orders from
 *
 * Purpose:  Blocker 6 of the 2026-09-28 review. The builder listens on
 *           `0.0.0.0:8770` and, through nginx, on the proxy port, which is
 *           published on every host interface. It checked neither method nor
 *           origin, and a `text/plain` POST is a CORS "simple request" — no
 *           preflight — so any page the operator had open could start a build
 *           for any path under `/repos`. A build runs the author's own pom with
 *           read-write `/repos`, `/m2` and the live drop directory.
 *
 *           Deploying code into Liquid from any request is the part that is
 *           new; `opencode.localhost` being unauthenticated is not.
 * Given:    `BuildServer.java` from this checkout, compiled and run inside
 *           `liquidupstart/nar-builder:latest` with a stub `/opt/builder/build.sh`
 *           that prints and exits 0, so the calls under test reach the server
 *           and nothing else.
 * When:     `/build` and `/target` are called with and without
 *           `X-Liquid-Agent`, with an `Origin` header, and with GET instead of
 *           POST.
 * Then:     Only the call that looks like this stack's own client is served.
 * Covers:   B5-10, B5-11, B5-12, NFR1
 * Unhappy:  B5-10 and B5-11 are the refusals; B5-12 is the counterpart — the
 *           agent's own request still works, so the guard cannot be met by
 *           refusing everything.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const IMAGE = 'liquidupstart/nar-builder:latest';
const SERVER = join(repoRoot, 'config/nar_builder/BuildServer.java');

let out = '';

beforeAll(() => {
  out = sh([
    'docker', 'run', '--rm',
    '-v', `${SERVER}:/probe/BuildServer.java:ro`,
    '--entrypoint', 'sh', IMAGE, '-c',
    `
    set -e
    mkdir -p /opt/builder
    printf '#!/bin/sh\\necho stub-build\\n' > /opt/builder/build.sh
    chmod +x /opt/builder/build.sh
    javac -d /tmp/cls /probe/BuildServer.java
    NAR_BUILDER_PORT=8771 java -cp /tmp/cls BuildServer >/tmp/server.log 2>&1 &
    for i in $(seq 1 40); do curl -fsS http://127.0.0.1:8771/health >/dev/null 2>&1 && break; sleep 0.25; done
    say() { printf '%s=%s\\n' "$1" "$(shift; curl -s -o /dev/null -w '%{http_code}' "$@")"; }
    say health      http://127.0.0.1:8771/health
    say noHeader    -X POST --data-binary probe http://127.0.0.1:8771/build
    say withOrigin  -X POST -H 'X-Liquid-Agent: 1' -H 'Origin: http://evil.example' --data-binary probe http://127.0.0.1:8771/build
    say getBuild    -X GET  -H 'X-Liquid-Agent: 1' http://127.0.0.1:8771/build
    say agentBuild  -X POST -H 'X-Liquid-Agent: 1' --data-binary probe http://127.0.0.1:8771/build
    say targetNone  http://127.0.0.1:8771/target
    say targetAgent -H 'X-Liquid-Agent: 1' http://127.0.0.1:8771/target
    `
  ]).output;
}, 900_000);

describe('B5-10 a page the operator had open cannot start a build', () => {
  test('B5-10 a request without the agent header is refused', () => {
    expect(out).toContain('noHeader=403');
    expect(out).toContain('targetNone=403');
  });

  test('B5-11 and a request that carries Origin is refused even with the header', () => {
    // Origin is what a browser adds. Whatever else it sends, it is not this
    // stack's client.
    expect(out).toContain('withOrigin=403');
  });

  test('B5-11 and /build takes a POST', () => {
    expect(out).toContain('getBuild=405');
  });
});

describe('B5-12 while the stack\'s own client is served', () => {
  test('B5-12 the counterpart: nar-build\'s request goes through', () => {
    expect(out).toContain('agentBuild=200');
    expect(out).toContain('targetAgent=200');
  });

  test('B5-12 and the healthcheck needs no header', () => {
    // compose calls it with plain curl; it reveals nothing and starts nothing.
    expect(out).toContain('health=200');
  });
});

describe('B5-13 and the vhost is for the stack network', () => {
  test('B5-13 the builder vhost refuses anything off the stack network', () => {
    // The proxy port is published on every host interface, so the vhost was
    // reachable from the host and the LAN. Only agents need it.
    const tpl = readFileSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), 'utf8');
    const block = tpl.split('server {').find((b) => b.includes('nar-builder.localhost')) ?? '';
    expect(block).toContain('allow SYSTEM_NETWORK_SUBNET;');
    expect(block).toContain('deny all;');
  });

  test('B5-13 and the placeholder is actually rendered', () => {
    // A placeholder nobody substitutes is an nginx config that will not load.
    const render = readFileSync(join(repoRoot, 'config/scripts/start/nginx.sh'), 'utf8');
    expect(render).toContain('SYSTEM_NETWORK_SUBNET|${NETWORK_SUBNET}');
    expect(render).toMatch(/NETWORK_SUBNET="\$\{NETWORK_SUBNET:-10\.99\.0\.0\/24\}"/);
  });
});
