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
 *           `.b2-probe.nar.part`, the name a killed watcher's copy has.
 * When:     The entrypoint runs; once with the inbox directory missing; once
 *           with a `find` that fails; with the loaded `b2-probe.nar` replaced in
 *           the inbox by one the check refuses, and by one still being copied
 *           in; with `mountpoint` answering that the inbox is a mount and that
 *           it is not; and with an empty load directory.
 * Then:     Afterwards the load directory holds `b2-probe.nar` alone, NiFi is
 *           launched seeing that, and the start names what it removed. With no
 *           inbox directory the load directory is left as it was. A load
 *           directory that cannot be emptied is reported, the inbox is still
 *           promoted, and NiFi is still launched. The image always carries an
 *           inbox directory, so in the stack the emptying always runs; without
 *           the bind it is the image's empty one, and the load path ends empty.
 *           A replacement the check refuses is filed under `refused/`, and the
 *           loaded bundle it replaced is gone: the cost the README and the skill
 *           now name. One still being copied in stays in the inbox, unrefused,
 *           for the watcher. An inbox that is not a mount is said, one that is
 *           is not, and an empty load directory is emptied without a word.
 * Covers:   B2-12, FR30, CLAUDE.md § Persist on host disk
 * Negative: the stale bundle and the dot-file are gone; the refused replacement
 *           unloads its predecessor; the partial copy is neither loaded nor
 *           refused; the inbox that is not a mount is said.
 * Counterpart: the inbox's bundle is there, and with no inbox nothing is
 *           removed, so the case cannot pass on an entrypoint that empties the
 *           directory and refills nothing, or empties it whatever happens; a
 *           mount draws no warning, and an empty load directory no `Emptied`.
 *
 * Test data: the sandbox's archive `b2-probe.nar` (one entry `probe.txt` holding
 * `probe`) in the inbox; in the load directory, the same archive written as
 * `b2-stale.nar`, and `.b2-probe.nar.part` holding `partial`, the name
 * `nar-watch.sh` gives its copy, `.${base}.part`. The failing `find` is
 * `#!/bin/sh` / `exit 1`, first on PATH through the sandbox's stubs: a permission
 * bit would not stop root, and a reviewer may run the suite as root. The refused
 * replacement is `b2-probe.nar` written as an archive with one entry,
 * `org/example/Bad.class` holding `not a class`, which narcheck refuses for not
 * beginning with `0xCAFEBABE`. The copy still arriving is the first 60 bytes of
 * the sandbox archive, as a `cp` interrupted by a restart leaves it; its
 * counterpart is a finished archive whose one entry,
 * `META-INF/bundled-dependencies/x.jar`, holds `not a zip at all`.
 * `mountpoint` is stubbed both ways, `exit 0` and `exit 1`, because macOS has
 * none and Linux's would decide the case alone.
 *
 * Dependencies: bun, `python3` for the sandbox archives and the real
 * `narcheck.py`, and `find` and `ls`. No docker, no stack.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { sh } from '../lib/shell';
import { join } from 'node:path';
import { sandbox, runEntrypoint, loadContents, launchSaw, discard, writeNar, type Sandbox } from '../lib/entrypointfixture';

const boxes: Sandbox[] = [];
afterAll(() => boxes.forEach(discard));

function seeded(): Sandbox {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  writeNar(join(sb.load, 'b2-stale.nar'));
  writeFileSync(join(sb.load, '.b2-probe.nar.part'), 'partial\n');
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
    expect(r.stdout).toContain('it held: .b2-probe.nar.part b2-stale.nar');
  });
});

describe('B2-12 only with an inbox directory', () => {
  test('B2-12 the counterpart: with no inbox directory, the load directory is left as it was', () => {
    const sb = seeded();
    rmSync(sb.drop, { recursive: true, force: true });
    const r = runEntrypoint(sb);
    expect(r.code, r.output).toBe(0);
    expect(loadContents(sb)).toEqual(['.b2-probe.nar.part', 'b2-stale.nar']);
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
      left: r.stderr.includes('still holds: .b2-probe.nar.part b2-stale.nar')
    }).toEqual({ emptied: false, left: true });
  });
});

function stub(sb: Sandbox, name: string, code: number): void {
  writeFileSync(join(sb.stubs, name), `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 });
}

// The loaded bundle, and in the inbox the replacement the case is about.
function replaced(write: (inbox: string) => void): { sb: Sandbox; r: ReturnType<typeof runEntrypoint> } {
  const sb = sandbox({ nars: [] });
  boxes.push(sb);
  writeNar(join(sb.load, 'b2-probe.nar'));
  write(join(sb.drop, 'b2-probe.nar'));
  return { sb, r: runEntrypoint(sb) };
}

describe('B2-12 a replacement the check refuses unloads the bundle it replaced', () => {
  const { sb, r } = replaced((inbox) => {
    const made = sh(['python3', '-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("org/example/Bad.class","not a class")\nz.close()', inbox]);
    if (made.code !== 0) throw new Error(made.output);
  });

  test('B2-12 the negative: refused, filed under refused/, and the loaded one is gone', () => {
    expect({
      code: r.code,
      load: loadContents(sb),
      launched: launchSaw(sb).trim(),
      refused: existsSync(join(sb.drop, 'refused', 'b2-probe.nar')),
      held: r.stdout.includes('it held: b2-probe.nar'),
      said: r.stderr.includes('NAR DEPLOYMENT FAILED')
    }).toEqual({ code: 0, load: [], launched: '', refused: true, held: true, said: true });
  });
});

describe('B2-12 a copy still arriving stays in the inbox for the watcher', () => {
  const { sb, r } = replaced((inbox) => {
    writeNar(inbox);
    writeFileSync(inbox, readFileSync(inbox).subarray(0, 60));
  });

  test('B2-12 the negative: not loaded, not refused, still in the inbox, and said', () => {
    expect({
      code: r.code,
      load: loadContents(sb),
      inbox: readdirSync(sb.drop).sort(),
      said: r.stderr.includes('cannot be opened as an archive') && r.stderr.includes('It stays in the inbox'),
      failed: r.stderr.includes('NAR DEPLOYMENT FAILED')
    }).toEqual({ code: 0, load: [], inbox: ['b2-probe.nar'], said: true, failed: false });
  });
});

describe('B2-12 a finished bundle whose inner jar is broken is refused, not left as arriving', () => {
  const { sb, r } = replaced((inbox) => {
    const made = sh(['python3', '-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("META-INF/bundled-dependencies/x.jar","not a zip at all")\nz.close()', inbox]);
    if (made.code !== 0) throw new Error(made.output);
  });

  test('B2-12 the counterpart: refused, filed under refused/, and not said to be arriving', () => {
    expect({
      refused: existsSync(join(sb.drop, 'refused', 'b2-probe.nar')),
      arriving: r.stderr.includes('NAR NOT JUDGED YET'),
      said: r.stderr.includes('b2-probe.nar!META-INF/bundled-dependencies/x.jar: could not be opened as an archive')
    }).toEqual({ refused: true, arriving: false, said: true });
  });
});

describe('B2-12 an inbox that is not a mount is said', () => {
  test('B2-12 the negative: mountpoint says no, and the warning names the bind', () => {
    const sb = seeded();
    stub(sb, 'mountpoint', 1);
    expect(runEntrypoint(sb).stderr).toContain("is not a mount, so the inbox is the image's own");
  });

  test('B2-12 the counterpart: mountpoint says yes, and nothing is said', () => {
    const sb = seeded();
    stub(sb, 'mountpoint', 0);
    expect(runEntrypoint(sb).stderr).not.toContain('is not a mount');
  });
});

describe('B2-12 an empty load directory is emptied without a word', () => {
  test('B2-12 the counterpart: nothing was there, so nothing is said to have been removed', () => {
    const sb = sandbox({ nars: ['b2-probe.nar'] });
    boxes.push(sb);
    const r = runEntrypoint(sb);
    expect({ code: r.code, emptied: r.stdout.includes('Emptied'), load: loadContents(sb) }).toEqual({
      code: 0,
      emptied: false,
      load: ['b2-probe.nar']
    });
  });
});
