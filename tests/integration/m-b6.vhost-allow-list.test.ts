/**
 * M-B6 · Integration · The builder vhost, asked rather than read
 *
 * Purpose:  S3 of the 2026-10-01 review. The vhost carried
 *           `allow SYSTEM_NETWORK_SUBNET; deny all;` and a comment saying "a
 *           browser on the host or the LAN does not" reach it. On rootless Docker
 *           it does: every request through the published proxy port arrives with
 *           `$remote_addr` set to the bridge gateway, and the gateway is *inside*
 *           the subnet being allowed. The reviewer measured a request to
 *           127.0.0.1 and one to the host's LAN address both logging the
 *           gateway; this file measures the consequence. So any client that could
 *           reach `<host>:8888` and send `X-Liquid-Agent: 1` could start a build
 *           of any path under /repos.
 *
 *           The repair refuses the forwarder's own address: `deny` the gateway
 *           before the `allow`. Nothing legitimate arrives as the gateway -- an
 *           agent posts to `proxy:8888` from inside its own container, so its
 *           address comes from `SYSTEM_NETWORK_POOL`. The gateway is **computed**
 *           by `start/nginx.sh` as the first address of `SYSTEM_NETWORK_POOL`,
 *           rather than written down a second time: a value read when it is
 *           needed cannot go stale when the subnet changes, which is what this
 *           project asks of a rule that would otherwise have to be remembered.
 *
 *           **B5-13 is the case that was standing here, and it greps the
 *           template.** A text match cannot tell an allow-list that works from
 *           one that admits the whole LAN, because the defect is not in the text.
 *           It keeps its render assertion; the behaviour is this file's.
 *
 *           **B6-23 asks the product's own block since 2026-11-06 (#57).** Until
 *           then it asked a hand-written variant that denied the pinned address
 *           B6-21 uses, not the gateway, and was red on rootless Docker while the
 *           product was closed. The block is cut from the template and rendered
 *           with the gateway `start/nginx.sh`'s own lines compute, so the line
 *           under test is the line that ships; the cut is asserted to be one
 *           block, carrying the rendered deny and no placeholder, before it is
 *           asked anything.
 * Given:    A throwaway network on 10.231.91.0/24 with --ip-range
 *           10.231.91.128/25, whose gateway docker puts at 10.231.91.128, the
 *           start of the range; a stub upstream answering on 8770 under the alias
 *           `nar_builder` that compose gives it; an nginx answering with the
 *           address a request arrives as; two nginx containers from one
 *           hand-written shape -- one denying the pinned address 10.231.91.5 and
 *           one not, which is B6-21's control; and two from the product's own
 *           `nar-builder.localhost` block, rendered as `start/nginx.sh` renders
 *           it -- one as shipped and one with its `deny` line removed, which is
 *           B6-23's control. Every one of them publishes a port on the host. On
 *           the TypeScript side, the template's text and `start/nginx.sh`'s
 *           gateway lines, read from the tree.
 * When:     The vhosts are asked from the host through their published ports and
 *           from containers on the network, every request carrying
 *           `X-Liquid-Agent: 1`; the pinned pair from 10.231.91.5 and from a
 *           pool address, the product pair from the host and from a pool address.
 *           Docker is asked for the network's gateway, `start/nginx.sh`'s own
 *           lines for the one they compute from the same subnet and pool, and the
 *           template's text whether `deny SYSTEM_NETWORK_GATEWAY;` stands as a
 *           whole line directly before `allow SYSTEM_NETWORK_SUBNET;` -- once as
 *           it is, and once with that line commented out.
 * Then:     The product block refuses the host (403) and admits the container
 *           (200). Without its `deny` line the host is admitted where it arrives
 *           as the gateway, which is the finding, and still refused where it
 *           arrives from outside the subnet, which the control records rather
 *           than assumes. The pinned pair shows the deny beating the allow: 403
 *           with the line, 200 without, and 200 for every other address. Docker
 *           reports 10.231.91.128 and `start/nginx.sh` computes the same; the
 *           template's text passes the anchored check as it is, and the text with
 *           the line commented out does not, while the unanchored expression this
 *           replaces still accepts it.
 * Covers:   B6-21, B6-22, B6-23, NFR1
 * Unhappy:  The 403 is the finding and the 200 from inside is its counterpart:
 *           refusing the gateway must not refuse the agents, or the feature stops
 *           working altogether. The header is not asked here: the vhost never
 *           held it, `BuildServer.fromAnAgent` does, and B5-10 holds that.
 *
 * The controls are inside the probe rather than in a `git stash`: both readings
 * then come from one run against one network, and a difference cannot be the
 * machine. What a host request arrives as is host-dependent -- the gateway on
 * rootless Docker, 192.168.65.1 on Docker Desktop -- so it is measured and
 * printed, and B6-23's control computes its expectation from that measurement.
 * The probe writes under /tmp/$RUN and its traps remove that directory with the
 * containers and the network: on exit, and on INT, TERM and PIPE, which dash
 * does not route through the EXIT trap by itself. The script the test writes
 * is removed once the probe has returned, whatever it returned, and a TERM or
 * INT sent to bun while the probe runs is passed on to the probe before bun
 * exits with the signal's code. So a run leaves nothing on the machine (M-A11),
 * measured 2026-11-06 for a finished run, a probe interrupted by either signal,
 * a Ctrl-C of bun's process group, and a TERM or INT to bun alone. The limit is
 * a KILL of bun: the probe, writing to the closed pipe, still exits through its
 * PIPE trap and takes the containers, the network and /tmp/$RUN with it, and
 * the one-file $TMPDIR/m-b6-vhost-* directory is what remains.
 */
import { test, expect, describe, beforeAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const work = mkdtempSync(join(tmpdir(), 'm-b6-vhost-'));
const probe = join(work, 'vhost.sh');
const TEMPLATE = join(repoRoot, 'config/nginx/templates/nginx.conf');
const RENDERER = join(repoRoot, 'config/scripts/start/nginx.sh');

// Anchored to a line start: the unanchored expression this replaces was
// satisfied by `    # deny SYSTEM_NETWORK_GATEWAY;` (#57).
const DENY_BEFORE_ALLOW = /^\s*deny SYSTEM_NETWORK_GATEWAY;\s*\n\s*allow SYSTEM_NETWORK_SUBNET;/m;

// Plain string literals, not a template literal. $1 is the template, $2 the
// gateway start/nginx.sh's own lines computed for the probe's subnet and pool.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "TEMPLATE=\"$1\"",
    "GATEWAY=\"$2\"",
    "RUN=\"b6s3$$\"",
    "NET=\"${RUN}-net\"",
    "SUBNET=10.231.91.0/24",
    "PINNED=10.231.91.5",
    "# --ip-range so docker allocates from .128 upward and the pinned address below",
    "# it cannot collide -- the first attempt pinned .5 and docker had already given",
    "# it to the fourth container: \"Address already in use\". This is the same",
    "# arrangement compose.yml uses for the stack (ip_range: 10.99.0.128/25), and",
    "# it is what puts the gateway at .128 rather than .1.",
    "docker network create --subnet \"$SUBNET\" --ip-range 10.231.91.128/25 \"$NET\" >/dev/null",
    "cleanup() {",
    "  docker rm -f \"${RUN}-up\" \"${RUN}-with\" \"${RUN}-without\" \"${RUN}-addr\" \"${RUN}-product\" \"${RUN}-reverted\" >/dev/null 2>&1 || true",
    "  docker network rm \"$NET\" >/dev/null 2>&1 || true",
    "  rm -rf \"/tmp/$RUN\"",
    "}",
    "trap cleanup EXIT",
    "# dash runs the EXIT trap on exit, not on a signal: without these an interrupted",
    "# run left the six containers, the network and /tmp/$RUN behind, and so did a",
    "# run whose reader had gone, dying of SIGPIPE at its next echo (#57).",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    "trap 'exit 141' PIPE",
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
    "# Two hand-written variants of the shape: one denying an address that is inside",
    "# the allowed subnet, one not. The gateway cannot be pinned to a container, so",
    "# pinning a client to a known in-subnet address is the one way to ask on every",
    "# host whether a deny beats the allow.",
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
    "        proxy_pass http://nar_builder:8770/;",
    "    }",
    "}",
    "CONF",
    "done",
    "# The product's own block, cut from the template by its server_name and given",
    "# three of the five substitutions start/nginx.sh performs, in its order. The",
    "# resolver line is the template's http-level one, which the cut does not reach:",
    "# proxy_pass with a variable resolves per request and only through it.",
    "{",
    "  echo \"resolver 127.0.0.11 valid=10s ipv6=off;\"",
    "  awk '/^server \\{/{b=\"\";i=1} i{b=b $0 \"\\n\"} i&&/^\\}/{if (b ~ /server_name nar-builder\\.localhost;/) printf \"%s\", b; i=0}' \"$TEMPLATE\" \\",
    "    | sed -e \"s|SYSTEM_HTTP_PORT|8888|g\" -e \"s|SYSTEM_NETWORK_GATEWAY|${GATEWAY}|g\" -e \"s|SYSTEM_NETWORK_SUBNET|${SUBNET}|g\"",
    "} > \"/tmp/$RUN/product.conf\"",
    "grep -v \"deny ${GATEWAY};\" \"/tmp/$RUN/product.conf\" > \"/tmp/$RUN/reverted.conf\"",
    "docker run -d --name \"${RUN}-with\" --network \"$NET\" -p 18891:8888 \\",
    "  -v \"/tmp/$RUN/with.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "docker run -d --name \"${RUN}-without\" --network \"$NET\" -p 18892:8888 \\",
    "  -v \"/tmp/$RUN/without.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "docker run -d --name \"${RUN}-product\" --network \"$NET\" -p 18895:8888 \\",
    "  -v \"/tmp/$RUN/product.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "docker run -d --name \"${RUN}-reverted\" --network \"$NET\" -p 18896:8888 \\",
    "  -v \"/tmp/$RUN/reverted.conf:/etc/nginx/conf.d/default.conf:ro\" nginx:alpine >/dev/null",
    "# Waited on nginx answering, not on a number of seconds.",
    "for i in $(seq 1 60); do",
    "  ready=1",
    "  for port in 18891 18892 18894 18895 18896; do",
    "    [ \"$(curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1:${port}/ 2>/dev/null)\" != 000 ] || ready=0",
    "  done",
    "  [ \"$ready\" = 1 ] && break",
    "  sleep 0.5",
    "done",
    "echo \"host-arrives-as=$(curl -s http://127.0.0.1:18894/ 2>/dev/null)\"",
    "echo \"network-gateway=$(docker network inspect \"$NET\" --format \"{{(index .IPAM.Config 0).Gateway}}\")\"",
    "# The cut, guarded before it is asked anything: one block, the rendered deny",
    "# line, and no placeholder outside a comment.",
    "echo \"product-blocks=$(grep -c '^server {' \"/tmp/$RUN/product.conf\")\"",
    "echo \"product-deny-line=$(grep -cx \"    deny ${GATEWAY};\" \"/tmp/$RUN/product.conf\")\"",
    "echo \"product-placeholders=$(grep -v '^[[:blank:]]*#' \"/tmp/$RUN/product.conf\" | grep -o 'SYSTEM_' | wc -l | tr -d ' ')\"",
    "hdr=\"X-Liquid-Agent: 1\"",
    "ask() { docker run --rm --network \"$NET\" ${2:-} curlimages/curl:latest -s -o /dev/null -w \"%{http_code}\" -H \"Host: nar-builder.localhost\" -H \"$hdr\" \"http://${RUN}-${1}:8888/\" 2>/dev/null; }",
    "from_host() { curl -s -o /dev/null -w \"%{http_code}\" -H \"Host: nar-builder.localhost\" -H \"$hdr\" \"http://127.0.0.1:${1}/\" 2>/dev/null; }",
    "echo \"with-denied-address=$(ask with \"--ip ${PINNED}\")\"",
    "echo \"without-denied-address=$(ask without \"--ip ${PINNED}\")\"",
    "echo \"with-other-address=$(ask with)\"",
    "echo \"product-from-host=$(from_host 18895)\"",
    "echo \"reverted-from-host=$(from_host 18896)\"",
    "# Last, so it is the marker beforeAll waits for.",
    "echo \"product-from-agent=$(ask product)\"",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

// The gateway start/nginx.sh's own lines compute for the probe's subnet and
// pool, evaluated the way B6-22 asserts it. This is the only way it reaches the
// probe.
const computeGateway = () => {
  const work2 = mkdtempSync(join(tmpdir(), 'm-b6-vhost-env-'));
  const env = join(work2, 'env');
  writeFileSync(env, 'SYSTEM_NETWORK_SUBNET=10.231.91.0/24\nSYSTEM_NETWORK_POOL=10.231.91.128/25\n');
  try {
    return sh(['bash', '-c',
      `set -eu
       ENV_FILE=${env}
       NETWORK_SUBNET="$(grep -E '^SYSTEM_NETWORK_SUBNET=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
       eval "$(sed -n '/^# Docker.s own address on this network/,/^fi$/p' ${RENDERER})"
       printf '%s' "$NETWORK_GATEWAY"`]);
  } finally {
    rmSync(work2, { recursive: true, force: true });
  }
};

let out = '';
let gateway = { code: -1, stdout: '' };
beforeAll(async () => {
  gateway = computeGateway();
  // Spawned, not spawnSync: a TERM or INT sent to bun alone while the probe runs
  // is passed on to the probe, whose trap cleans up, and bun then exits as the
  // default disposition would have. With spawnSync bun either died at once,
  // leaving the script and an orphaned probe, or held the signal until the
  // file had run and dropped it (measured, bun 1.4.2, #57).
  const p = Bun.spawn(['sh', probe, TEMPLATE, gateway.stdout], { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' });
  const onSignal = (sig: 'SIGTERM' | 'SIGINT') => {
    p.kill(sig);
    p.exited.then(() => {
      rmSync(work, { recursive: true, force: true });
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  };
  const onTerm = () => onSignal('SIGTERM');
  const onInt = () => onSignal('SIGINT');
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  let r;
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited
    ]);
    r = { code, output: stdout + stderr };
  } finally {
    process.off('SIGTERM', onTerm);
    process.off('SIGINT', onInt);
    // Before the throw below, which left vhost.sh behind after a failed probe.
    rmSync(work, { recursive: true, force: true });
  }
  out = r.output;
  if (!out.includes('product-from-agent=')) {
    throw new Error(`the vhost probe did not finish (exit ${r.code}):\n${out}`);
  }
}, 900_000);

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
    expect({ code: gateway.code, computed: gateway.stdout }).toEqual({
      code: 0,
      computed: field('network-gateway')
    });
  });

  test('B6-22 the template denies it before it allows the subnet', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8');
    const renderer = readFileSync(RENDERER, 'utf8');
    expect({
      denyBeforeAllow: DENY_BEFORE_ALLOW.test(tpl),
      substituted: renderer.includes('SYSTEM_NETWORK_GATEWAY|${NETWORK_GATEWAY}'),
      fromThePool: renderer.includes('NETWORK_GATEWAY="${NETWORK_POOL%%/*}"')
    }).toEqual({ denyBeforeAllow: true, substituted: true, fromThePool: true });
  });

  test('B6-22 the negative: the line commented out does not satisfy it', () => {
    // The edit a reverted repair would most plausibly be: the line kept, commented
    // out. The unanchored expression this file carried accepted it (#57).
    const tpl = readFileSync(TEMPLATE, 'utf8');
    const edited = tpl.replace('    deny SYSTEM_NETWORK_GATEWAY;', '    # deny SYSTEM_NETWORK_GATEWAY;');
    expect({
      changed: edited !== tpl,
      anchored: DENY_BEFORE_ALLOW.test(edited),
      unanchored: /deny SYSTEM_NETWORK_GATEWAY;\s*\n\s*allow SYSTEM_NETWORK_SUBNET;/.test(edited)
    }).toEqual({ changed: true, anchored: false, unanchored: true });
  });
});

describe('B6-23 the product block, and what a host request arrives as', () => {
  test('B6-23 it is measured, and it is the gateway or an address outside the subnet', () => {
    // The exposure S3 names is host-dependent, and this is the record of it. On
    // Docker Desktop a request through the published port arrives as the VM's
    // own gateway -- `192.168.65.1` -- outside the stack subnet, which `deny all`
    // refuses. On rootless Docker on Linux it arrives as the bridge gateway,
    // inside the subnet, which `deny SYSTEM_NETWORK_GATEWAY` refuses. The one
    // reading that would leave the exposure open is an in-subnet address that is
    // not the gateway, and that is the reading ruled out.
    const seen = field('host-arrives-as');
    const gw = field('network-gateway');
    expect(seen).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    const reading =
      seen === gw ? 'the gateway, which the deny line refuses -- the rootless Linux reading'
      : !seen.startsWith('10.231.91.') ? 'from outside the subnet, which deny all refuses -- the Docker Desktop reading'
      : 'an in-subnet address that is not the gateway, which nothing refuses';
    expect(reading).not.toBe('an in-subnet address that is not the gateway, which nothing refuses');
  });

  test('B6-23 the cut is one block, carrying the rendered deny and no placeholder', () => {
    // A template that moves, a second block with that server_name, a placeholder
    // the three substitutions miss, or a deny line that is not the rendered one
    // each fail here by name, not as a wrong 403.
    expect({
      blocks: field('product-blocks'),
      denyLine: field('product-deny-line'),
      placeholders: field('product-placeholders')
    }).toEqual({ blocks: '1', denyLine: '1', placeholders: '0' });
  });

  test('B6-23 and the vhost refuses it either way', () => {
    // By `deny <gateway>;` on rootless Docker, by `deny all;` on Docker Desktop.
    expect(field('product-from-host')).toBe('403');
  });

  test('B6-23 the control: without the gateway deny, the host is let in where it arrives as the gateway', () => {
    // The same block minus its deny line, in the same run against the same
    // network. Only the arm where the host arrives as the gateway exercises the
    // deny; the arm taken is asserted beside the value so the record says which.
    const arm = field('host-arrives-as') === field('network-gateway')
      ? 'the host arrives as the gateway: admitted without the deny line'
      : 'the host arrives from outside the subnet: refused by deny all either way';
    expect({ arm, reverted: field('reverted-from-host') }).toEqual({
      arm,
      reverted: arm.startsWith('the host arrives as the gateway') ? '200' : '403'
    });
  });

  test('B6-23 and the shipped block still lets an agent in', () => {
    // Refusing the gateway must not refuse the agents.
    expect(field('product-from-agent')).toBe('200');
  });
});
