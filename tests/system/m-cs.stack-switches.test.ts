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
 *           go back to `1`, then build, start and ask again.
 * Then:     (a) None of `liquid`, `nar_builder`, `openclaw-gateway`, `opencode` runs; `proxy`,
 *           `bun_runner`, `postgres` and `pgadmin` do; `opencode.localhost` answers 502 with
 *           the page naming *Which apps to run*; `pgadmin.localhost` answers as it does on
 *           `main`, not with a 502; no `::aiw-claude-auth-required::` is printed. (b) All
 *           eight run, and `opencode.localhost` no longer answers with that page.
 * Covers:   CS-20, CS-FR3, CS-FR4, CS-FR5, CS-FR6, CS-NFR1
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
 * text looked for: `OpenCode does not answer` and `Which apps to run`.
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

function port(): string {
  return readFileSync(ENV, 'utf8').match(/^SYSTEM_HTTP_PORT=["']?(\d+)/m)?.[1] ?? '8888';
}

function ask(host: string): { status: number; body: string } {
  const r = sh(['curl', '-s', '-m', '10', '-w', '\n%{http_code}', '-H', `Host: ${host}`, `http://127.0.0.1:${port()}/`]);
  const lines = r.stdout.split('\n');
  return { status: Number(lines.pop()), body: lines.join('\n') };
}

// A service that has just been started may not listen yet, and nginx answers 502 for it
// until it does -- which is right, and would make a case that asked once flaky. So a
// service that is meant to answer gets two minutes to.
function askUntilAnswered(host: string): { status: number; body: string } {
  let r = ask(host);
  for (let i = 0; i < 60 && (r.status === 502 || r.status === 0); i++) {
    Bun.sleepSync(2000);
    r = ask(host);
  }
  return r;
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
    expect(askUntilAnswered('pgadmin.localhost').status).not.toBe(502);
    expect(start.output).not.toContain('::aiw-claude-auth-required::');
  }, 3 * HOURS);

  test('CS-20 the counterpart: all three on runs as today', () => {
    setSwitches('1');
    buildAndStart();
    for (const name of [...SWITCHED, ...ALWAYS]) {
      expect(`${name} running: ${containerRunning(name)}`).toBe(`${name} running: true`);
    }
    expect(askUntilAnswered('opencode.localhost').body).not.toContain('Which apps to run');
  }, 3 * HOURS);
});
