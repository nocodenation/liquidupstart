/**
 * M-CS · Integration · No sign-in panel without OpenClaw
 *
 * Purpose:  All four sign-ins run inside the OpenClaw image, and three of them decide
 *           whether one is needed from `volumes/_openclaw/openclaw.json`, not from the
 *           image. So an `openclaw.json` left behind, with a provider switched on, made
 *           their GET answer `needed: true`, and the launchpad offered a sign-in for a
 *           service that is not there -- whose button would then run an image that may be
 *           gone. Decision 1 of #50: no Claude sign-in while OpenClaw is off.
 * Given:    a project of its own, whose `.env` switches every sign-in on and
 *           `volumes/_openclaw/openclaw.json` holds `{}`, so every gate before the new one
 *           passes; the routes `/claude-auth`, `/copilot-auth`, `/codex-auth` and
 *           `/grok-auth`, imported with the project as `ENV_DIR` and called in-process; a
 *           stub `docker` first on `PATH` that logs its arguments and exits 0 for `image
 *           inspect` and 1 for everything else, which reads as "not signed in".
 * When:     Each route is asked GET and POST `{ "action": "start" }` with
 *           `ENABLE_OPENCLAW=0`, and GET with `ENABLE_OPENCLAW=1`.
 * Then:     Off, every GET answers `{ needed: false }` with nothing in the docker log, and
 *           every POST answers 409 naming the switch. On, every GET answers
 *           `{ needed: true }` and the docker log names `liquidupstart/openclaw:latest`.
 * Covers:   CS-15, CS-FR11
 * Negative: with OpenClaw off no route runs a container, whatever `.env` and
 *           `openclaw.json` say about the providers.
 * Counterpart: with it on, the same project asks docker and needs a sign-in, so a route
 *           that always answered `needed: false` cannot pass.
 *
 * Test data: `.env` holds `ENABLE_ANTHROPIC_CLAUDE_CODE=1`, `ENABLE_GITHUB_COPILOT=1`,
 * `ENABLE_OPENAI_CODEX=1`, `ENABLE_XAI_GROK=1`, `CLAUDE_CODE_OAUTH_TOKEN=` (empty), and
 * `ENABLE_OPENCLAW=0` or `1`. `ORIGIN` is `http://dash.example` and the POST carries it.
 * The refusal: `OpenClaw is switched off — turn it on under Which apps to run in
 * Configuration first.` `OPENCLAW_IMAGE` is unset, so the routes name the default image.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROUTES } from '../lib/svelte';

const ORIGIN = 'http://dash.example';
const REFUSAL = 'OpenClaw is switched off — turn it on under Which apps to run in Configuration first.';
const NAMES = ['claude', 'copilot', 'codex', 'grok'];

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lu-cs15-')));
mkdirSync(join(dir, 'volumes', '_openclaw'), { recursive: true });
writeFileSync(join(dir, 'volumes', '_openclaw', 'openclaw.json'), '{}\n');
const bin = join(dir, 'bin');
mkdirSync(bin);
const log = join(dir, 'docker.log');
writeFileSync(
  join(bin, 'docker'),
  `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\n[ "$1 $2" = "image inspect" ] && exit 0\nexit 1\n`
);
chmodSync(join(bin, 'docker'), 0o755);

const saved = { ENV_DIR: process.env.ENV_DIR, ORIGIN: process.env.ORIGIN, PATH: process.env.PATH, OPENCLAW_IMAGE: process.env.OPENCLAW_IMAGE };
process.env.ENV_DIR = dir;
delete process.env.OPENCLAW_IMAGE;
// A query of its own, so this file's import captures this project whatever loaded before.
const routes = Object.fromEntries(
  await Promise.all(NAMES.map(async (n) => [n, await import(`${join(ROUTES, `${n}-auth`, '+server.ts')}?cs15`)]))
);
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

function env(openclaw: '0' | '1') {
  writeFileSync(
    join(dir, '.env'),
    `ENABLE_OPENCLAW=${openclaw}\nENABLE_ANTHROPIC_CLAUDE_CODE=1\nENABLE_GITHUB_COPILOT=1\nENABLE_OPENAI_CODEX=1\nENABLE_XAI_GROK=1\nCLAUDE_CODE_OAUTH_TOKEN=\n`
  );
  rmSync(log, { force: true });
}

async function withStub<T>(fn: () => Promise<T>): Promise<{ value: T; docker: string }> {
  process.env.PATH = `${bin}:${saved.PATH}`;
  process.env.ORIGIN = ORIGIN;
  try {
    const value = await fn();
    return { value, docker: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  } finally {
    process.env.PATH = saved.PATH;
  }
}

const get = (name: string) => withStub(async () => (await routes[name].GET()).json());
const post = (name: string) =>
  withStub(async () => {
    const response: Response = await routes[name].POST({
      request: new Request(`${ORIGIN}/${name}-auth`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      })
    });
    return { status: response.status, text: await response.text() };
  });

describe('CS-15 no sign-in panel without OpenClaw', () => {
  for (const name of NAMES) {
    test(`CS-15 the negative: /${name}-auth GET answers needed: false and runs no container`, async () => {
      env('0');
      const r = await get(name);
      expect(r.value).toEqual({ needed: false });
      expect(r.docker).toBe('');
    });

    test(`CS-15 and /${name}-auth POST answers 409 naming the switch`, async () => {
      env('0');
      const r = await post(name);
      expect(r.value).toEqual({ status: 409, text: REFUSAL });
      expect(r.docker).toBe('');
    });

    test(`CS-15 the counterpart: with OpenClaw on, /${name}-auth asks docker as it does today`, async () => {
      env('1');
      const r = await get(name);
      expect(r.value).toEqual({ needed: true });
      expect(r.docker).toContain('liquidupstart/openclaw:latest');
    });
  }
});
