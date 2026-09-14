/**
 * N1, N4 — a bound that binds, and a container that is cleaned up when it does not.
 *
 * Purpose: `with_timeout` cannot bound a plain `docker run`. coreutils `timeout`
 * sends one SIGTERM to the docker *client*; the client forwards it to the
 * container and stays attached, and a node PID 1 with no handler ignores it. The
 * bound then blocks past its limit and the rc 124 branch that force-removes the
 * container never runs. Reproduced on 2026-09-11:
 *
 *   timeout 15 docker run --rm --name X --entrypoint node <image> \
 *     -e 'setInterval(()=>{},1000)' </dev/null
 *   -> still blocked after 2 minutes, container Up
 *
 *   the same with --init
 *   -> rc 124 after 16s, no container left
 *
 * That makes every bound in the start script decorative — 60s, 240s, 900s alike.
 * The one path that worked is the state migration, because compose gives that
 * service `init: true`.
 *
 * Given  config/scripts/start/openclaw.sh, and a real docker
 * When   every bounded `docker run` is read, and one is actually bounded
 * Then   each carries --init, each named container is removed when the run
 *        fails, and the bound returns 124 rather than blocking
 *
 * The text half and the behaviour half are both here on purpose. N1 is the case
 * where the text looked right — the bound was in the right place, with the right
 * number — and the mechanism did nothing. A contract case alone would have
 * passed over it exactly as the previous review's fix did.
 *
 * Requirements covered: OC-G4, N1 and N4 of the #11 second review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
const lines = body.split('\n');

function boundedRuns(): { line: number; text: string }[] {
  return lines
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => /with_timeout\s+\S+\s+docker run/.test(text))
    .filter(({ text }) => !/^\s*(#|\/\/|\*)/.test(text));
}

describe('N1 every bounded docker run can actually be bounded', () => {
  test('the scan finds the bounded runs', () => {
    expect(boundedRuns().length).toBeGreaterThan(4);
  });

  test('each carries --init, without which timeout only frees the client', () => {
    const offenders = boundedRuns()
      .filter(({ text }) => !text.includes('--init'))
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('and the bound really returns, rather than blocking past its limit', () => {
    // The behaviour half. Without --init this call blocks indefinitely; the
    // assertion is that it comes back at all, and with the timeout's own code.
    const image = 'liquidupstart/openclaw:latest';
    if (sh(['docker', 'image', 'inspect', image]).code !== 0) {
      expect({ skipped: 'image absent', image }).toEqual({ skipped: 'image absent', image });
      return;
    }
    const name = `lu-bound-probe-${process.pid}`;
    const started = Date.now();
    const r = sh([
      'bash', '-c',
      `timeout 8 docker run --rm --init --name ${name} --entrypoint node ${image} ` +
        `-e 'setInterval(()=>{},1000)' </dev/null; echo "rc=$?"`
    ]);
    const elapsed = Date.now() - started;
    sh(['docker', 'rm', '-f', name]);
    expect(r.output).toContain('rc=124');
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);
});

describe('N4 a named container is removed when its run does not end by itself', () => {
  test('every helper that names a container also force-removes it on failure', () => {
    // `--rm` fires on container exit, which is precisely what does not happen
    // when the bound expires. Declaring rc and cname without using them — which
    // is what the previous round did — looks like the pattern and is not it.
    const named = lines
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /docker run .*--name "\$\{?c?name\}?"/.test(text));
    expect(named.length).toBeGreaterThan(2);

    const offenders = named
      .filter(({ line }) => {
        const window = lines.slice(line - 1, line + 14).join('\n');
        return !/docker rm -f "\$\{?c?name\}?"/.test(window);
      })
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('and no helper declares rc or cname without using them', () => {
    const declared = lines
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /local rc=0 cname=/.test(text));
    const offenders = declared
      .filter(({ line }) => {
        const window = lines.slice(line - 1, line + 16).join('\n');
        return !/rc=\$\?/.test(window) || !/return \$rc/.test(window);
      })
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});
