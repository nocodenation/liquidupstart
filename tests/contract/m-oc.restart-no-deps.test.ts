/**
 * OC-34 — a restart in the start path does not drag its dependants along.
 *
 * Purpose: `docker compose restart <service>` restarts that service's
 * dependants from Compose v2.20 on; `--no-deps` is the opt-out. `proxy`
 * declares `depends_on: openclaw-gateway`, so narrowing the trusted proxies
 * bounced nginx, and the `nginx -s reload` on the next line ran against a proxy
 * that was still coming back — swallowed by `|| true`, two lines before the URL
 * table is printed and the dashboard reports success.
 *
 * Given  the start scripts as text
 * When   every `docker compose restart` in them is examined
 * Then   each carries `--no-deps`, or is named here as a deliberate exception
 *        with the reason its dependants should come along
 *
 * Measured on 2026-09-10, before the repair: after a clean start, `postgres` and
 * `liquid` were started at 08:16:13, `proxy` at 08:17:13 and `openclaw-gateway`
 * at 08:17:16. The proxy restarted a minute after the stack came up and three
 * seconds *before* the gateway it was a bystander to — Compose restarts
 * dependants first.
 *
 * The repair for F2 removes the only offending call, so this case has nothing
 * left to catch in that block. It stays because it is about the shape of every
 * restart in the start path rather than about that one, and the next one will be
 * written by somebody who does not know this happened.
 *
 * `docker restart <container>` is permitted: it addresses one container and
 * knows nothing of `depends_on`. The exception list is the positive half — a
 * restart that should take its dependants along is allowed and must say so,
 * otherwise this reads as a ban rather than as a decision.
 *
 * Requirements covered: OC-G3, F7 of the #11 review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const FILES = [
  'scripts/linux/start.sh',
  ...readdirSync(join(repoRoot, 'config/scripts/start'))
    .filter((f) => f.endsWith('.sh'))
    .map((f) => `config/scripts/start/${f}`)
];

/** Restarts that should take their dependants with them, each with the reason. */
const ALLOWED_WITH_DEPS: { match: string; why: string }[] = [];

function composeRestarts(): { file: string; line: number; text: string }[] {
  return FILES.flatMap((file) =>
    readFileSync(join(repoRoot, file), 'utf8')
      .split('\n')
      .map((text, i) => ({ file, line: i + 1, text }))
      .filter(({ text }) => /docker compose restart\b/.test(text))
      // Comments in three flavours, because this file embeds a node program in a
      // shell script: `#` for the shell, `//` and ` * ` for the JavaScript. On
      // 2026-09-10 the case went red over a sentence explaining a different
      // finding — prose read as an invocation. A scan that cannot tell code from
      // the text about code reports its own documentation.
      .filter(({ text }) => !/^\s*(#|\/\/|\*)/.test(text))
  );
}

describe('OC-34 no restart in the start path takes its dependants along', () => {
  test('the scan reaches the files it is meant to', () => {
    // Guard against the case passing because a rename emptied the file list.
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES).toContain('config/scripts/start/openclaw.sh');
  });

  test('each compose restart carries --no-deps, or is a named exception', () => {
    const offenders = composeRestarts()
      .filter(({ text }) => !text.includes('--no-deps'))
      .filter(({ text }) => !ALLOWED_WITH_DEPS.some((e) => text.includes(e.match)))
      .map(({ file, line, text }) => `${file}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('and every exception still exists — a stale allowance is a hole', () => {
    const body = FILES.map((f) => readFileSync(join(repoRoot, f), 'utf8')).join('\n');
    const stale = ALLOWED_WITH_DEPS.filter((e) => !body.includes(e.match)).map((e) => e.match);
    expect(stale).toEqual([]);
  });
});
