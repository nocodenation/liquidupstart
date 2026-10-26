/**
 * M-B2 · Contract · The start loads the bytes it judged
 *
 * Purpose:  FR30. The entrypoint judged each bundle at its inbox path and then
 *           copied it by that path, so what was judged and what was loaded were
 *           two reads of a file the agents' containers hold read-write and can
 *           replace in between. `nar-watch.sh` closed the same gap for itself
 *           under S6 of the 2026-10-01 review; the start never got the change,
 *           while FR30 and the `liquid` skill said everything in the inbox is
 *           judged before anything is loaded. Recorded on #45 as `45-30`; the
 *           operator chose the repair on 2026-10-26. The start now copies each
 *           bundle to a dot-name in the load directory, judges that copy, and
 *           renames it into place.
 * Given:    config/liquid/entrypoint.sh in the sandbox `B2-5` uses, with a
 *           `python3` first on PATH that runs the real one and, around every
 *           `narcheck.py check`, overwrites the inbox's `b2-probe.nar`: once as
 *           the check begins and once as it ends, the agent that replaces the
 *           file while the start is at it.
 * When:     The entrypoint runs once with the sandbox archive in the inbox, and
 *           once with a bundle the check refuses; then twice with the archive and
 *           an `mv` that fails, the second time with an `rm` that fails as well;
 *           and once in `B2-6`'s sandbox, whose load directory is a file, so the
 *           copy fails before anything is judged; and once with a `cp` that writes
 *           part of the copy and fails, as a full disk does.
 * Then:     The load directory holds the archive as it was judged, byte for
 *           byte, and no dot-copy; a refused bundle is filed under `refused/`,
 *           leaves no dot-copy, and its reason names the inbox's file, never the
 *           dot-copy. A judged copy that cannot be renamed into place is a failed
 *           deployment, is removed, and NiFi still starts; one that cannot be
 *           removed either is said, and under its dot-name it is not loaded. A
 *           bundle that cannot be copied to be judged is a failed deployment named
 *           with `cp`'s own error, is not refused, and stays in the inbox, and a
 *           copy cut off partway is removed.
 * Covers:   B2-13, FR30, FR31
 * Negative: neither of the texts written over the inbox file is what is judged
 *           or loaded, so an entrypoint that reads the inbox file at either moment
 *           is red; a refused bundle's dot-copy is not left behind; a rename that
 *           fails is counted and cleaned up, and a removal that fails is said; a
 *           copy that fails is not filed as a refusal.
 * Counterpart: the judged bundle is loaded under its own name, so an entrypoint
 *           that loaded nothing would not pass; the refusal still names the
 *           bundle, as it did when the inbox file was judged; and a bundle that
 *           could not be copied stays in the inbox while NiFi still starts, so a
 *           start that kept bundles by ending early would not pass.
 *
 * Test data: the sandbox archive `b2-probe.nar`, one entry `probe.txt` holding
 * `probe`. The stand-in writes `swapped as the check began` over it before the
 * check, and `swapped as the check ended` after, each with a newline: text no
 * check passes, so judging the first refuses the bundle, and loading the second
 * loads what nobody judged. The
 * refused bundle is `b2-probe.nar` written as an archive with one entry,
 * `org/example/Bad.class` holding `not a class`, which narcheck refuses for not
 * beginning with `0xCAFEBABE`, as in `B2-12`. The stand-in is `#!/bin/sh`, so it
 * needs no interpreter the host may lack, and it hands every call on to the
 * `python3` the suite itself found. The failing `mv` and `rm` are `#!/bin/sh` /
 * `exit 1`, first on PATH through the sandbox's stubs, as `B2-12`'s `find` is: a
 * permission bit would not stop root, and a reviewer may run the suite as root.
 * The copy that fails is `B2-6`'s: `nifi-current/nar_extensions` a regular file
 * holding `not a directory`, so `cp` fails with ENOTDIR for every user, and the
 * inbox holds `b2-probe.nar` and `b2-second.nar`. The copy cut off partway is a
 * `cp` stub that writes `partial` to its second argument, the dot-copy, and exits
 * 1: ENOTDIR leaves nothing behind, a full disk leaves a truncated file.
 *
 * Dependencies: bun, `python3` for the sandbox archives and the real
 * `narcheck.py`. No docker, no stack.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sh } from '../lib/shell';
import { sandbox, runEntrypoint, loadContents, discard, NAR_NAMES, type Sandbox } from '../lib/entrypointfixture';

const BEGAN = 'swapped as the check began';
const ENDED = 'swapped as the check ended';
const boxes: Sandbox[] = [];
afterAll(() => boxes.forEach(discard));

// The inbox file is replaced as the check begins and again as it ends.
function swappingAroundCheck(sb: Sandbox): void {
  const real = Bun.which('python3');
  if (!real) throw new Error('python3 is not on PATH');
  const inbox = join(sb.drop, 'b2-probe.nar');
  const swap = (text: string) => `if [ "$2" = check ]; then printf '${text}\\n' > "${inbox}"; fi\n`;
  writeFileSync(
    join(sb.stubs, 'python3'),
    `#!/bin/sh\n${swap(BEGAN)}"${real}" "$@"\nrc=$?\n${swap(ENDED)}exit $rc\n`,
    { mode: 0o755 }
  );
}

describe('B2-13 the bytes judged are the bytes loaded', () => {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  const judged = readFileSync(join(sb.drop, 'b2-probe.nar'));
  swappingAroundCheck(sb);
  const r = runEntrypoint(sb);

  test('B2-13 the negative: what replaced the inbox file is neither judged nor loaded', () => {
    expect({
      code: r.code,
      swapped: readFileSync(join(sb.drop, 'b2-probe.nar'), 'utf8'),
      loaded: existsSync(join(sb.load, 'b2-probe.nar')) && readFileSync(join(sb.load, 'b2-probe.nar')).equals(judged),
      refused: existsSync(join(sb.drop, 'refused'))
    }).toEqual({ code: 0, swapped: `${ENDED}\n`, loaded: true, refused: false });
  });

  test('B2-13 the counterpart: the judged bundle is in place under its own name, and no dot-copy is left', () => {
    expect(readdirSync(sb.load).sort()).toEqual(['b2-probe.nar']);
  });
});

describe('B2-13 a refused bundle leaves no copy, and its reason names the inbox file', () => {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  const inbox = join(sb.drop, 'b2-probe.nar');
  const made = sh([
    'python3', '-c',
    'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],"w")\nz.writestr("org/example/Bad.class","not a class")\nz.close()',
    inbox
  ]);
  if (made.code !== 0) throw new Error(made.output);
  const r = runEntrypoint(sb);

  test('B2-13 the negative: refused, filed under refused/, and nothing of it in the load directory', () => {
    expect({
      refused: existsSync(join(sb.drop, 'refused', 'b2-probe.nar')),
      load: loadContents(sb),
      dotCopy: r.output.includes('.b2-probe.nar.part')
    }).toEqual({ refused: true, load: [], dotCopy: false });
  });

  test('B2-13 the counterpart: the refusal names the bundle by its inbox path, and its reason by the bundle', () => {
    expect(r.stderr).toContain(`REFUSED ${inbox}`);
    expect(r.stderr).toContain('  b2-probe.nar!org/example/Bad.class: does not begin with 0xCAFEBABE');
  });
});

function failing(sb: Sandbox, name: string): void {
  writeFileSync(join(sb.stubs, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
}

describe('B2-13 a judged copy that cannot be put in place is not loaded, and not left behind', () => {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  failing(sb, 'mv');
  const r = runEntrypoint(sb);

  test('B2-13 the negative: a failed deployment, nothing in the load directory, and NiFi still started', () => {
    expect({
      code: r.code,
      failed: r.stderr.includes(`NAR DEPLOYMENT FAILED: ${join(sb.drop, 'b2-probe.nar')} did not reach`),
      load: readdirSync(sb.load),
      started: r.stdout.includes('Starting Liquid...')
    }).toEqual({ code: 0, failed: true, load: [], started: true });
  });
});

describe('B2-13 and a dot-copy that cannot be removed either is said', () => {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  failing(sb, 'mv');
  failing(sb, 'rm');
  const r = runEntrypoint(sb);

  test('B2-13 the negative: the start names the copy it could not remove, and still starts', () => {
    expect({
      code: r.code,
      said: r.stderr.includes(`${join(sb.load, '.b2-probe.nar.part')} could not be removed; under its dot-name it is not loaded.`),
      started: r.stdout.includes('Starting Liquid...')
    }).toEqual({ code: 0, said: true, started: true });
  });
});

describe('B2-13 a bundle that cannot be copied to be judged is not refused, and stays in the inbox', () => {
  const sb = sandbox({ nars: NAR_NAMES, loadIsFile: true });
  boxes.push(sb);
  const r = runEntrypoint(sb);
  const lines = r.stderr.split('\n');
  // The line that names the bundle, and the one after it, which is cp's own.
  const said = (nar: string) => {
    const at = lines.indexOf(
      `NAR DEPLOYMENT FAILED: ${join(sb.drop, nar)} did not reach ${sb.load}/: it could not be copied there to be judged`
    );
    return { named: at > -1, cp: at > -1 && /^  cp: /.test(lines[at + 1] ?? '') };
  };

  test('B2-13 the negative: each is a failed deployment named with cp\'s error, and none is refused', () => {
    expect({
      code: r.code,
      probe: said('b2-probe.nar'),
      second: said('b2-second.nar'),
      refused: existsSync(join(sb.drop, 'refused'))
    }).toEqual({ code: 0, probe: { named: true, cp: true }, second: { named: true, cp: true }, refused: false });
  });

  test('B2-13 the counterpart: both stay in the inbox, and NiFi is started', () => {
    expect({
      inbox: readdirSync(sb.drop).sort(),
      started: r.stdout.includes('Starting Liquid...')
    }).toEqual({ inbox: ['b2-probe.nar', 'b2-second.nar'], started: true });
  });
});

describe('B2-13 a copy cut off partway is removed', () => {
  const sb = sandbox({ nars: ['b2-probe.nar'] });
  boxes.push(sb);
  writeFileSync(join(sb.stubs, 'cp'), '#!/bin/sh\nprintf partial > "$2"\nexit 1\n', { mode: 0o755 });
  const r = runEntrypoint(sb);

  test('B2-13 the negative: the truncated dot-copy is gone, and the bundle stays in the inbox', () => {
    expect({
      code: r.code,
      load: readdirSync(sb.load),
      inbox: readdirSync(sb.drop).sort(),
      failed: r.stderr.includes('it could not be copied there to be judged')
    }).toEqual({ code: 0, load: [], inbox: ['b2-probe.nar'], failed: true });
  });
});
