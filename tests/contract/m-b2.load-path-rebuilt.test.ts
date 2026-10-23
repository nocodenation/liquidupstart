/**
 * M-B2 · Contract · The load directory is rebuilt from the inbox on every start
 *
 * Purpose:  FR30. Liquid's load directory is an anonymous Docker volume, kept
 *           across a restart and a recreate, and until 2026-10-22 the entrypoint
 *           only ever added to it. A bundle taken out of `./volumes/nar_extensions`
 *           therefore stayed loaded, and taking one out meant a second `rm` inside
 *           the container. CLAUDE.md, meanwhile, gave `nar_extensions` as a
 *           directory rewritten from scratch on every start, and so as no state.
 *           Recorded on #45 on 2026-10-22; the operator chose to make the
 *           behaviour match the sentence. The entrypoint now empties the load
 *           directory before it judges the inbox, whenever there is an inbox
 *           directory to refill it from.
 * Given:    config/liquid/entrypoint.sh, run in the sandbox B2-5 uses, with the
 *           inbox holding `b2-probe.nar` and the load directory holding
 *           `b2-stale.nar`, a bundle that is no longer in the inbox, and
 *           `.b2-probe.nar.17.part`, a copy a killed watcher left.
 * When:     The entrypoint runs; once with the inbox directory missing; and once
 *           with a `find` that fails.
 * Then:     Afterwards the load directory holds `b2-probe.nar` alone, NiFi is
 *           launched seeing that, and the start names what it removed. With no
 *           inbox directory the load directory is left as it was. A load
 *           directory that cannot be emptied is reported, the inbox is still
 *           promoted, and NiFi is still launched. The image always carries an
 *           inbox directory, so in the stack the emptying always runs; without
 *           the bind it is the image's empty one, and the load path ends empty.
 * Covers:   B2-12, FR30, CLAUDE.md § Persist on host disk
 * Negative: the stale bundle and the dot-file are gone.
 * Counterpart: the inbox's bundle is there, and with no inbox nothing is
 *           removed, so the case cannot pass on an entrypoint that empties the
 *           directory and refills nothing, or empties it whatever happens.
 *
 * Test data: the sandbox's archive `b2-probe.nar` (one entry `probe.txt` holding
 * `probe`) in the inbox; in the load directory, the same archive written as
 * `b2-stale.nar`, and `.b2-probe.nar.17.part` holding `partial`. The failing
 * `find` is `#!/bin/sh` / `exit 1`, first on PATH through the sandbox's stubs:
 * a permission bit would not stop root, and a reviewer may run the suite as root.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox, runEntrypoint, loadContents, launchSaw, discard, writeNar, type Sandbox } from '../lib/entrypointfixture';

const boxes: Sandbox[] = [];
afterAll(() => boxes.forEach(discard));

function seeded(): Sandbox {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  writeNar(join(sb.load, 'b2-stale.nar'));
  writeFileSync(join(sb.load, '.b2-probe.nar.17.part'), 'partial\n');
  return sb;
}

describe('B2-12 every start rebuilds the load directory from the inbox', () => {
  const sb = seeded();
  const r = runEntrypoint(sb);

  test('B2-12 the negative: a bundle no longer in the inbox, and a leftover dot-file, are gone', () => {
    expect(r.code, r.output).toBe(0);
    expect(loadContents(sb).filter((n) => n !== 'b2-probe.nar')).toEqual([]);
  });

  test('B2-12 the counterpart: the inbox bundle is there, and NiFi is launched seeing it alone', () => {
    expect({ load: loadContents(sb), launched: launchSaw(sb).trim() }).toEqual({ load: ['b2-probe.nar'], launched: 'b2-probe.nar' });
  });

  test('B2-12 and the start names what it removed, so a bundle that does not come back is in the log', () => {
    expect(r.stdout).toContain('it held: .b2-probe.nar.17.part b2-stale.nar');
  });
});

describe('B2-12 only with an inbox directory', () => {
  test('B2-12 the counterpart: with no inbox directory, the load directory is left as it was', () => {
    const sb = seeded();
    rmSync(sb.drop, { recursive: true, force: true });
    const r = runEntrypoint(sb);
    expect(r.code, r.output).toBe(0);
    expect(loadContents(sb)).toEqual(['.b2-probe.nar.17.part', 'b2-stale.nar']);
  });
});

describe('B2-12 a load directory that cannot be emptied', () => {
  test('B2-12 is said, and NiFi is launched all the same', () => {
    const sb = seeded();
    writeFileSync(join(sb.stubs, 'find'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const r = runEntrypoint(sb);
    expect({
      code: r.code,
      said: r.stderr.includes('could not be emptied'),
      promoted: loadContents(sb).includes('b2-probe.nar'),
      launched: launchSaw(sb) !== ''
    }).toEqual({ code: 0, said: true, promoted: true, launched: true });
    // Nothing was removed, so nothing is said to have been, and the warning says
    // what is still there.
    expect({
      emptied: r.stdout.includes('Emptied'),
      left: r.stderr.includes('still holds: .b2-probe.nar.17.part b2-stale.nar')
    }).toEqual({ emptied: false, left: true });
  });
});
