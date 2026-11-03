/**
 * M-CU · Unit · The reset removes volumes/ from a container before it asks for a password
 *
 * Purpose:  `CLAUDE.md` promises that a reset is just deleting `volumes/`. Under
 *           rootless Docker the files a container wrote belong to a mapped uid the
 *           host user cannot delete, and `cleanup.sh`'s only answer was `sudo` --
 *           a password four minutes into a reset that need not ask at all, or an
 *           error on a host without it. The same uid is root's equal inside any
 *           container the daemon starts, so a container with the project directory
 *           mounted removes the tree with no privilege the operator lacks (#32,
 *           `docs/FEATURE-reset.md`). `lu_remove_volumes <project-dir>` tries four
 *           legs in order -- plain `rm`, `rm` from a local image, `sudo rm`, an
 *           error -- and each is a decision about running something destructive
 *           and as whom, so every branch has a row here: the guard's refusals and
 *           its acceptances, plain `rm` succeeding and failing, `docker` present
 *           and absent, each image present and absent, the run exiting 0 and not,
 *           the directory gone and remaining after it, `sudo` present and absent,
 *           and the directory gone and remaining after `sudo`. The review of #32
 *           (2026-11-03) added two things: the argument is resolved to its
 *           physical directory before the `/` comparison, because `/.`, `//.`,
 *           `/tmp/..` and a symlink to `/` all passed the string comparison and
 *           would have had `sudo rm -rf /volumes` run; and the plain `rm` is a
 *           logging stub, so the rows that need it to fail run under uid 0 as
 *           well, where no mode refuses anything -- the project's reproducible run
 *           is `bun test` as root in the dashboard image, and the decision logic
 *           here was green there having never run (7 passes, 11 skips).
 * Given:    `resetFixture()`: `mkdtempSync` under the system temp directory with the
 *           prefix `lu cu-` -- a space on purpose, so every path that reaches a
 *           command carries one -- and `<dir>` throughout is `realpathSync` of
 *           what it returned: the same string on Linux, and on macOS (`/tmp` ->
 *           `/private/tmp`) the one the resolution hands the legs. `bin/rm`,
 *           `bin/docker` and `bin/sudo` are stubs appending every argument on its
 *           own line and then a line `--` to `rm.log`, `docker.log` or `sudo.log`
 *           beside `volumes/`, so a call is readable element by element and a
 *           space in a path cannot hide a split. `bin/rm` without `LU_STUB_RM`
 *           `exec`s the real `rm` found with `command -v rm` when the fixture was
 *           built; with `LU_STUB_RM=refuse` it prints `rm: cannot remove
 *           '<dir>/volumes/locked/keep': Permission denied` on stderr, exits 1 and
 *           touches nothing. The other knobs, through the run's environment:
 *           `LU_STUB_IMAGES`, the images `image inspect` answers 0 for;
 *           `LU_STUB_RUN` = `remove` (the run makes `<src>/volumes` writable and
 *           removes it with the real `rm`, `<src>` the element after `-v` less
 *           `:/v`), `keep` (exit 0, nothing touched) or `fail` (`No such image`,
 *           exit 125); `LU_STUB_DAEMON=down` (every call: `Cannot connect to the
 *           Docker daemon at unix:///nonexistent-lu-cu.sock`, exit 1);
 *           `LU_STUB_SUDO` = `remove`, `keep` or `fail` (`sudo: a password is
 *           required`, exit 1). The stubs that remove stand in for root; they make
 *           the function's reading of the result observable, not Docker. **The
 *           plain tree:** `volumes/plain/keep` holding `probe`. **The locked
 *           tree:** `volumes/locked/keep` holding `probe` under `chmod 0500
 *           volumes/locked`, so the *real* `rm -rf` is refused on `keep` by an
 *           ordinary uid -- the measured fact the stub's refusal stands in for,
 *           held by CU-2's premise, which is skipped under uid 0 with the reason
 *           in its name. `probe` is a word no service writes.
 * When:     `bash -c '. "$0" && lu_remove_volumes "$1"' <lib> <dir>` with PATH the
 *           fixture's `bin` alone and the working directory the checkout root --
 *           the fixture root for CU-5, so a relative `volumes` would name the
 *           fixture's own tree.
 * Then:     CU-1: plain `rm` removes the plain tree, or finds none; exit 0, stdout
 *           exactly `Removing volumes/...`, `rm.log` the one call `-rf
 *           <dir>/volumes`, no other stub called. CU-2: on the locked tree with
 *           the refusing `rm` the container leg runs `run --pull never --rm
 *           --entrypoint rm -v <dir>:/v <image> -rf /v/volumes` as eleven
 *           elements, the path one of them, with the first present of
 *           `nginx:latest`, `liquidupstart/bun-runner:latest`, probed in that
 *           order; no `pull` anywhere; `rm.log` the one plain call first. CU-3:
 *           no image, no `docker`, a daemon down, a run that kept the tree, a run
 *           that failed -- each falls through to `sudo rm -rf <dir>/volumes` with
 *           the line that says why. CU-4: no `sudo`, or a `sudo` after which the
 *           tree remains -- stderr names it, exit 1, the tree is there. CU-5:
 *           `""`, `volumes-of-nobody`, `/`, `///`, `/.`, `//.`, `<dir>/../..` (one
 *           `..` per component of `<dir>`, so the climb ends at `/` wherever the
 *           temp directory lies -- `/tmp/..` until the second review of #32, which
 *           is `/private` on macOS) and
 *           `<dir>/rootlink` (a symlink to `/`) are refused with `not an absolute
 *           path below /.`, `<dir>/absent` with `not an existing directory.`, all
 *           before any leg; `<dir>/` and `<dir>/sub/..` are accepted and the
 *           target is `<dir>/volumes`, resolved; `<dir>/link` (a symlink to
 *           `<dir>`) is accepted and the run mounts `<dir>:/v`, not the link.
 * Covers:   CU-1, CU-2, CU-3, CU-4, CU-5, CU-FR1, CU-FR2, CU-FR3, CU-FR4, CU-FR5, CU-FR6
 * Unhappy:  CU-2 (3) is `--pull` anywhere but straight after `run`, or a `pull` at
 *           all. CU-3 (4), (5) and CU-4 (2), (3) are a leg's exit status believed
 *           over the directory. CU-4 is every leg failing. CU-5 (1)-(3) and
 *           (5)-(8) are the paths a caller must never hand the function, each
 *           `/volumes` to the kernel or nothing at all. The real container on a
 *           real `101499`-owned tree is CU-7, manual, in `docs/TEST-SPEC-reset.md`.
 */
import { test, expect, describe, afterEach } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const LIB = join(repoRoot, 'scripts/linux/lib/remove-volumes.sh');
const BASH = Bun.which('bash')!;
const REAL_RM = sh(['sh', '-c', 'command -v rm']).stdout.trim();
const asRoot = (process.getuid?.() ?? -1) === 0;

const IMAGES = ['nginx:latest', 'liquidupstart/bun-runner:latest'];
const NO_IMAGE_LINE = `No local image to run the removal from (tried ${IMAGES.join(', ')}); retrying with sudo...`;
const REFUSE = { LU_STUB_RM: 'refuse' };

type Fixture = { root: string; bin: string; volumes: string; keep: string };
const made: Fixture[] = [];

/** `s` as one shell word, whatever it holds. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const logging = (log: string) =>
  `PATH=/usr/bin:/bin\nfor a in "$@"; do printf '%s\\n' "$a" >> ${shq(log)}; done\nprintf '%s\\n' '--' >> ${shq(log)}\n`;

function resetFixture(tree: 'plain' | 'locked' | 'none'): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lu cu-')));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'rm'),
    `#!/bin/sh
${logging(join(root, 'rm.log'))}
if [ "\${LU_STUB_RM:-}" = refuse ]; then
  printf '%s\\n' ${shq(`rm: cannot remove '${root}/volumes/locked/keep': Permission denied`)} >&2; exit 1
fi
exec ${shq(REAL_RM)} "$@"
`
  );
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
${logging(join(root, 'docker.log'))}
if [ "\${LU_STUB_DAEMON:-}" = down ]; then
  echo "Cannot connect to the Docker daemon at unix:///nonexistent-lu-cu.sock" >&2; exit 1
fi
case "$1" in
  image)
    for i in \${LU_STUB_IMAGES:-}; do [ "$i" = "$3" ] && exit 0; done
    exit 1 ;;
  run)
    src=""
    while [ $# -gt 0 ]; do
      if [ "$1" = -v ]; then src="\${2%:/v}"; break; fi
      shift
    done
    case "\${LU_STUB_RUN:-keep}" in
      remove) chmod -R u+rwx "$src/volumes" && rm -rf "$src/volumes"; exit 0 ;;
      fail) echo "docker: Error response from daemon: No such image: nginx:latest" >&2; exit 125 ;;
      *) exit 0 ;;
    esac ;;
esac
exit 0
`
  );
  writeFileSync(
    join(bin, 'sudo'),
    `#!/bin/sh
${logging(join(root, 'sudo.log'))}
case "\${LU_STUB_SUDO:-keep}" in
  remove) chmod -R u+rwx "$3" && rm -rf "$3"; exit 0 ;;
  fail) echo "sudo: a password is required" >&2; exit 1 ;;
  *) exit 0 ;;
esac
`
  );
  for (const s of ['rm', 'docker', 'sudo']) chmodSync(join(bin, s), 0o755);
  const volumes = join(root, 'volumes');
  const keep = join(volumes, tree === 'locked' ? 'locked' : 'plain', 'keep');
  if (tree !== 'none') {
    mkdirSync(join(keep, '..'), { recursive: true });
    writeFileSync(keep, 'probe\n');
    if (tree === 'locked') chmodSync(join(keep, '..'), 0o500);
  }
  const f = { root, bin, volumes, keep };
  made.push(f);
  return f;
}

afterEach(() => {
  for (const f of made.splice(0)) {
    const locked = join(f.volumes, 'locked');
    if (existsSync(locked)) chmodSync(locked, 0o700);
    // The links CU-5 makes point at `/` and at the fixture itself; gone first, so
    // no recursive removal can be asked to look through them.
    for (const l of ['rootlink', 'link']) {
      const p = join(f.root, l);
      try {
        if (lstatSync(p).isSymbolicLink()) unlinkSync(p);
      } catch {}
    }
    rmSync(f.root, { recursive: true, force: true });
  }
});

/** `rm.log`, `docker.log` or `sudo.log` as a list of calls, each a list of elements; `null` when never written. */
function calls(f: Fixture, log: string): string[][] | null {
  const p = join(f.root, log);
  if (!existsSync(p)) return null;
  const out: string[][] = [[]];
  for (const line of readFileSync(p, 'utf8').replace(/\n$/, '').split('\n')) {
    if (line === '--') out.push([]);
    else out[out.length - 1].push(line);
  }
  return out.filter((c) => c.length > 0);
}

const run = (f: Fixture, arg: string, env: Record<string, string> = {}, cwd = repoRoot) =>
  sh([BASH, '-c', '. "$0" && lu_remove_volumes "$1"', LIB, arg], cwd, { PATH: f.bin, ...env });

const keepReads = (f: Fixture) => (existsSync(f.keep) ? readFileSync(f.keep, 'utf8') : '(gone)');
/** The plain leg, tried once and first, on the resolved directory. */
const PLAIN_CALL = (f: Fixture) => [['-rf', f.volumes]];

describe('CU-1 plain rm, and the path most hosts take', () => {
  test('CU-1 a tree the operator can delete is removed by plain rm, and no stub is called', () => {
    const f = resetFixture('plain');
    const r = run(f, f.root);
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toBe('Removing volumes/...\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'docker.log')).toBeNull();
    expect(calls(f, 'sudo.log')).toBeNull();
  });

  test('CU-1 no volumes/ at all is success without a retry', () => {
    const f = resetFixture('none');
    const r = run(f, f.root);
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toBe('Removing volumes/...\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'docker.log')).toBeNull();
    expect(calls(f, 'sudo.log')).toBeNull();
  });
});

describe('CU-2 the container leg, which is what #32 adds', () => {
  test.skipIf(asRoot)('CU-2 the premise: the locked tree refuses the real rm -rf to this uid (skipped as uid 0: no mode refuses root; CU-2 to CU-4 run against the refusing stub rm)', () => {
    const f = resetFixture('locked');
    const r = sh([REAL_RM, '-rf', f.volumes]);
    expect(r.code).not.toBe(0);
    expect(keepReads(f)).toBe('probe\n');
  });

  test('CU-2 plain rm refused, nginx:latest present: the container removes it, and the argv mounts the project directory as one element', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: 'nginx:latest', LU_STUB_RUN: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(calls(f, 'sudo.log')).toBeNull();
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    const lines = r.stdout.split('\n');
    const order = [
      'Plain removal failed (files owned by another UID); retrying from a container...',
      'Removing volumes/ from a container (nginx:latest)...',
      'volumes/ removed from a container.'
    ].map((l) => lines.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(calls(f, 'docker.log')).toEqual([
      ['image', 'inspect', 'nginx:latest'],
      ['run', '--pull', 'never', '--rm', '--entrypoint', 'rm', '-v', `${f.root}:/v`, 'nginx:latest', '-rf', '/v/volumes']
    ]);
  });

  test('CU-2 nginx:latest absent, bun-runner present: both probed in that order, and the run names bun-runner', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: 'liquidupstart/bun-runner:latest', LU_STUB_RUN: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(calls(f, 'sudo.log')).toBeNull();
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(r.stdout).toContain('Removing volumes/ from a container (liquidupstart/bun-runner:latest)...');
    const log = calls(f, 'docker.log')!;
    expect(log.slice(0, 2)).toEqual([
      ['image', 'inspect', 'nginx:latest'],
      ['image', 'inspect', 'liquidupstart/bun-runner:latest']
    ]);
    expect(log.length).toBe(3);
    expect(log[2][0]).toBe('run');
    expect(log[2][8]).toBe('liquidupstart/bun-runner:latest');
    expect(log[2][10]).toBe('/v/volumes');
  });

  test('CU-2 the negative: nothing pulls, and --pull never are the two elements after run, in every call recorded', () => {
    const seen: string[][] = [];
    for (const images of ['nginx:latest', 'liquidupstart/bun-runner:latest']) {
      const f = resetFixture('locked');
      run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: images, LU_STUB_RUN: 'remove' });
      expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
      seen.push(...(calls(f, 'docker.log') ?? []));
    }
    const runs = seen.filter((c) => c[0] === 'run');
    expect(runs.length).toBe(2);
    for (const c of seen) {
      expect(c[0]).not.toBe('pull');
      expect(`${c[0]} ${c[1]}`).not.toBe('image pull');
    }
    for (const c of runs) expect(c.slice(1, 3)).toEqual(['--pull', 'never']);
  });
});

describe('CU-3 falling through to sudo, for each of the ways the leg cannot help', () => {
  const SUDO_CALL = (f: Fixture) => [['rm', '-rf', f.volumes]];

  test('CU-3 neither image present: no run, both named, then sudo removes it', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: '', LU_STUB_SUDO: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toContain(NO_IMAGE_LINE);
    expect(r.stdout).toContain('volumes/ removed with sudo.');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect((calls(f, 'docker.log') ?? []).filter((c) => c[0] === 'run')).toEqual([]);
    expect(calls(f, 'sudo.log')).toEqual(SUDO_CALL(f));
  });

  test('CU-3 no docker on PATH: the same line, straight to sudo', () => {
    const f = resetFixture('locked');
    unlinkSync(join(f.bin, 'docker'));
    const r = run(f, f.root, { ...REFUSE, LU_STUB_SUDO: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toContain(NO_IMAGE_LINE);
    expect(r.stdout).toContain('volumes/ removed with sudo.');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'docker.log')).toBeNull();
    expect(calls(f, 'sudo.log')).toEqual(SUDO_CALL(f));
  });

  test('CU-3 docker present and the daemon down: the same line, sudo, removed', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_DAEMON: 'down', LU_STUB_IMAGES: 'nginx:latest', LU_STUB_SUDO: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toContain(NO_IMAGE_LINE);
    expect(r.stdout).toContain('volumes/ removed with sudo.');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect((calls(f, 'docker.log') ?? []).filter((c) => c[0] === 'run')).toEqual([]);
    expect(calls(f, 'sudo.log')).toEqual(SUDO_CALL(f));
  });

  test('CU-3 the negative: a run that exits 0 and removes nothing is not believed', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: 'nginx:latest', LU_STUB_RUN: 'keep', LU_STUB_SUDO: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toContain('Container removal failed (nginx:latest); retrying with sudo...');
    expect(r.stdout).toContain('volumes/ removed with sudo.');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect((calls(f, 'docker.log') ?? []).filter((c) => c[0] === 'run').length).toBe(1);
    expect(calls(f, 'sudo.log')).toEqual(SUDO_CALL(f));
  });

  test('CU-3 the negative: a run that exits 125 with No such image falls through the same way', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: 'nginx:latest', LU_STUB_RUN: 'fail', LU_STUB_SUDO: 'remove' });
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toContain('Container removal failed (nginx:latest); retrying with sudo...');
    expect(r.stdout).toContain('volumes/ removed with sudo.');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect((calls(f, 'docker.log') ?? []).filter((c) => c[0] === 'run').length).toBe(1);
    expect(calls(f, 'sudo.log')).toEqual(SUDO_CALL(f));
  });
});

describe('CU-4 when every leg has failed', () => {
  test('CU-4 the negative: neither image and no sudo on PATH -- the error cleanup.sh printed before, exit 1, the tree kept', () => {
    const f = resetFixture('locked');
    unlinkSync(join(f.bin, 'sudo'));
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: '' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERROR: cannot remove volumes/ and sudo is unavailable.');
    expect(keepReads(f)).toBe('probe\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'sudo.log')).toBeNull();
    expect(r.stdout).not.toMatch(/^volumes\/ removed/m);
  });

  test('CU-4 the negative: sudo exits 1 -- still present after sudo, exit 1', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: '', LU_STUB_SUDO: 'fail' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERROR: volumes/ is still present after sudo rm -rf.');
    expect(keepReads(f)).toBe('probe\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'sudo.log')).toEqual([['rm', '-rf', f.volumes]]);
    expect(r.stdout).not.toMatch(/^volumes\/ removed/m);
  });

  test('CU-4 the negative: sudo exits 0 and removes nothing -- the same error, exit 1', () => {
    const f = resetFixture('locked');
    const r = run(f, f.root, { ...REFUSE, LU_STUB_IMAGES: '', LU_STUB_SUDO: 'keep' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERROR: volumes/ is still present after sudo rm -rf.');
    expect(keepReads(f)).toBe('probe\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    expect(calls(f, 'sudo.log')).toEqual([['rm', '-rf', f.volumes]]);
    expect(r.stdout).not.toMatch(/^volumes\/ removed/m);
  });
});

describe('CU-5 the guard, which exists because the function takes an argument', () => {
  const NOT_BELOW_ROOT = 'not an absolute path below /.';
  const NOT_A_DIRECTORY = 'not an existing directory.';
  /**
   * The plain tree, `rm` refusing and logging, no image and no `sudo` knob -- so a
   * guard that let `arg` through would leave `rm.log` and `sudo.log` as the only
   * trace -- run from the fixture root. `arg` may be built from the fixture.
   */
  const refused = (arg: string | ((f: Fixture) => string), why: string) => {
    const f = resetFixture('plain');
    const a = typeof arg === 'function' ? arg(f) : arg;
    const r = run(f, a, REFUSE, f.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`ERROR: refusing to remove volumes/ under '${a}': ${why}`);
    expect(calls(f, 'rm.log')).toBeNull();
    expect(calls(f, 'docker.log')).toBeNull();
    expect(calls(f, 'sudo.log')).toBeNull();
    expect(keepReads(f)).toBe('probe\n');
  };
  /** The plain tree with the real `rm`, run from the fixture root: removed, and the target is the resolved one. */
  const accepted = (arg: (f: Fixture) => string, prepare: (f: Fixture) => void = () => {}) => {
    const f = resetFixture('plain');
    prepare(f);
    const r = run(f, arg(f), {}, f.root);
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(r.stdout).toBe('Removing volumes/...\n');
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
  };

  test('CU-5 the negative: an empty argument is refused before any leg', () => refused('', NOT_BELOW_ROOT));

  test('CU-5 the negative: a relative path is refused the same way', () => refused('volumes-of-nobody', NOT_BELOW_ROOT));

  test('CU-5 the negative: / and /// are refused the same way', () => {
    refused('/', NOT_BELOW_ROOT);
    refused('///', NOT_BELOW_ROOT);
  });

  test('CU-5 the counterpart: an absolute path with a trailing slash and a space is accepted, and the tree removed', () => {
    accepted((f) => `${f.root}/`);
  });

  test('CU-5 the negative: /. and //. are refused the same way, the argument as given', () => {
    refused('/.', NOT_BELOW_ROOT);
    refused('//.', NOT_BELOW_ROOT);
  });

  test('CU-5 the negative: <dir> followed by one .. per component -- a .. that climbs to / -- is refused the same way', () => {
    // Built from the fixture rather than `/tmp/..`: on macOS /tmp is a link to
    // /private/tmp, so `cd -P /tmp/..` is /private and rightly accepted
    // (second review of #32, 2026-11-03).
    refused((f) => f.root + '/..'.repeat(f.root.split('/').length - 1), NOT_BELOW_ROOT);
  });

  test('CU-5 the negative: a symbolic link to / is refused the same way', () => {
    refused((f) => {
      symlinkSync('/', join(f.root, 'rootlink'));
      return join(f.root, 'rootlink');
    }, NOT_BELOW_ROOT);
  });

  test('CU-5 the negative: a directory that does not exist is refused as not an existing directory', () => {
    refused((f) => join(f.root, 'absent'), NOT_A_DIRECTORY);
  });

  test('CU-5 the counterpart: a .. that stays below / is accepted, and the target is the resolved directory', () => {
    accepted(
      (f) => `${f.root}/sub/..`,
      (f) => mkdirSync(join(f.root, 'sub'))
    );
  });

  test('CU-5 the counterpart: a symbolic link to the project directory is accepted, and the legs act on the resolved directory', () => {
    const f = resetFixture('locked');
    symlinkSync(f.root, join(f.root, 'link'));
    const r = run(f, join(f.root, 'link'), { ...REFUSE, LU_STUB_IMAGES: 'nginx:latest', LU_STUB_RUN: 'remove' }, f.root);
    expect(r.code).toBe(0);
    expect(existsSync(f.volumes)).toBe(false);
    expect(calls(f, 'rm.log')).toEqual(PLAIN_CALL(f));
    const runs = (calls(f, 'docker.log') ?? []).filter((c) => c[0] === 'run');
    expect(runs.length).toBe(1);
    expect(runs[0][7]).toBe(`${f.root}:/v`);
  });
});
