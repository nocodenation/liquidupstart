/**
 * M-B6 · Contract · The runtime record cannot take Liquid down with it
 *
 * Purpose:  S8 of the 2026-10-01 review, which had a product change and no case.
 *
 *           `entrypoint.sh` publishes the versions the running instance uses, so
 *           that `nar-build` compiles against them rather than guessing. That
 *           write was unguarded under `set -e`: an `api/` that exists and cannot
 *           be written ended the entrypoint, and under `restart: unless-stopped`
 *           the container then looped, with nothing in the log but bash's own
 *           "Permission denied". Measured while reproducing it: RestartCount 1 to
 *           9 in 29 seconds.
 *
 *           It is not fatal for the reason the index write above it is not --
 *           Liquid reads `lib/` directly and needs none of this. What needs it is
 *           the builder, and since D2 `build.sh` refuses a bundle it cannot judge
 *           rather than deploying one unchecked, so the failure stays closed at
 *           the place where it matters. B6-29 and B6-30 hold that half.
 * Given:    The real `config/liquid/entrypoint.sh`, run from a copy in a sandbox
 *           with a `nar-watch.sh` stand-in, and `${NIFI_HOME}/api` in one of two
 *           shapes. The versions come from the sandbox rather than the host: a
 *           jar named `nifi-runtime-2.11.0-probe.jar`, so the NiFi version cannot
 *           have come from a real distribution, and a `java` on PATH reporting
 *           `build 21.0.12+10-LTS`.
 *
 *           **The unwritable shape is `api/runtime` as a directory, and that is a
 *           decision.** The obvious fixture is `chmod 500` on `api/`, and it
 *           would be green here and green for the wrong reason in the reviewer's
 *           own run: they test in a container as uid 0, where a mode does not
 *           stop a write, so the guard under test would never be reached and the
 *           case would report a pass having measured nothing. A directory where a
 *           file has to be written fails for root exactly as it does for anyone
 *           else.
 * When:     The entrypoint runs against each shape.
 * Then:     With the write impossible it still exits 0, warns naming the file and
 *           the way out, and still launches NiFi. With the write possible the
 *           record holds the two values the sandbox stated.
 * Covers:   B6-31, B6-32, S8 of the 2026-10-01 review, FR21, FR31
 * Unhappy:  B6-31 is the finding. B6-32 is the counterpart, and it is what stops
 *           B6-31 being met by an entrypoint that never writes the record at all
 *           -- which would leave `nar-build` guessing on every host and is the
 *           condition FR21 exists against.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  sandbox,
  runEntrypoint,
  discard,
  SANDBOX_NIFI_VERSION,
  SANDBOX_JAVA_VERSION,
  type Sandbox
} from '../lib/entrypointfixture';

const boxes: Sandbox[] = [];
afterAll(() => boxes.forEach(discard));

function run(shape: 'writable' | 'runtimeIsDirectory') {
  const sb = sandbox({ api: shape });
  boxes.push(sb);
  return { sb, r: runEntrypoint(sb) };
}

describe('B6-31 a record that cannot be written does not end the entrypoint', () => {
  const { sb, r } = run('runtimeIsDirectory');

  test('B6-31 the entrypoint completes and NiFi is still launched', () => {
    // Before the guard: the script ended here, and under `restart:
    // unless-stopped` the container looped. So the launch is the assertion, not
    // the exit code alone.
    //
    // The signal is the launch file's **existence**, not its contents.
    // `launchSaw` returns '' both when start.sh never ran and when it ran and had
    // nothing to list -- the sandbox's start.sh does `ls -1 <load>` and this case
    // seeds no bundles, so the file is written empty. Asserting on the text would
    // have read "launched with an empty load directory" as "never launched",
    // which is the false equivalence this suite exists to avoid.
    expect({ code: r.code, launched: existsSync(sb.launched) }).toEqual({ code: 0, launched: true });
  });

  test('B6-31 the warning names the file and what to do about it', () => {
    expect(r.output).toContain(`could not write ${sb.api}/runtime`);
    expect(r.output).toMatch(/scripts\/linux\/start\.sh|start\/liquid\.sh/);
  });

  test('B6-31 and it does not promise the log fallback', () => {
    // The sentence above this branch, for an unreadable *version*, does offer the
    // log -- and here it would be wrong. `build.sh` prefers the record whenever it
    // parses and reads the log only when the record gave nothing, so a stale
    // record that still parses defeats the fallback. Saying otherwise would send
    // the operator looking in the wrong place, so this asserts the absence.
    expect(r.output).toContain('nar-build will refuse until this is fixed');
    expect(r.output).not.toMatch(/falls back to the startup line/);
  });
});

describe('B6-32 the counterpart: where it can be written, it is', () => {
  const { sb, r } = run('writable');

  test('B6-32 the record holds the versions the sandbox stated', () => {
    const path = join(sb.api, 'runtime');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(
      `nifi_version=${SANDBOX_NIFI_VERSION}\njava_version=${SANDBOX_JAVA_VERSION}\n`
    );
  });

  test('B6-32 and it says so, with both values', () => {
    expect(r.code).toBe(0);
    expect(r.output).toContain(
      `Published the runtime versions for the NAR builder: NiFi ${SANDBOX_NIFI_VERSION}, Java ${SANDBOX_JAVA_VERSION}`
    );
  });
});
