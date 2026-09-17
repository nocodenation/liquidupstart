/**
 * N1, N4 — a bound that returns, and a container that is cleaned up when it does not.
 *
 * Purpose: `with_timeout` could not bound a plain `docker run`. coreutils
 * `timeout` signals the docker *client*; the client is supposed to forward it to
 * the container and instead stays attached. Reproduced on 2026-09-11:
 *
 *   timeout 15 docker run --rm --name X --entrypoint node <image> \
 *     -e 'setInterval(()=>{},1000)' </dev/null
 *   -> still blocked after 2 minutes, container Up
 *
 *   the same with --init
 *   -> rc 124 after 16s, no container left
 *
 * **That second measurement was one observation, and this case was founded on it
 * as though it were a property.** On 2026-09-14 the same call with `--init` hung
 * a suite run for 15 minutes; a hand-run sat attached to a live container for
 * eight minutes; an outer `timeout 40` around the whole thing did not return
 * either, because GNU timeout waits for its child after signalling. In that
 * window three of four attempts needed `-k`'s kill (rc 137) rather than the
 * signal (rc 124). An hour later it was gone: four of four ended at SIGTERM in
 * eight seconds, same host, same stack. So it is intermittent, the cause was not
 * established, and neither observation is a property. `--init` was half the fix;
 * the kill is what makes the bound return whichever way the day is going.
 *
 * So the property is not "returns 124". It is: **the bound returns at all**,
 * within its limit plus the grace, with a status the caller reads as failure,
 * and nothing left running afterwards. A case that demands 124 rejects the very
 * fix that makes the bound reliable — the same mistake OC-3 was re-founded for.
 *
 * Given  config/scripts/start/openclaw.sh, and a real docker
 * When   every bounded `docker run` is read, and `with_timeout` itself is run
 * Then   each carries --init, each named container is removed when the run
 *        fails, and the bound comes back inside its limit plus the grace
 *
 * The text half and the behaviour half are both here on purpose. N1 is the case
 * where the text looked right — the bound was in the right place, with the right
 * number — and the mechanism did nothing. A contract case alone would have
 * passed over it exactly as the previous review's fix did.
 *
 * Requirements covered: OC-G4, N1 and N4 of the #11 second review, and the
 * 2026-09-14 correction to N1 above.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
// with_timeout moved into a library on 2026-09-17: openclaw.sh and git.sh each
// carried a copy, and both ended in a branch that ran the command unbounded.
const LIB = JSON.stringify(join(repoRoot, 'config/scripts/start/lib/with-timeout.sh'));
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
    // The behaviour half, and it runs with_timeout out of the script rather than
    // a copy of the line: -k is part of what is under test, and a copy would go
    // on passing after the original lost it.
    const image = 'liquidupstart/openclaw:latest';
    if (sh(['docker', 'image', 'inspect', image]).code !== 0) {
      expect({ skipped: 'image absent', image }).toEqual({ skipped: 'image absent', image });
      return;
    }
    const name = `lu-bound-probe-${process.pid}`;
    const snippet = `
      set -uo pipefail
. ${LIB}
      with_timeout 8 docker run --rm --init --name ${name} --entrypoint node ${image} \
        -e 'setInterval(()=>{},1000)'
      echo "rc=$?"
    `;
    const started = Date.now();
    const r = sh(['bash', '-c', snippet]);
    const elapsed = Date.now() - started;
    // What every caller does, and must: a client killed with SIGKILL cleans up
    // nothing, so --rm never fires and the container outlives the bound.
    sh(['docker', 'rm', '-f', name]);

    const rc = Number(r.output.match(/rc=(\d+)/)?.[1] ?? -1);
    // 124 when SIGTERM was enough, 137 when the kill was needed. Both are the
    // bound expiring; neither is zero, which is all a caller has to know.
    expect({ expired: rc === 124 || rc === 137, rc }).toEqual({ expired: true, rc });
    // 8s limit + 10s grace, with room for a loaded machine. The point is that it
    // comes back at all: the unfixed version did not, in 15 minutes.
    expect(elapsed).toBeLessThan(45_000);
  }, 90_000);
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
