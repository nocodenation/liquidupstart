/**
 * A11-5 to A11-9 — the tier that touches this machine is asked for, not opted out of.
 *
 * Purpose: the second half of the 2026-09-17 incident. `tests/run.sh` ran the
 * stack levels by default and `--no-system` turned them off, so
 * `./tests/run.sh m-oc` — an ordinary check of one milestone — wrote into
 * `volumes/_openclaw/openclaw.json` and restarted the gateway on the operator's
 * machine. It left the gateway exited 127 and the configuration missing a key,
 * and 26 M-B4 cases then failed because they build their bundles through
 * `docker compose run`.
 *
 * A default that is safe only when you remember a flag is not a default. These
 * levels are the ones that act on the installation, so asking for them is now a
 * decision someone makes in writing.
 *
 * Given  the runner, and a repository holding files at every level
 * When   it is invoked with no flags, with `--system`, and with `--no-system`
 * Then   the stack levels are absent, present, and absent again — and the run
 *        says, every time, how many files it did not run and how to run them
 * And    every case at those levels gives the installation back through one
 *        helper, rather than restoring the field it happens to remember
 *
 * A11-6 is the positive counterpart: a tier nobody can run is as useless as one
 * that runs by accident. A11-9 is the one that would have caught the incident
 * itself — it reads the system cases and refuses a bespoke restore. A11-10 came
 * out of the first deliberate run of the repaired tier: the restores restarted
 * the gateway without waiting for it, so the next file met a starting container
 * and read `502`.
 *
 * Test data: `./tests/run.sh m-oc --list`, whose milestone spans both kinds of
 * level (17 files outside the stack levels, 3 at them), and the literal strings
 * `tests/system/` and `tests/e2e/` in its output. The files read for A11-9 are
 * every `*.test.ts` under `tests/system/`.
 *
 * Requirements covered: A11-5 to A11-10, and the 2026-09-17 incident.
 */
import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const runner = join(repoRoot, 'tests', 'run.sh');
const list = (args: string[]) => sh(['bash', runner, 'm-oc', '--list', ...args], repoRoot);
const atStackLevels = (out: string) =>
  out.split('\n').filter((l) => l.includes('/tests/system/') || l.includes('/tests/e2e/'));

describe('A11-5 the stack levels are not run unless they are asked for', () => {
  const r = list([]);

  test('no file at those levels is selected', () => {
    expect(atStackLevels(r.output)).toEqual([]);
  });

  test('and files at the other levels still are, so this is a filter and not a refusal', () => {
    expect(r.output).toContain('/tests/unit/');
    expect(r.code).toBe(0);
  });
});

describe('A11-6 and they run when they are', () => {
  test('--system selects them', () => {
    // The counterpart. These cases are the only ones that exercise the running
    // stack, and a suite that cannot reach them has stopped testing the product.
    const r = list(['--system']);
    expect(atStackLevels(r.output).length).toBeGreaterThan(0);
    expect(r.code).toBe(0);
  });
});

describe('A11-7 the skipped tier is named out loud', () => {
  test('the count and the flag are printed, not merely implied', () => {
    // A tier that is skipped silently is a tier nobody remembers exists, and
    // "the suite is green" then means less than the person saying it thinks.
    const r = list([]);
    expect(r.output).toContain('SKIPPED:');
    expect(r.output).toContain('--system');
    expect(r.output).toMatch(/write into volumes\/ and restart containers/);
  });
});

describe('A11-8 --no-system still means what it said', () => {
  test('it is accepted, and selects the same files as the default', () => {
    // Milestone documents, the handover and everyone's fingers name this flag.
    // It now describes the default rather than changing it, which is a smaller
    // surprise than an unknown-option error in a document's "done when" line.
    const plain = list([]).output.split('\n').filter((l) => l.endsWith('.test.ts'));
    const explicit = list(['--no-system']).output.split('\n').filter((l) => l.endsWith('.test.ts'));
    expect(explicit).toEqual(plain);
    expect(explicit.length).toBeGreaterThan(0);
  });
});

describe('A11-9 every case at those levels gives the installation back', () => {
  const dir = join(repoRoot, 'tests', 'system');
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts'));

  test('the scan has material', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('a case that writes into volumes/ protects what it writes', () => {
    // The shape of the incident: each file had its own restore, two of them put
    // back a single field into a document read at restore time, and what another
    // file had changed in between survived wearing the original's name.
    const offenders = files
      .map((f) => ({ f, body: readFileSync(join(dir, f), 'utf8') }))
      .filter(({ body }) => /writeFileSync\(|Bun\.write\(/.test(body))
      .filter(({ body }) => !/\bprotect\(/.test(body))
      .map(({ f }) => `tests/system/${f}`);
    expect(offenders).toEqual([]);
  });

  test('and a restart is waited out, never merely asked for', () => {
    // A restore that returns while the gateway is still starting hands the next
    // file a 502. Measured on 2026-09-17, with OC-13 failing twice against a
    // stack that was fine -- so the wait belongs in one helper rather than in
    // whichever copy of the loop a case happened to keep.
    const offenders = files
      .map((f) => ({ f, body: readFileSync(join(dir, f), 'utf8') }))
      .filter(({ body }) => /compose\(\[\s*'restart'/.test(body))
      .map(({ f }) => `tests/system/${f}`);
    expect(offenders).toEqual([]);
  });

  test('and none of them keeps a restore of its own beside it', () => {
    // Two restores for one file is how they disagree. The helper captures once
    // per path however many files ask, which only holds while it is the only one.
    const offenders = files
      .map((f) => ({ f, body: readFileSync(join(dir, f), 'utf8') }))
      .filter(({ body }) => /afterAll\(\s*\(\)\s*=>\s*\{[\s\S]{0,400}?writeFileSync\(/.test(body))
      .map(({ f }) => `tests/system/${f}`);
    expect(offenders).toEqual([]);
  });
});
