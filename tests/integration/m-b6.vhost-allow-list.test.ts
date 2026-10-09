/**
 * M-B6 · Integration · The builder vhost, asked rather than read
 *
 * Purpose:  S3 of the 2026-10-01 review. The vhost carried
 *           `allow SYSTEM_NETWORK_SUBNET; deny all;` and a comment saying "a
 *           browser on the host or the LAN does not" reach it. On rootless Docker
 *           it does: every request through the published proxy port arrives with
 *           `$remote_addr` set to the bridge gateway, and the gateway is *inside*
 *           the subnet being allowed. The reviewer measured a request to
 *           127.0.0.1 and one to the host\u0027s LAN address both logging the
 *           gateway; this file measures the consequence. So any client that could
 *           reach `<host>:8888` and send `X-Liquid-Agent: 1` could start a build
 *           of any path under /repos.
 *
 *           The repair refuses the forwarder\u0027s own address: `deny` the gateway
 *           before the `allow`. Nothing legitimate arrives as the gateway -- an
 *           agent posts to `proxy:8888` from inside its own container, so its
 *           address comes from `SYSTEM_NETWORK_POOL`. The gateway is **computed**
 *           by `start/nginx.sh` as the first host address of
 *           `SYSTEM_NETWORK_SUBNET`, rather than written down a second time: a
 *           value read when it is needed cannot go stale when the subnet changes,
 *           which is what this project asks of a rule that would otherwise have
 *           to be remembered.
 *
 *           **B5-13 is the case that was standing here, and it greps the
 *           template.** A text match cannot tell an allow-list that works from
 *           one that admits the whole LAN, because the defect is not in the text.
 *           It keeps its render assertion; the behaviour is this file\u0027s.
 * Given:    A throwaway network on 10.231.91.0/24 with its gateway at
 *           10.231.91.1, a stub upstream answering on 8770 under the alias
 *           `nar_builder` that compose gives it, and two nginx containers
 *           rendered from the same shape -- one with the `deny` line and one
 *           without, which is the control. Both publish a port on the host.
 * When:     The vhost is asked from the host through a published port, and from a
 *           container on the network, with and without the header.
 * Then:     With the `deny` line the host gets 403 and the container gets 200.
 *           Without it the host gets 200, which is the finding.
 * Covers:   B6-21, NFR1
 * Unhappy:  The 403 is the finding and the 200 from inside is its counterpart:
 *           refusing the gateway must not refuse the agents, or the feature stops
 *           working altogether. The header check is asserted too, because it is
 *           what stops a browser and it must keep doing so.
 *
 * The control is inside the probe rather than in a `git stash`: both readings then
 * come from one run against one network, and a difference cannot be the machine.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const work = mkdtempSync(join(tmpdir(), 'm-b6-vhost-'));
const work2 = mkdtempSync(join(tmpdir(), 'm-b6-vhost-env-'));
const probe = join(work, 'vhost.sh');

// Plain string literals, not a template literal.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "RUN=\"b6s3$$\"",
    "NET=\"${RUN}-net\"",
    "SUBNET=10.231.91.0/24",
    "PINNED=10.231.91.5",
    "# --ip-range so docker allocates from .128 upward and the pinned address below",
    "# it cannot collide -- the first attempt pinned .5 and docker had already given",
    "# it to the fourth container: \"Address already in use\". This is the same",
    "# arrangement compose.yml uses for the stack (ip_range: 10.99.0.128/25).",
    "docker network create --subnet \"$SUBNET\" --ip-range 10.231.91.128/25 \"$NET\" >/dev/null",
    "cleanup() { docker rm -f \"${RUN}-up\" \"${RUN}-with\" \"${RUN}-without\" \"${RUN}-addr\" >/dev/null 2>&1 || true; docker network rm \"$NET\" >/dev/null 2>&1 || true; }",
    "trap cleanup EXIT",
    "mkdir -p \"/tmp/$RUN\"",
    "docker run -d --name \"${RUN}-up\" --network \"$NET\" --network-alias nar_builder \\",
    "  python:3-alpine sh -c \"cd /tmp && printf ok > index.html && python3 -m http.server 8770\" >/dev/null",
    "# What a request through the published port actually arrives as. This is the",
    "# whole reason the finding is host-dependent, so it is measured and printed",
    "# rather than assumed either way.",
    "cat > \"/tmp/$RUN/addr.conf\" <<CONF",
    "server { listen 8888; location / { return 200 \"\\$remote_addr\"; } }",
    "CONF",
    "docker run -d --name \"${RUN}-addr\" --network \"$NET\" -p 18894:8888 \\",
    "  -v \"/tmp/$RUN/addr.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "# Two variants of the real shape: one denying an address that is inside the",
    "# allowed subnet, one not. On rootless Docker the host arrives as the bridge",
    "# gateway, which is such an address; on Docker Desktop it does not. Pinning a",
    "# client to a known in-subnet address asks the same question on every host.",
    "for variant in with without; do",
    "  if [ \"$variant\" = with ]; then guard=\"deny ${PINNED};\"; else guard=\"# no deny\"; fi",
    "  cat > \"/tmp/$RUN/${variant}.conf\" <<CONF",
    "server {",
    "    listen 8888;",
    "    server_name nar-builder.localhost;",
    "    ${guard}",
    "    allow ${SUBNET};",
    "    deny all;",
    "    location / {",
    "        if (\\$http_x_liquid_agent != \"1\") { return 403; }",
    "        proxy_pass http://nar_builder:8770/;",
    "    }",
    "}",
    "CONF",
    "done",
    "docker run -d --name \"${RUN}-with\" --network \"$NET\" -p 18891:8888 \\",
    "  -v \"/tmp/$RUN/with.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "docker run -d --name \"${RUN}-without\" --network \"$NET\" -p 18892:8888 \\",
    "  -v \"/tmp/$RUN/without.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "# Waited on nginx answering, not on a number of seconds.",
    "for i in $(seq 1 60); do",
    "  a=\"$(curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1:18891/ 2>/dev/null)\"",
    "  b=\"$(curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1:18892/ 2>/dev/null)\"",
    "  c=\"$(curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1:18894/ 2>/dev/null)\"",
    "  [ \"$a\" != 000 ] && [ \"$b\" != 000 ] && [ \"$c\" != 000 ] && break",
    "  sleep 0.5",
    "done",
    "echo \"host-arrives-as=$(curl -s http://127.0.0.1:18894/ 2>/dev/null)\"",
    "echo \"network-gateway=$(docker network inspect \"$NET\" --format \"{{(index .IPAM.Config 0).Gateway}}\")\"",
    "hdr=\"X-Liquid-Agent: 1\"",
    "ask() { docker run --rm --network \"$NET\" ${2:-} curlimages/curl:latest -s -o /dev/null -w \"%{http_code}\" -H \"Host: nar-builder.localhost\" -H \"$hdr\" \"http://${RUN}-${1}:8888/\" 2>/dev/null; }",
    "echo \"with-denied-address=$(ask with \"--ip ${PINNED}\")\"",
    "echo \"without-denied-address=$(ask without \"--ip ${PINNED}\")\"",
    "echo \"with-other-address=$(ask with)\"",
    "echo \"with-no-header=$(docker run --rm --network \"$NET\" curlimages/curl:latest -s -o /dev/null -w \"%{http_code}\" -H \"Host: nar-builder.localhost\" \"http://${RUN}-with:8888/\" 2>/dev/null)\"",
    "echo \"from-host-through-port=$(curl -s -o /dev/null -w \"%{http_code}\" -H \"Host: nar-builder.localhost\" -H \"$hdr\" http://127.0.0.1:18891/ 2>/dev/null)\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const r = sh(['sh', probe]);
  out = r.output;
  if (!out.includes('from-host-through-port=')) {
    throw new Error(`the vhost probe did not finish (exit ${r.code}):\n${out}`);
  }
  rmSync(work, { recursive: true, force: true });
}, 900_000);

afterAll(() => rmSync(work2, { recursive: true, force: true }));

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-21 a deny beats the allow for an address inside the allowed subnet', () => {
  test('B6-21 the control: without the deny line that address is let in', () => {
    // This is the finding's mechanism. On rootless Docker the address a request
    // through the published port arrives as *is* such an address -- the bridge
    // gateway, inside the subnet -- so "allow the stack network" allowed the
    // whole LAN.
    expect(field('without-denied-address')).toBe('200');
  });

  test('B6-21 with it, that address is refused', () => {
    expect(field('with-denied-address')).toBe('403');
  });

  test('B6-21 and every other address on the network is not', () => {
    // The counterpart that matters: the gateway is inside the subnet, so a
    // careless deny would refuse every caller the feature exists for.
    expect(field('with-other-address')).toBe('200');
  });

  test('B6-21 and the header is still what a browser cannot send', () => {
    expect(field('with-no-header')).toBe('403');
  });
});

describe('B6-22 the gateway is asked for, not assumed', () => {
  test('B6-22 docker puts it at the start of the ip range, not at the subnet\u0027s .1', () => {
    // The measurement that refuted the first version of this repair. It computed
    // the subnet's first host address -- 10.99.0.1 -- and the operator's running
    // stack reports `subnet=10.99.0.0/24 iprange=10.99.0.128/25
    // gateway=10.99.0.128`, because docker takes the first address of the range
    // it allocates from. A deny on .1 would have been an inert line and S3 would
    // have stayed open behind it.
    expect(field('network-gateway')).toBe('10.231.91.128');
  });

  test('B6-22 and the renderer computes that same address from .env', () => {
    // Computed against what docker actually did, in the same run: the two have to
    // agree, and that is what the first version failed.
    const env = join(work2, 'env');
    writeFileSync(env, 'SYSTEM_NETWORK_SUBNET=10.231.91.0/24\nSYSTEM_NETWORK_POOL=10.231.91.128/25\n');
    const r = sh(['bash', '-c',
      `set -eu
       ENV_FILE=${env}
       NETWORK_SUBNET="$(grep -E '^SYSTEM_NETWORK_SUBNET=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
       eval "$(sed -n '/^# Docker.s own address on this network/,/^fi$/p' ${join(repoRoot, 'config/scripts/start/nginx.sh')})"
       printf '%s' "$NETWORK_GATEWAY"`]);
    expect({ code: r.code, computed: r.stdout }).toEqual({
      code: 0,
      computed: field('network-gateway')
    });
  });

  test('B6-22 the template denies it before it allows the subnet', () => {
    const tpl = readFileSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), 'utf8');
    const renderer = readFileSync(join(repoRoot, 'config/scripts/start/nginx.sh'), 'utf8');
    expect({
      denyBeforeAllow: /deny SYSTEM_NETWORK_GATEWAY;\s*\n\s*allow SYSTEM_NETWORK_SUBNET;/.test(tpl),
      substituted: renderer.includes('SYSTEM_NETWORK_GATEWAY|${NETWORK_GATEWAY}'),
      fromThePool: renderer.includes('NETWORK_GATEWAY="${NETWORK_POOL%%/*}"')
    }).toEqual({ denyBeforeAllow: true, substituted: true, fromThePool: true });
  });
});

describe('B6-23 what a host request arrives as, recorded rather than assumed', () => {
  test('B6-23 it is measured, and on this host it is not the bridge gateway', () => {
    // **The exposure S3 names is host-dependent, and this is the record of it.**
    // On Docker Desktop a request through the published port arrives as the VM's
    // own gateway -- `192.168.65.1` here -- which is outside the stack subnet, so
    // `allow <subnet>; deny all;` already refused it. The reviewer measured
    // rootless Docker on Linux, where it arrives as the bridge gateway and is
    // therefore allowed. The repair is right on both: it costs nothing where the
    // hole does not exist and closes it where it does.
    //
    // **Corrected 2026-10-08.** What stood here was `expect(seen.startsWith(
    // '10.231.91.')).toBe(false)` -- "not inside the subnet" -- and the comment
    // above says in its own words why that is wrong: on rootless Docker on Linux
    // the request arrives AS the bridge gateway, which is inside the subnet. So
    // the assertion was green only on Docker Desktop and would have turned red on
    // the reviewer's own host, the one place this case most needs to be readable.
    // It was a statement about one installation wearing the words of a general
    // property.
    //
    // The assertion is exhaustive over the two readings instead, and in being so
    // it asserts what the repair actually has to achieve: the exposure is closed
    // if the host request arrives either as this network's gateway, which `deny
    // SYSTEM_NETWORK_GATEWAY` refuses, or from outside the subnet, which `deny
    // all` already refused. The one reading that would leave it open is an
    // in-subnet address that is not the gateway -- nothing denies that -- and
    // that is the reading this now rules out.
    const seen = field('host-arrives-as');
    const gateway = field('network-gateway');
    expect(seen).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    const reading =
      seen === gateway ? 'the gateway, which the deny line refuses -- the rootless Linux reading'
      : !seen.startsWith('10.231.91.') ? 'from outside the subnet, which deny all refuses -- the Docker Desktop reading'
      : 'an in-subnet address that is not the gateway, which nothing refuses';
    expect(reading).not.toBe('an in-subnet address that is not the gateway, which nothing refuses');
  });

  test('B6-23 and the vhost refuses it either way', () => {
    expect(field('from-host-through-port')).toBe('403');
  });
});
