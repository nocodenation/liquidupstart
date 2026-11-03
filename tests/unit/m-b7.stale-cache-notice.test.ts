/**
 * M-B7 · Unit · The stale cache notice prints the project's own path, quoted, and touches nothing
 *
 * Purpose:  An installation that built under #10 still holds `volumes/nar_builder/m2`,
 *           and #10's entrypoint handed it to `builder` (uid 1500) with `chown -R -h`.
 *           On rootless Docker, the platform this stack targets, that is host uid
 *           101499 on every directory of the tree, so the notice's first wording --
 *           *"you can delete it"* -- failed for exactly the installations it was
 *           addressed to (#32, FR43). The notice now prints the command that works:
 *           a `docker run` of the builder's own image with the directory mounted.
 *           B7-4 reads that command out of the script's text. What the text cannot
 *           show is what reaches the operator: a `$PWD` that gets to stdout
 *           unexpanded, or a path whose quotes were lost, is only visible in the
 *           output -- and so is the path being the project's rather than the
 *           directory the script was run from. And whether the quoting *holds* is
 *           a property of the shell that will paste the line, which only a shell
 *           can answer: the review of #32 (2026-11-03) found the path printed
 *           between double quotes, which carry a space but not a `$`, a backtick
 *           or a `"`, so (5) and (6) evaluate the printed lines with `sh`.
 * Given:    A fixture made by `mkdtempSync` under the system temp directory with the
 *           prefix `` lu b7-10 a$b`c"d'e- `` -- a space, because the quoting is
 *           half of what the rows prove; `$b`, a backtick, `"` and `'`, because
 *           each is a character one quoting carries and another does not, and `'`
 *           is the one single quotes cannot carry unescaped, so it is what the
 *           `'\''` rule exists for. Not `$PWD`, which (2) forbids in the output,
 *           and not a newline, which FR43 states as out of reach. Under it
 *           `volumes/nar_builder/m2/org/probe.jar` with the line `probe` (`org/`
 *           because the real leftover's top level is Maven group directories;
 *           `probe.jar` because no coordinate produces a bare jar at that depth).
 *           `bin/docker`: a stub, `#!/bin/sh`, first on PATH, appending `$*` to
 *           `docker.log` beside `volumes/` and exiting 0 -- B5-1's shape -- so a
 *           run of the printed command would be recorded, never performed.
 *           `bin-eval/docker` and `bin-eval/rmdir`: recording stubs for (5) and
 *           (6), each appending every argument on its own line and then a line
 *           `--` to `eval.log` -- the shape of `m-cu.remove-volumes.test.ts`'s
 *           stubs, so a split or a merge cannot hide -- in a separate directory
 *           and log, so (3)'s *no `docker.log`* keeps its meaning. The
 *           counterpart's fixture is the same tree without `m2`.
 * When:     `bash config/scripts/start/nar-builder.sh "<fixture>"` -- the `$1`
 *           override no caller passes, there for a case to point the script at a
 *           fixture -- with the working directory the checkout root, so `$PWD`
 *           and the fixture differ. For (5): the stdout line whose trimmed form
 *           begins `docker run ` and the line after it, which must begin
 *           `rmdir ` (not the first such line: the prose above the commands
 *           begins with the word too), each run as `sh -c "<line>"` with PATH
 *           led by `bin-eval/`. For (6): the
 *           double-quoted form of the same path, the string the script printed
 *           until the review, run the same way.
 * Then:     (1) stdout holds `is left over from before 2026-10-10`, the exact string
 *           `docker run --pull never --rm --entrypoint rm -v '<q>/volumes/nar_builder:/v'
 *           liquidupstart/nar-builder:latest -rf /v/m2` with `<q>` the fixture's
 *           path and its `'` written `'\''`, `rmdir '<q>/volumes/nar_builder'`, and
 *           the words `rootless Docker` and `plain rm`; (2) neither `you can delete
 *           it` nor the five characters `$PWD`; (3) exit 0, `probe.jar` still reads
 *           `probe`, no `docker.log`; (4) with no `m2`: stdout empty, exit 0, no
 *           `docker.log`; (5) both evaluations exit 0 and `eval.log` holds two
 *           calls -- the eleven elements `run`, `--pull`, `never`, `--rm`,
 *           `--entrypoint`, `rm`, `-v`, `<fixture>/volumes/nar_builder:/v`,
 *           `liquidupstart/nar-builder:latest`, `-rf`, `/v/m2`, the path unescaped
 *           and verbatim as the eighth, then `<fixture>/volumes/nar_builder` alone;
 *           (6) `sh` exits non-zero and no `eval.log` exists.
 * Covers:   B7-10, FR43
 * Unhappy:  (2) and (3) are the negatives -- the old phrase or an unexpanded `$PWD`
 *           reaching the operator, and the script deleting or running anything.
 *           (4) is the counterpart that keeps the notice from becoming noise on
 *           every fresh install. (6) shows the fixture hostile, so (5) is shown
 *           able to fail: a path the old quoting carried would make (5) a pass
 *           about nothing. No tree here needs to be undeletable: the property is
 *           that nothing is attempted, and a deletable fixture still there
 *           afterwards shows it. A `:` or a newline in the path is deliberately
 *           not covered: FR43 states both as limits and the script has no branch
 *           for either.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = join(repoRoot, 'config/scripts/start/nar-builder.sh');
const SH = Bun.which('sh')!;
const IMAGE = 'liquidupstart/nar-builder:latest';

/** `s` as one shell word, whatever it holds -- the rule the script is held to, applied to the fixture's own stubs. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

type Fixture = { root: string; bin: string; binEval: string };

function fixture(withM2: boolean): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'lu b7-10 a$b`c"d\'e-'));
  mkdirSync(join(root, 'volumes', 'nar_builder'), { recursive: true });
  if (withM2) {
    mkdirSync(join(root, 'volumes', 'nar_builder', 'm2', 'org'), { recursive: true });
    writeFileSync(join(root, 'volumes', 'nar_builder', 'm2', 'org', 'probe.jar'), 'probe\n');
  }
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${shq(join(root, 'docker.log'))}\nexit 0\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  const binEval = join(root, 'bin-eval');
  mkdirSync(binEval);
  const log = shq(join(root, 'eval.log'));
  for (const s of ['docker', 'rmdir']) {
    writeFileSync(join(binEval, s), `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a" >> ${log}; done\nprintf '%s\\n' '--' >> ${log}\nexit 0\n`);
    chmodSync(join(binEval, s), 0o755);
  }
  return { root, bin, binEval };
}

const run = (f: Fixture) => sh(['bash', SCRIPT, f.root], repoRoot, { PATH: `${f.bin}:${process.env.PATH}` });
/** One printed line, pasted: what the operator's shell hands the command. */
const evaluate = (f: Fixture, line: string) => sh([SH, '-c', line], repoRoot, { PATH: `${f.binEval}:${process.env.PATH}` });

/** `eval.log` as a list of calls, each a list of elements; `null` when never written. */
function evalCalls(f: Fixture): string[][] | null {
  const p = join(f.root, 'eval.log');
  if (!existsSync(p)) return null;
  const out: string[][] = [[]];
  for (const line of readFileSync(p, 'utf8').replace(/\n$/, '').split('\n')) {
    if (line === '--') out.push([]);
    else out[out.length - 1].push(line);
  }
  return out.filter((c) => c.length > 0);
}

const stale = fixture(true);
const fresh = fixture(false);
const hostile = fixture(true);
afterAll(() => {
  for (const f of [stale, fresh, hostile]) rmSync(f.root, { recursive: true, force: true });
});

describe('B7-10 the stale cache directory is named with the command that works, and touched by nothing', () => {
  const r = run(stale);
  const q = stale.root.replace(/'/g, `'\\''`);

  test("B7-10 stdout carries the command with the fixture's own path single-quoted, its ' written '\\'', the rmdir line, and the reason a plain rm is refused", () => {
    expect(r.stdout).toContain('is left over from before 2026-10-10');
    // One string, so the quotes, the flag order and the image are each held --
    // and the path is the fixture's, every hostile character of it, not the checkout's.
    expect(r.stdout).toContain(`docker run --pull never --rm --entrypoint rm -v '${q}/volumes/nar_builder:/v' ${IMAGE} -rf /v/m2`);
    expect(r.stdout).toContain(`rmdir '${q}/volumes/nar_builder'`);
    expect(r.stdout).toContain('rootless Docker');
    expect(r.stdout).toContain('plain rm');
  });

  test('B7-10 the negative: neither the old phrase nor a literal $PWD reaches the output', () => {
    expect(r.stdout).not.toContain('you can delete it');
    expect(r.stdout).not.toContain('$PWD');
  });

  test('B7-10 the negative: the directory is named, not deleted -- and the command is printed, not run', () => {
    expect(r.code).toBe(0);
    expect(readFileSync(join(stale.root, 'volumes', 'nar_builder', 'm2', 'org', 'probe.jar'), 'utf8')).toBe('probe\n');
    expect(existsSync(join(stale.root, 'docker.log'))).toBe(false);
  });

  test('B7-10 the printed lines, evaluated by sh, reach docker and rmdir with the path as one element, verbatim', () => {
    const lines = r.stdout.split('\n').map((l) => l.trim());
    const at = lines.findIndex((l) => l.startsWith('docker run '));
    expect(at).toBeGreaterThanOrEqual(0);
    const dockerLine = lines[at];
    // The line after the command, not the first that begins `rmdir `: the prose
    // above the commands says "rmdir takes the empty parent", and the first run
    // of this row evaluated that sentence (2026-11-03).
    const rmdirLine = lines[at + 1] ?? '';
    expect(rmdirLine.startsWith('rmdir ')).toBe(true);
    expect(evaluate(stale, dockerLine).code).toBe(0);
    expect(evaluate(stale, rmdirLine).code).toBe(0);
    expect(evalCalls(stale)).toEqual([
      ['run', '--pull', 'never', '--rm', '--entrypoint', 'rm', '-v', `${stale.root}/volumes/nar_builder:/v`, IMAGE, '-rf', '/v/m2'],
      [`${stale.root}/volumes/nar_builder`]
    ]);
  });
});

test('B7-10 the negative: the same path double-quoted -- the form printed until the review -- is refused by sh and reaches nothing', () => {
  const old = `docker run --pull never --rm --entrypoint rm -v "${hostile.root}/volumes/nar_builder:/v" ${IMAGE} -rf /v/m2`;
  const e = evaluate(hostile, old);
  expect(e.code).not.toBe(0);
  expect(evalCalls(hostile)).toBeNull();
});

test('B7-10 the counterpart: with no m2 the script prints nothing and exits 0', () => {
  const r = run(fresh);
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('');
  expect(existsSync(join(fresh.root, 'docker.log'))).toBe(false);
});
