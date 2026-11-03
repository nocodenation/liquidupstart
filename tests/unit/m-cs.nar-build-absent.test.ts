/**
 * M-CS · Unit · nar-build says the builder may be switched off, and only when it may be
 *
 * Purpose:  With `ENABLE_LIQUID=0` there is no builder behind the proxy, and nginx answers
 *           `nar-builder.localhost` with a 502. `nar-build` printed any non-200 body as the
 *           builder's own refusal, so an agent read *"The NAR builder does not answer"* as
 *           something the builder had said. The builder answers 503 and 504 itself, and
 *           never 502 (`config/nar_builder/BuildServer.java`), so a 502 is the one answer
 *           that means it is not there.
 * Given:    `config/agents/bin/nar-build.sh --target`, which skips the `/repos` check, run
 *           with a stub `curl` first on `PATH` that writes a body to the file after `-o`
 *           and prints a status, as `-w '%{http_code}'` makes curl do.
 * When:     It runs three times, once per answer.
 * Then:     A 502 exits 1 with the existing "did not answer" message and the line naming
 *           `ENABLE_LIQUID=0`. A 503 exits 1 with the builder's body, unchanged and without
 *           the hint. A 200 prints the body and exits 0.
 * Covers:   CS-11, CS-FR7
 * Negative: the 502 is not passed off as the builder's refusal.
 * Counterpart: the builder's own 503 still is, without the hint, so a script that called
 *           every failure an absent builder cannot pass; and a 200 still succeeds.
 *
 * Test data: the 502 body is the page `nar-builder.localhost` serves while the builder is
 * absent, `The NAR builder does not answer: it is either switched off with Liquid under
 * Which apps to run in Configuration, or not running.`; the 503 body is the builder's own
 * from `BuildServer.java:91`, `nar-build refused: two builds are already running.` and
 * `Wait for one to finish and run it again.`; the 200 body is `nifi 2.9.0`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = join(repoRoot, 'config/agents/bin/nar-build.sh');
const bin = mkdtempSync(join(tmpdir(), 'lu-cs11-'));
afterAll(() => rmSync(bin, { recursive: true, force: true }));
writeFileSync(
  join(bin, 'curl'),
  `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in -o) shift; printf '%s' "$CS11_BODY" > "$1" ;; esac
  shift
done
printf '%s' "$CS11_STATUS"
`
);
chmodSync(join(bin, 'curl'), 0o755);

const ABSENT =
  'The NAR builder does not answer: it is either switched off with Liquid under Which apps to run in Configuration, or not running.\n';
const BUSY = 'nar-build refused: two builds are already running.\nWait for one to finish and run it again.\n';

const target = (status: string, body: string) =>
  sh(['sh', SCRIPT, '--target'], bin, { PATH: `${bin}:${process.env.PATH}`, CS11_STATUS: status, CS11_BODY: body });

describe('CS-11 nar-build without a builder', () => {
  test('CS-11 the negative: a 502 is read as an absent builder, naming ENABLE_LIQUID=0', () => {
    const r = target('502', ABSENT);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('nar-build refused: the builder did not answer');
    expect(r.stderr).toContain('It may be switched off: ENABLE_LIQUID=0 leaves the builder out.');
  });

  test('CS-11 the counterpart: the builder\'s own 503 passes through as its refusal, without the hint', () => {
    const r = target('503', BUSY);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(BUSY);
    expect(r.stderr).not.toContain('ENABLE_LIQUID');
  });

  test('CS-11 and a 200 prints its body and exits 0', () => {
    const r = target('200', 'nifi 2.9.0\n');
    expect({ code: r.code, stdout: r.stdout }).toEqual({ code: 0, stdout: 'nifi 2.9.0\n' });
  });
});
