/**
 * N1b — the bound exists on a host without GNU coreutils, and says so when it expires.
 *
 * Purpose: `with_timeout` ended in `else "$@"`. On a host with neither `timeout`
 * nor `gtimeout` — which is every macOS host, since both are GNU coreutils and
 * macOS ships neither — the command ran with no bound at all, and nothing said
 * so. The call sites read `with_timeout 60 docker run …`; what ran was
 * `docker run …`. So the property N1 exists to guarantee was absent on exactly
 * the machine the operator starts the stack from.
 *
 * Measured on this machine 2026-09-17, three times in one afternoon: the N1
 * probe container — bounded at 8s with a 10s grace — stood for 13 minutes, then
 * for over a minute, then for over a minute again, each time until something
 * else removed it. N1 could not report it: `sh()` spawns synchronously and bun
 * cannot interrupt that, so the suite hung instead of going red, and a hang is
 * not a test result.
 *
 * Given  `config/scripts/start/lib/with-timeout.sh`, and a PATH with no
 *        `timeout` and no `gtimeout`
 * When   a command that never ends is run under a 3-second bound
 * Then   it comes back inside the limit plus the grace, with status 124 — the
 *        number coreutils uses, so a caller cannot tell the two hosts apart
 *
 * The positive counterparts are what stop this passing on a helper that refuses
 * everything: a command that finishes inside the bound returns its own status
 * and its own output, and `0` still means unbounded.
 *
 * Test data: the never-ending command `sh -c 'while :; do sleep 1; done'`; the
 * quick command `sh -c 'echo alive; exit 3'` asserted on the literal `alive` and
 * the literal 3; `LU_TIMEOUT_GRACE=2` to keep the case short; and a PATH built
 * from a scratch directory plus `/usr/bin:/bin`, which on this host holds no
 * coreutils `timeout` — verified by the first case rather than assumed.
 *
 * Requirements covered: OC-G4, N1 of the #11 second review, and the 2026-09-17
 * finding that its fallback removed the bound.
 */
import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const LIB = join(repoRoot, 'config/scripts/start/lib/with-timeout.sh');

/** Runs the helper with a PATH the case controls, so the branch is chosen by the case. */
function run(command: string, opts: { withTimeoutStub?: boolean } = {}): {
  code: number;
  out: string;
  elapsedMs: number;
} {
  const dir = mkdtempSync(join(tmpdir(), 'lu-bound-'));
  if (opts.withTimeoutStub) {
    // A stand-in for coreutils, so the case can tell which branch ran without
    // depending on what the host happens to have installed.
    const stub = join(dir, 'timeout');
    writeFileSync(stub, '#!/bin/sh\necho "stub-timeout $*"\nexit 124\n');
    chmodSync(stub, 0o755);
  }
  const script = `
    set -uo pipefail
    export LU_TIMEOUT_GRACE=2
    export PATH=${JSON.stringify(dir)}:/usr/bin:/bin
    . ${JSON.stringify(LIB)}
    ${command}
    echo "rc=$?"
  `;
  const started = Date.now();
  const r = sh(['bash', '-c', script]);
  return { code: Number(r.output.match(/rc=(\d+)/)?.[1] ?? -1), out: r.output, elapsedMs: Date.now() - started };
}

describe('N1b a host without coreutils still has a bound', () => {
  test('the case really is running without timeout and gtimeout', () => {
    // Otherwise every assertion below would be about coreutils, and the branch
    // under test would never run. Asserted rather than assumed: the whole defect
    // was a branch nobody had ever executed.
    const r = run('command -v timeout gtimeout && echo FOUND || echo none');
    expect(r.out).toContain('none');
    expect(r.out).not.toContain('FOUND');
  });

  test('a command that never ends comes back at the limit, not never', () => {
    const r = run(`with_timeout 3 sh -c 'while :; do sleep 1; done'`);
    // 3s limit + 2s grace. Before the fix this did not return at all.
    expect({ code: r.code, returned: r.elapsedMs < 20_000, elapsedMs: r.elapsedMs }).toEqual({
      code: 124,
      returned: true,
      elapsedMs: r.elapsedMs
    });
  }, 60_000);

  test('and a command that finishes keeps its own status and its own output', () => {
    // The counterpart. A helper that answered 124 to everything would satisfy
    // the case above and break every caller.
    const r = run(`with_timeout 10 sh -c 'echo alive; exit 3'`);
    expect({ code: r.code, alive: r.out.includes('alive') }).toEqual({ code: 3, alive: true });
  }, 60_000);

  test('and output is still captured when the caller captures it', () => {
    // Several call sites read the command's stdout through $( ). The watchdog
    // runs in the background and would hold that pipe open if it inherited it,
    // leaving the substitution waiting after the command had finished.
    const r = run(`out="$(with_timeout 10 sh -c 'echo captured')"; echo "got=[$out]"`);
    expect(r.out).toContain('got=[captured]');
  }, 60_000);

  test('and the command keeps its own stderr, while the shell keeps its bookkeeping to itself', () => {
    // bash announces a job it reaps after a signal -- "Terminated: 15" -- on the
    // stderr of whoever called it. Measured before it was silenced: that line
    // landed in the output of the bounded command, where a caller parsing stderr
    // would read it as the command's own. Silencing it must not silence the
    // command, so both halves are one case.
    const expired = run(`with_timeout 3 sh -c 'echo mine >&2; while :; do sleep 1; done'`);
    expect(expired.out).toContain('mine');
    expect(expired.out).not.toContain('Terminated');
  }, 60_000);

  test('and a bound of 0 still means unbounded, with the terminal left alone', () => {
    // The branch the interactive sign-ins take: they must be able to read stdin.
    const r = run(`echo hello | { with_timeout 0 cat; }`);
    expect(r.out).toContain('hello');
  });
});

describe('N1b coreutils is still preferred where it exists', () => {
  test('the timeout on PATH is the one that runs', () => {
    // The fallback is the last resort, not the implementation. With a stub named
    // `timeout` on PATH, the helper must use it — otherwise a host with
    // coreutils would silently get the watchdog instead.
    const r = run(`with_timeout 3 sh -c 'while :; do sleep 1; done'`, { withTimeoutStub: true });
    expect(r.out).toContain('stub-timeout');
    expect(r.out).toContain('-k 2 3 sh -c');
    expect(r.code).toBe(124);
  });
});
