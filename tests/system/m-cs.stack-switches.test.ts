/**
 * M-CS · System · The stack with all three components off, and with all three on
 *
 * Purpose:  The levels below run each part against stubs: the readers, the build, the
 *           start, compose's view of the profiles, nginx on a network of its own. Only the
 *           stack shows that the parts agree when they meet -- that the start activates the
 *           profiles compose then starts, that nginx comes up beside whatever is missing,
 *           and that nothing waits for a sign-in no component can give.
 * Given:    the installation in this checkout: its `.env`, captured and restored whole
 *           through `tests/lib/installation.ts` (A11-9), and its running stack; the build
 *           and start scripts, `./scripts/linux/build.sh` and `./scripts/linux/start.sh`.
 * When:     (a) the three switches are set to `0`, then build and start; the running
 *           containers are listed; `opencode.localhost` and `pgadmin.localhost` are asked
 *           through the published HTTP port; the start's output is read. (b) The switches
 *           go back to `1`, then build, start and ask again. Added on 2026-10-30, for the review
 *           on #56, which found the live coverage narrow: (a) also asks `liquid.localhost` and
 *           `8900.liquid.localhost` over HTTPS and `openclaw.localhost`, all switched off, and
 *           `postgrest.localhost`, whose upstream `postgrest_app` has an underscore and is
 *           always on; (b) also asks `postgrest.localhost` and `liquid.localhost` over HTTPS,
 *           asks `nar-builder.localhost` from a container on the stack network, since the
 *           vhost admits nothing else, and opens a WebSocket on `openclaw.localhost`.
 * Then:     (a) None of `liquid`, `nar_builder`, `openclaw-gateway`, `opencode` runs; `proxy`,
 *           `bun_runner`, `postgres` and `pgadmin` do; `opencode.localhost` answers 502 with
 *           the page naming *Which apps to run*; `pgadmin.localhost` answers with a 2xx or 3xx,
 *           once it has stopped giving the answers of a service that is starting; no
 *           `::aiw-claude-auth-required::` is printed. (b) All eight run, and
 *           `opencode.localhost` and `pgadmin.localhost` answer with a 2xx or 3xx, so
 *           `opencode.localhost` not with that page. Added: (a) `liquid.localhost` answers 502
 *           naming `Liquid does not answer`, `8900.liquid.localhost` 502 naming `port 8900`,
 *           `openclaw.localhost` 502 naming `OpenClaw does not answer`, and `postgrest.localhost`
 *           a 2xx or 3xx. (b) `postgrest.localhost` and `liquid.localhost` a 2xx or 3xx, Liquid
 *           given ten minutes; `nar-builder.localhost` the builder's own answer, any status but
 *           nginx's 502 or 504 and curl's `000`; and the WebSocket `101 Switching Protocols`.
 * Covers:   CS-20, CS-FR3, CS-FR4, CS-FR5, CS-FR6, CS-FR15, CS-NFR1
 * Negative: (a), the stack with nothing switchable in it.
 * Counterpart: (b), the same installation with everything back, so a stack that stayed
 *           without its components after (a) cannot pass.
 * Precondition: the stack tier, `--system`. It writes `.env`, builds images and restarts
 *           the stack of this checkout, and the compose project name is fixed, so it
 *           replaces whatever stack of this project runs on the machine: about two builds
 *           and two starts of time. Run it only where that is meant.
 *
 * Test data: **must not run in (a):** `liquid`, `nar_builder`, `openclaw-gateway`,
 * `opencode`. **Must run in (a):** `proxy`, `bun_runner`, `postgres`, `pgadmin`. The
 * installation's own `.env` otherwise, untouched but for the three switch lines. The page
 * text looked for: `OpenCode does not answer` and `Which apps to run`. HTTPS goes to
 * `SYSTEM_HTTPS_PORT` with `--resolve` to 127.0.0.1 and `-k`, the certificate being the
 * stack's self-signed one. The container that asks `nar-builder.localhost` is `nginx:latest`,
 * which carries curl and which `start.sh` already uses as its probe, on the network `docker
 * inspect proxy` names. The WebSocket request carries `Connection: Upgrade`, `Upgrade:
 * websocket`, `Sec-WebSocket-Version: 13` and the key `dGhlIHNhbXBsZSBub25jZQ==`, RFC 6455's
 * sample nonce, so it is a valid handshake that names nobody. `app.localhost` is not asked:
 * `bun_runner` listens only once an app has been built, which is no part of this case, and
 * CS-10 holds that name.
 */
import { test, expect, describe } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { protect } from '../lib/installation';
import { containerRunning } from '../lib/stack';

const ENV = join(repoRoot, '.env');
const SWITCHED = ['liquid', 'nar_builder', 'openclaw-gateway', 'opencode'];
const ALWAYS = ['proxy', 'bun_runner', 'postgres', 'pgadmin'];
const HOURS = 60 * 60 * 1000;

if (!existsSync(ENV)) {
  throw new Error(`CS-20 runs against the installation in this checkout, and ${ENV} does not exist.`);
}
protect(ENV);

function setSwitches(value: '0' | '1') {
  const keys = ['ENABLE_LIQUID', 'ENABLE_OPENCLAW', 'ENABLE_OPENCODE'];
  let text = readFileSync(ENV, 'utf8');
  for (const key of keys) {
    const line = `${key}=${value}`;
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'gm'), line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(ENV, text);
}

function port(key = 'SYSTEM_HTTP_PORT', fallback = '8888'): string {
  return readFileSync(ENV, 'utf8').match(new RegExp(`^${key}=["']?(\\d+)`, 'm'))?.[1] ?? fallback;
}

type Via = 'http' | 'https' | 'network';
function ask(host: string, via: Via = 'http'): { status: number; code: string; body: string } {
  const out = ['-s', '-m', '10', '-w', '\n%{http_code}'];
  let argv: string[];
  if (via === 'https') {
    const https = port('SYSTEM_HTTPS_PORT', '8833');
    argv = ['curl', ...out, '-k', '--resolve', `${host}:${https}:127.0.0.1`, `https://${host}:${https}/`];
  } else if (via === 'network') {
    const net = sh(['docker', 'inspect', 'proxy', '--format', '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}']).stdout.trim();
    argv = ['docker', 'run', '--rm', '--network', net, 'nginx:latest', 'curl', ...out, '-H', `Host: ${host}`, `http://proxy:${port()}/`];
  } else {
    argv = ['curl', ...out, '-H', `Host: ${host}`, `http://127.0.0.1:${port()}/`];
  }
  const r = sh(argv);
  const lines = r.stdout.split('\n');
  const code = lines.pop() ?? '';
  return { status: Number(code), code, body: lines.join('\n') };
}

// The first line of the answer to a WebSocket handshake. curl holds the upgraded connection
// open until its bound, so the bound ends the call and the status line is what is read.
function upgrade(host: string): string {
  const r = sh([
    'curl', '-s', '-i', '-N', '-m', '5', '--http1.1',
    '-H', 'Connection: Upgrade', '-H', 'Upgrade: websocket',
    '-H', 'Sec-WebSocket-Version: 13', '-H', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    '-H', `Host: ${host}`, `http://127.0.0.1:${port()}/`
  ]);
  return r.stdout.split('\r\n')[0].trim();
}

// A service that has just been started may not listen yet, and nginx answers 502 for it
// until it does -- which is right, and would make a case that asked once flaky. So while the
// answer is one a starting service gives -- no connection, which curl reports as 000, or a
// 502, 503 or 504 -- it is asked again, up to 60 times two seconds apart, each ask bounded at
// ten seconds. Then it has to be a 2xx or a 3xx. Merely "not 502", as this asked at first,
// would have let a refused connection through (found by reading, after the first run). The
// result names the host and the last code, so a failure reads on its own.
const OK = (status: number) => status >= 200 && status < 400;
const STARTING = (status: number) => status === 0 || status === 502 || status === 503 || status === 504;
function settled(host: string, via: Via = 'http', tries = 60): { status: number; code: string; body: string } {
  let r = ask(host, via);
  for (let i = 0; i < tries && STARTING(r.status); i++) {
    Bun.sleepSync(2000);
    r = ask(host, via);
  }
  return r;
}
function answered(host: string, via: Via = 'http', tries = 60): string {
  const r = settled(host, via, tries);
  return `${host} answered ${OK(r.status) ? '2xx or 3xx' : r.code}`;
}
// The upstream's own answer, whatever it is: anything but what nginx or curl say for an
// upstream that is not reached.
function reached(host: string, via: Via): string {
  const r = settled(host, via);
  return `${host} ${STARTING(r.status) ? `not reached: ${r.code}` : 'reached'}`;
}
function page(host: string, via: Via, text: string): string {
  const r = ask(host, via);
  return `${host} ${r.status} ${r.body.includes(text) && r.body.includes('Which apps to run') ? 'page' : 'no page'}`;
}

function buildAndStart() {
  const build = sh(['./scripts/linux/build.sh'], repoRoot, {}, 2 * HOURS);
  expect(build.code, build.output.slice(-4000)).toBe(0);
  const start = sh(['./scripts/linux/start.sh'], repoRoot, {}, HOURS);
  expect(start.code, start.output.slice(-4000)).toBe(0);
  return start;
}

describe('CS-20 the stack, all off and all on', () => {
  test('CS-20 the negative: all three off runs none of the four, and nginx answers', () => {
    setSwitches('0');
    const start = buildAndStart();
    for (const name of SWITCHED) expect(`${name} running: ${containerRunning(name)}`).toBe(`${name} running: false`);
    for (const name of ALWAYS) expect(`${name} running: ${containerRunning(name)}`).toBe(`${name} running: true`);
    const off = ask('opencode.localhost');
    expect(off.status).toBe(502);
    expect(off.body).toContain('OpenCode does not answer');
    expect(off.body).toContain('Which apps to run');
    expect(answered('pgadmin.localhost')).toBe('pgadmin.localhost answered 2xx or 3xx');
    expect(start.output).not.toContain('::aiw-claude-auth-required::');
    expect(page('liquid.localhost', 'https', 'Liquid does not answer')).toBe('liquid.localhost 502 page');
    expect(page('8900.liquid.localhost', 'https', 'Liquid does not answer on port 8900')).toBe('8900.liquid.localhost 502 page');
    expect(page('openclaw.localhost', 'http', 'OpenClaw does not answer')).toBe('openclaw.localhost 502 page');
    expect(answered('postgrest.localhost')).toBe('postgrest.localhost answered 2xx or 3xx');
  }, 3 * HOURS);

  test('CS-20 the counterpart: all three on runs as today', () => {
    setSwitches('1');
    buildAndStart();
    for (const name of [...SWITCHED, ...ALWAYS]) {
      expect(`${name} running: ${containerRunning(name)}`).toBe(`${name} running: true`);
    }
    // A 2xx or 3xx cannot be the page, which nginx serves only as its own 502.
    expect(answered('opencode.localhost')).toBe('opencode.localhost answered 2xx or 3xx');
    expect(answered('pgadmin.localhost')).toBe('pgadmin.localhost answered 2xx or 3xx');
    expect(answered('postgrest.localhost')).toBe('postgrest.localhost answered 2xx or 3xx');
    expect(answered('liquid.localhost', 'https', 300)).toBe('liquid.localhost answered 2xx or 3xx');
    expect(reached('nar-builder.localhost', 'network')).toBe('nar-builder.localhost reached');
    expect(upgrade('openclaw.localhost')).toBe('HTTP/1.1 101 Switching Protocols');
  }, 3 * HOURS);
});
