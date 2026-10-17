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
 * Given:    `scripts/state.sh`, with a **stub `gh` on PATH** that prints what the
 *           forge would — the idiom `B6-3` uses for `mvn` and `A11-11` for
 *           `docker` — and, for the refusal, a PATH with no `gh` at all
 * When:     It is run in each of those two environments
 * Then:     It reports what the stub said, ordered by number; and without `gh` it
 *           refuses with a non-zero status rather than printing a picture with the
 *           pull requests silently missing
 * Covers:   A17-1
 * Negative: The missing `gh`. *"Cannot measure" is not "nothing is open"* — the
 *           same rule `SP-4` carries for the disk and `B5-33` for the image, and
 *           the reason a tool that cannot answer must say so.
 *
 * On the third case: it reads the script's own text rather than its behaviour,
 *           and says so. `gh`'s `--jq` runs inside `gh`, so a stub cannot exercise
 *           the expression — and that expression carries a trap worth a case: an
 *           unset `reviewDecision` arrives as an **empty string**, not as null, so
 *           `.reviewDecision // "first review open"` keeps the empty string and
 *           every pull request reads as reviewed. Measured by walking into it on
 *           2026-10-17, in a hand-run that marked all eleven open pull requests
 *           as having a decision.
 */

import { test, expect, describe } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const STATE = join(repoRoot, 'scripts/state.sh');

function withStubGh(lines: string[]): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lu-a17-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    // It answers the two shapes the script asks for: the table, and the list of
    // branch names used for the conflict walk. Flags are ignored, which is the
    // point of a stub -- the subject is what the script does with the answer.
    const stub = [
      '#!/bin/sh',
      'case "$*" in',
      '  *headRefName*jq*".[].headRefName"*) printf \'\' ;;',
      `  *) cat <<'OUT'`,
      ...lines,
      'OUT',
      '  ;;',
      'esac',
      'exit 0'
    ].join('\n');
    writeFileSync(join(bin, 'gh'), stub);
    chmodSync(join(bin, 'gh'), 0o755);
    const r = sh([STATE], repoRoot, { PATH: `${bin}:${process.env.PATH ?? ''}` });
    return { code: r.code, output: r.output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('A17-1 the state is read from the forge, not from a document', () => {
  const r = withStubGh([
    '#41\tfirst review open\t2026-10-17\tfix/teardown-orphans',
    '#15\tchanges requested\t2026-10-16\tfeature/openclaw-pairing-recovery'
  ]);

  test('A17-1 it reports what the forge said', () => {
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('fix/teardown-orphans');
    expect(r.output).toContain('changes requested');
  });

  test('A17-1 and in order of number, so a list of twenty can be read', () => {
    // #15 before #41, although the stub printed them the other way round.
    const at15 = r.output.indexOf('#15');
    const at41 = r.output.indexOf('#41');
    expect(at15).toBeGreaterThan(0);
    expect(at41).toBeGreaterThan(at15);
  });

  test('A17-1 and `main` comes from git rather than from the forge', () => {
    // The one fact the forge is not asked for: a stub that answered nothing about
    // pull requests still has to leave this line standing.
    const head = sh(['git', 'log', '--oneline', '-1', 'origin/main'], repoRoot).stdout.trim().split(' ')[0];
    expect(head.length).toBeGreaterThan(6);
    expect(r.output).toContain(head);
  });
});

describe('A17-1 and a tool that cannot measure says so', () => {
  test('A17-1 the negative: with no gh on PATH it refuses, and does not print an empty picture', () => {
    // An empty table reads as "nothing is open", which is the failure this whole
    // case exists against: a state that is wrong rather than absent.
    const dir = mkdtempSync(join(tmpdir(), 'lu-a17-nogh-'));
    try {
      const bin = join(dir, 'bin'); // deliberately empty
      mkdirSync(bin, { recursive: true });
      // The system directories stay on PATH, because the script's own shebang is
      // `#!/usr/bin/env bash` and env searches PATH for it: a PATH of nothing
      // makes the case measure the shebang rather than the refusal. Walked into
      // on 2026-10-17. `gh` lives in /opt/homebrew/bin on this host and in
      // /usr/local/bin elsewhere, so neither is listed here.
      const r = sh([STATE], repoRoot, { PATH: `${bin}:/usr/bin:/bin` });
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('needs the gh CLI');
      expect(r.output).toMatch(/cannot measure.*is not.*nothing is open/is);
      expect(r.output).not.toContain('open pull requests');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('A17-1 and the empty review decision is read as what it is', () => {
  test('A17-1 an unset decision is tested for the empty string, not left to `//`', () => {
    // A contract assertion, and it says so: `gh`'s --jq runs inside gh, so a stub
    // cannot exercise the expression. The trap is real and was walked into on
    // 2026-10-17 -- an unset reviewDecision arrives as "" and not as null, so
    // `.reviewDecision // "first review open"` keeps the empty string and every
    // pull request reads as reviewed. A hand-run marked all eleven that way.
    const body = readFileSync(STATE, 'utf8');
    expect(body).toContain('(.reviewDecision // "") == ""');
    expect(body).not.toMatch(/\.reviewDecision \/\/ "first/);
  });
});
