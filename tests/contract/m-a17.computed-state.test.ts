/**
 * M-A17 · Contract · The state of the work is asked for, not remembered
 *
 * Purpose:  `HANDOFF.md` carried the state of every pull request in prose, and
 *           prose does not keep up. On 2026-10-16 it said #21 was *"never
 *           reviewed"* while a review of #21 was being answered — the reviewer
 *           asked for that row to be corrected, as `F4` of his round. On
 *           2026-10-17 its own current section said **nine** were open when
 *           **twelve** were, hours after it was written. Two copies of one fact,
 *           and only one of them changes when something merges.
 *
 *           `CLAUDE.md` is explicit about which of the two to reach for: *"prefer
 *           a computed answer to a rule an agent has to remember… A computed
 *           answer reads current state, so it cannot go stale."* A count of open
 *           pull requests is a fact, not a judgement, so it is computed now and
 *           the handover keeps the map and the lessons.
 * Given:    A copy of `scripts/state.sh` inside a fixture repository whose
 *           `origin` is a local bare repository — so nothing of the operator's is
 *           fetched and no network is reached — and a **stub `gh` on PATH** that
 *           runs the script's own `--jq` expression through `jq` over a fixture
 *           answer, the idiom `B6-3` uses for `mvn` and `A11-11` for `docker`.
 *           For A17-2, `lu_merge_state` evaluated out of the script and called
 *           inside `$(...)`, the way the script calls it.
 * When:     The script runs against forges that answer, answer nothing, fail, or
 *           are absent, and against a git that cannot `merge-tree --write-tree`;
 *           the function is handed pairs of fixture branches.
 * Then:     It prints the forge's answer in number order with the decision it
 *           actually carries, judges each branch against its own base, says
 *           CANNOT TELL wherever it could not measure, and refuses outright when
 *           it cannot ask the forge at all. The function names the conflicted
 *           files in any locale and for any kind of conflict.
 * Covers:   A17-1, A17-2
 * Negative: The absent and the failing forge, the unfetchable branch, the old
 *           git, the conflicts and the missing ref. *"Cannot measure" is not
 *           "nothing is open"* — the same rule `SP-4` carries for the disk and
 *           `B5-33` for the image.
 *
 * Precondition: a `jq` that runs, because `gh --jq` runs inside `gh` and the stub
 *           needs another evaluator for the same expression; asserted by its own
 *           case rather than assumed. *Runs*, not *is on PATH*: on this host the
 *           first `jq` on PATH is an x86_64 build from 2022 with no Rosetta to run
 *           it, and zsh quietly falls through to `/usr/bin/jq` where bash does
 *           not. Measured 2026-10-20. The German-locale case skips where this host's
 *           git has no German catalogue — it asks git first, since without the
 *           translation it would pass against English and prove nothing.
 */

import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, copyFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { git, commit } from '../lib/gitfixture';

const STATE = join(repoRoot, 'scripts/state.sh');
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function ok(dir: string, args: string[]): string {
  const r = git(dir, args);
  if (r.code !== 0) throw new Error(`fixture: git ${args.join(' ')} failed: ${r.output}`);
  return r.stdout.trim();
}

function which(tool: string): string {
  return sh(['sh', '-c', `command -v ${tool}`]).stdout.trim();
}

function runs(path: string): boolean {
  try {
    return existsSync(path) && sh([path, '--version']).code === 0;
  } catch {
    return false; // EBADARCH and the like: spawn throws rather than failing
  }
}

const JQ =
  (process.env.PATH ?? '')
    .split(delimiter)
    .map((d) => join(d, 'jq'))
    .find(runs) ?? '';

// The branches, and what each one is for:
//   lu-a17/collides  rewrites shared.txt's line, which main rewrites differently
//   lu-a17/agrees    diverged from main, touching only other.txt — clean
//   lu-a17/deletes   removes doomed.txt, which main modifies — modify/delete
//   lu-a17/stacked   on top of lu-a17/collides: conflicts with main through its
//                    base, merges clean into that base
//   lu-a17/gone      not on origin at all, while a stale tracking ref of that
//                    name is lying here — what a branch deleted upstream leaves
type Fixture = { root: string; work: string; originHead: string; stale: string };

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'lu-a17-'));
  roots.push(root);
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  ok(root, ['init', '-q', '--bare', '-b', 'main', origin]);
  ok(root, ['init', '-q', '-b', 'main', work]);
  commit(work, { 'shared.txt': 'original\n', 'other.txt': 'untouched\n', 'doomed.txt': 'kept\n' }, 'lu-a17 base');
  ok(work, ['checkout', '-q', '-b', 'lu-a17/collides']);
  commit(work, { 'shared.txt': 'theirs\n' }, 'lu-a17 theirs');
  ok(work, ['checkout', '-q', '-b', 'lu-a17/stacked']);
  commit(work, { 'stacked.txt': 'on top\n' }, 'lu-a17 stacked');
  ok(work, ['checkout', '-q', '-b', 'lu-a17/agrees', 'main']);
  commit(work, { 'other.txt': 'changed elsewhere\n' }, 'lu-a17 elsewhere');
  ok(work, ['checkout', '-q', '-b', 'lu-a17/deletes', 'main']);
  ok(work, ['rm', '-q', 'doomed.txt']);
  ok(work, ['commit', '-qm', 'lu-a17 deletes']);
  ok(work, ['checkout', '-q', 'main']);
  commit(work, { 'shared.txt': 'ours\n', 'doomed.txt': 'changed on main\n' }, 'lu-a17 fixture head');
  ok(work, ['remote', 'add', 'origin', origin]);
  ok(work, ['push', '-q', 'origin', 'main', 'lu-a17/collides', 'lu-a17/stacked', 'lu-a17/agrees', 'lu-a17/deletes']);
  ok(work, ['fetch', '-q', 'origin']);
  const stale = ok(work, ['rev-parse', 'lu-a17/agrees']);
  ok(work, ['update-ref', 'refs/remotes/origin/lu-a17/gone', stale]);
  mkdirSync(join(work, 'scripts'));
  copyFileSync(STATE, join(work, 'scripts/state.sh'));
  chmodSync(join(work, 'scripts/state.sh'), 0o755);
  return { root, work, originHead: ok(work, ['log', '--oneline', '-1', 'origin/main']), stale };
}

// The forge's answer, in the shape `gh pr list --json` gives it, deliberately out
// of number order. Numbers and branch names are invented so that nothing a real
// `main` says — `Merge pull request #N from …` — can satisfy an assertion.
const FORGE = [
  { number: 9002, author: { login: 'probe-ours' }, reviewDecision: 'CHANGES_REQUESTED', reviews: [{ state: 'CHANGES_REQUESTED' }], headRefName: 'lu-a17/collides', baseRefName: 'main', updatedAt: '2026-10-16T09:00:00Z' },
  { number: 9001, author: { login: 'probe-ours' }, reviewDecision: '', reviews: [], headRefName: 'lu-a17/agrees', baseRefName: 'main', updatedAt: '2026-10-17T09:00:00Z' },
  { number: 9004, author: { login: 'probe-theirs' }, reviewDecision: '', reviews: [], headRefName: 'lu-a17/gone', baseRefName: 'main', updatedAt: '2026-10-18T09:00:00Z' },
  { number: 9003, author: { login: 'probe-ours' }, reviewDecision: '', reviews: [{ state: 'COMMENTED' }], headRefName: 'lu-a17/stacked', baseRefName: 'lu-a17/collides', updatedAt: '2026-10-19T09:00:00Z' }
];

// mode: 'answer' runs the script's --jq over the fixture answer; 'fail' is a forge
// that refuses every call; 'once' answers the first call and refuses the rest,
// which is what a rate limit hitting mid-run looks like.
function stubGh(root: string, answer: unknown, mode: 'answer' | 'fail' | 'once' = 'answer'): string {
  const bin = mkdtempSync(join(root, 'bin-'));
  const data = join(bin, 'answer.json');
  writeFileSync(data, JSON.stringify(answer));
  const calls = join(bin, 'calls');
  const stub = `#!/bin/sh
n=$(cat '${calls}' 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > '${calls}'
if [ '${mode}' = fail ] || { [ '${mode}' = once ] && [ "$n" -gt 1 ]; }; then
  echo 'HTTP 401: Bad credentials (https://api.github.com/graphql)' >&2
  exit 1
fi
expr=''
while [ $# -gt 0 ]; do
  case "$1" in --jq) shift; expr="$1" ;; esac
  shift
done
exec '${JQ}' -r "$expr" '${data}'
`;
  writeFileSync(join(bin, 'gh'), stub);
  chmodSync(join(bin, 'gh'), 0o755);
  return bin;
}

function run(work: string, bin: string): { code: number; output: string } {
  const r = sh([join(work, 'scripts/state.sh')], work, { PATH: `${bin}:${process.env.PATH ?? ''}` });
  return { code: r.code, output: r.output };
}

function section(output: string, heading: string): string {
  const start = output.indexOf(`=== ${heading}`);
  if (start < 0) return '';
  const rest = output.slice(start + 4);
  const end = rest.indexOf('\n=== ');
  return end < 0 ? rest : rest.slice(0, end);
}

function rowOf(merges: string, branch: string): string {
  return merges.split('\n').find((l) => l.trim().startsWith(`${branch} `)) ?? '';
}

test('A17-1 precondition: a jq that runs, for the stub forge', () => {
  expect(JQ, "the stub runs the script's own --jq expression through jq").not.toBe('');
});

describe('A17-1 the state is read from the forge, not from a document', () => {
  const f = fixture();
  const r = run(f.work, stubGh(f.root, FORGE));
  const prs = section(r.output, 'open pull requests');
  const merges = section(r.output, 'does each open branch');

  test('A17-1 it reports what the forge said, author included', () => {
    expect(r.code, r.output).toBe(0);
    expect(prs).toMatch(/#9001\tfirst review open\t2026-10-17\tprobe-ours\tlu-a17\/agrees/);
    expect(prs).toMatch(/#9004\tfirst review open\t2026-10-18\tprobe-theirs\tlu-a17\/gone/);
  });

  test('A17-1 and in order of number, so a list of twenty can be read', () => {
    const order = ['#9001', '#9002', '#9003', '#9004'].map((n) => prs.indexOf(n));
    expect(order.every((at) => at > 0), prs).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('A17-1 an unset decision reads as no review, not as an empty decision', () => {
    // The trap: "" is not null, so `.reviewDecision // "first review open"` keeps
    // it and every pull request reads as reviewed. Walked into on 2026-10-17.
    expect(prs).toMatch(/#9001\tfirst review open\t/);
    expect(prs).toMatch(/#9002\tchanges requested\t/);
  });

  test('A17-1 a review that only commented reads as reviewed, not as untouched', () => {
    // No decision is set by a COMMENTED review, so the decision alone calls this
    // "first review open" — the F4 mistake, made by the tool written against it.
    expect(prs).toMatch(/#9003\treviewed, no decision\t/);
  });

  test('A17-1 and `main` comes from git rather than from the forge', () => {
    expect(f.originHead).toContain('lu-a17 fixture head');
    expect(section(r.output, 'main')).toContain(f.originHead);
  });

  test('A17-1 a branch that diverged from main and touches another file merges clean', () => {
    expect(rowOf(merges, 'lu-a17/agrees')).toMatch(/\bclean$/);
  });

  test('A17-1 a branch that collides with main is reported as conflicting', () => {
    expect(rowOf(merges, 'lu-a17/collides')).toContain('CONFLICT: shared.txt');
  });

  test('A17-1 a stacked branch is judged against its own base, not against main', () => {
    // Against main it conflicts through lu-a17/collides; against its base it is
    // clean. #17 targets feature/mutation-registry, so this is not hypothetical.
    expect(rowOf(merges, 'lu-a17/stacked')).toBe(`  ${'lu-a17/stacked'.padEnd(42)} clean  (into lu-a17/collides)`);
  });

  test('A17-1 a branch that cannot be fetched is not judged on the stale ref lying here', () => {
    // The stale ref points at a commit that would merge clean.
    expect(git(f.work, ['rev-parse', 'origin/lu-a17/gone']).stdout.trim()).toBe(f.stale);
    expect(rowOf(merges, 'lu-a17/gone')).toContain('CANNOT TELL: could not fetch it');
  });
});

describe('A17-1 and a tool that cannot measure says so', () => {
  test('A17-1 the negative: with no gh on PATH it refuses, and does not print an empty picture', () => {
    // An empty table reads as "nothing is open", which is the failure this whole
    // case exists against. The PATH holds bash and dirname and nothing else —
    // bash because the shebang is `#!/usr/bin/env bash` and env searches PATH,
    // dirname because the script needs it before the check. /usr/bin is not on
    // it: GitHub's and Debian's packages both install gh at /usr/bin/gh.
    const f = fixture();
    const bin = mkdtempSync(join(f.root, 'nogh-'));
    symlinkSync(which('bash'), join(bin, 'bash'));
    symlinkSync(which('dirname'), join(bin, 'dirname'));
    const PATH = bin;
    expect(sh(['/bin/sh', '-c', 'command -v gh'], f.work, { PATH }).code, 'gh must really be absent').not.toBe(0);
    const r = sh([join(f.work, 'scripts/state.sh')], f.work, { PATH });
    expect(r.code).toBe(2);
    expect(r.output).toContain('needs the gh CLI');
    expect(r.output).toMatch(/cannot measure.*is not.*nothing is open/is);
    expect(r.output).not.toContain('open pull requests');
  });

  test('A17-1 the negative: a forge that refuses refuses the run, and prints no table', () => {
    const f = fixture();
    const r = run(f.work, stubGh(f.root, FORGE, 'fail'));
    expect(r.code).toBe(3);
    expect(r.output).toContain('could not read the open pull requests');
    expect(r.output).toContain('Bad credentials');
    expect(r.output).not.toContain('=== open pull requests');
    expect(r.output).not.toContain('=== does each open branch');
  });

  test('A17-1 the negative: a forge that stops answering mid-run still leaves a row for every branch', () => {
    // The walk used to ask the forge a second time, in `for b in $(gh ...)`,
    // whose status `set -e` never sees: an empty section under the heading.
    const f = fixture();
    const r = run(f.work, stubGh(f.root, FORGE, 'once'));
    expect(r.code, r.output).toBe(0);
    const merges = section(r.output, 'does each open branch');
    for (const pr of FORGE) expect(rowOf(merges, pr.headRefName), pr.headRefName).not.toBe('');
  });

  test('A17-1 the positive: a forge that answers nothing open is believed, and main still stands', () => {
    const f = fixture();
    const r = run(f.work, stubGh(f.root, []));
    expect(r.code, r.output).toBe(0);
    expect(section(r.output, 'open pull requests')).toContain('  none');
    expect(section(r.output, 'main')).toContain(f.originHead);
  });

  test('A17-1 the negative: a list as long as the limit says there may be more', () => {
    const f = fixture();
    const many = Array.from({ length: 100 }, (_, i) => ({ ...FORGE[1], number: 9100 + i }));
    const r = run(f.work, stubGh(f.root, many));
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('asked for at most 100; there may be more');
  });

  test('A17-1 the positive: a shorter list does not say so', () => {
    const f = fixture();
    const r = run(f.work, stubGh(f.root, FORGE));
    expect(r.code, r.output).toBe(0);
    expect(r.output).not.toContain('there may be more');
  });

  test('A17-1 the negative: a git without merge-tree --write-tree says so once, and judges nothing', () => {
    // The wrapper answers as Ubuntu 22.04's git 2.34.1 did on 2026-10-20 —
    // `fatal: unknown rev --write-tree`, exit 128 — and is real git otherwise.
    const f = fixture();
    const bin = stubGh(f.root, FORGE);
    writeFileSync(
      join(bin, 'git'),
      `#!/bin/sh
case "$*" in
  *merge-tree*--write-tree*) echo 'fatal: unknown rev --write-tree' >&2; exit 128 ;;
  --version|version) echo 'git version 2.34.1'; exit 0 ;;
esac
exec '${which('git')}' "$@"
`
    );
    chmodSync(join(bin, 'git'), 0o755);
    const r = run(f.work, bin);
    const merges = section(r.output, 'does each open branch');
    expect(merges).toContain('CANNOT TELL for any branch');
    expect(merges).toContain('needs git 2.38 or newer, and this is git version 2.34.1');
    expect(merges).not.toContain('clean');
    expect(merges).not.toContain('lu-a17/');
  });
});

describe('A17-2 a conflict is reported as a conflict', () => {
  // Evaluated out of the script, not reimplemented — the idiom B6-3 established —
  // and called inside `$(...)`, as the script calls it. Bash clears `set -e` in a
  // command substitution, so a case calling it bare runs it under rules the
  // script never applies.
  const f = fixture();
  const mergeState = (base: string, branch: string, env: Record<string, string> = {}) =>
    sh(
      [
        'bash',
        '-c',
        `set -euo pipefail; eval "$(sed -n '/^lu_merge_state() {/,/^}/p' ${JSON.stringify(STATE)})"; printf '%s\\n' "$(lu_merge_state ${JSON.stringify(base)} ${JSON.stringify(branch)})"`
      ],
      f.work,
      env
    ).stdout.trim();

  test('A17-2 precondition: this git can run merge-tree --write-tree', () => {
    // git 2.38 or newer. Without it every case below fails as CANNOT TELL, which
    // is the tool being right about the host rather than wrong about a merge.
    expect(git(f.work, ['merge-tree', '--write-tree', 'main', 'main']).stdout.trim()).toMatch(/^[0-9a-f]{40}/);
  });

  const GERMAN = { LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8', LANGUAGE: 'de' };
  const translated = sh(['git', 'merge-tree', '--write-tree', 'main', 'lu-a17/collides'], f.work, GERMAN).output.includes('KONFLIKT');

  test('A17-2 two branches editing one line are reported as conflicting, and the file is named', () => {
    expect(mergeState('main', 'lu-a17/collides')).toBe('CONFLICT: shared.txt');
  });

  test('A17-2 a modify/delete conflict names the file, not a word out of the message', () => {
    // git: "CONFLICT (modify/delete): doomed.txt deleted in … left in tree." —
    // the old `sed 's/.*in //'` reported a conflict in `tree.`.
    expect(mergeState('main', 'lu-a17/deletes')).toBe('CONFLICT: doomed.txt');
  });

  test.skipIf(!translated)('A17-2 under a German locale a conflict is still a conflict', () => {
    // git prints `KONFLIKT (Inhalt): Merge-Konflikt in shared.txt`, and a check
    // for the English word reported CANNOT TELL.
    expect(mergeState('main', 'lu-a17/collides', GERMAN)).toBe('CONFLICT: shared.txt');
  });

  test('A17-2 the counterpart: a diverged branch touching another file is clean', () => {
    // Without this, "always CONFLICT" passes the scenarios above.
    expect(mergeState('main', 'lu-a17/agrees')).toBe('clean');
  });

  test('A17-2 and a ref this host does not have is neither', () => {
    // It exits 1 like a conflict does; only the missing tree id tells them apart.
    const answer = mergeState('main', 'origin/nothing-like-this');
    expect(answer).toContain('CANNOT TELL (git exited 1)');
    expect(answer).not.toContain('clean');
  });
});
