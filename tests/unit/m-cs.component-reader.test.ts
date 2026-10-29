/**
 * M-CS · Unit · The shell reader of the three switches
 *
 * Purpose:  One function decides on and off for `build.sh` and `start.sh`, and a misread
 *           costs either a 30-minute build or a service left out without a word.
 *           `start.sh`'s `get_env` keeps a ` # comment` in the value and `env_value` takes
 *           a key's first line, so neither is the reader here.
 * Given:    `config/scripts/start/lib/components.sh`, sourced in `bash -c` as OC-79
 *           sources `dockerfile-render.sh`; one `.env` per row of
 *           `tests/lib/component-values.ts`, written to a temporary directory.
 * When:     `lu_component_state <file> ENABLE_LIQUID` runs on each; `lu_components_check`
 *           on a valid file and on one with two refused keys; `lu_component_profiles`
 *           on each combination of switches.
 * Then:     On and off rows print `on` or `off`, exit 0 and say nothing on stderr. A
 *           refused row exits 1, prints nothing on stdout, and names the key and its
 *           value in an `Error:` line and an `::aiw-error::` line. The last of two lines
 *           decides. The check names every refused key, not only the first. The profiles
 *           are exactly those of what is on, in the order liquid, openclaw, opencode.
 * Covers:   CS-1, CS-FR1, CS-FR2
 * Negative: `0`, `'0'`, `0 # off` and `0` with a carriage return read as off; `yes`,
 *           `O`, `2`, `off` and `true` are refused; a profile of a switched-off
 *           component is not listed, and with all three off the list is empty.
 * Counterpart: `1`, an absent key, an empty value, `"1"` and `1 # on` read as on, so a
 *           reader that called everything off or refused everything cannot pass; and a
 *           valid file passes the check.
 *
 * Test data: the rows of `tests/lib/component-values.ts`, stated there with why each is
 * shaped as it is. The two-refusal file is `ENABLE_LIQUID=yes` and `ENABLE_OPENCODE=off`
 * with `ENABLE_OPENCLAW=1` between them. The profile files hold `ENABLE_LIQUID=0`,
 * `ENABLE_OPENCLAW=0`, `ENABLE_OPENCODE=0`, all three at `0`, or none of the keys.
 * Runs under whichever bash is on PATH: 3.2 on macOS, 5.x on Linux, and both count.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { ROWS, refusedValue, type Row } from '../lib/component-values';

const LIB = join(repoRoot, 'config/scripts/start/lib/components.sh');
const dir = mkdtempSync(join(tmpdir(), 'lu-cs1-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function envFile(text: string): string {
  const file = join(dir, `env-${n++}`);
  writeFileSync(file, text);
  return file;
}

function run(fn: string, text: string, ...args: string[]) {
  const file = envFile(text);
  return sh(['bash', '-c', `. "$1"; shift; ${fn} "$@"`, 'cs1', LIB, file, ...args]);
}

const state = (row: Row) => run('lu_component_state', row.env, 'ENABLE_LIQUID');

describe('CS-1 the shell reader reads on and off', () => {
  for (const row of ROWS.filter((r) => r.expected !== 'refused')) {
    test(`CS-1 ${row.name} reads as ${row.expected}`, () => {
      const r = state(row);
      expect({ code: r.code, stdout: r.stdout, stderr: r.stderr }).toEqual({
        code: 0,
        stdout: `${row.expected}\n`,
        stderr: ''
      });
    });
  }
});

describe('CS-1 the negative: a value that is neither 1 nor 0 is refused, named', () => {
  for (const row of ROWS.filter((r) => r.expected === 'refused')) {
    test(`CS-1 ${row.name} is refused with key and value`, () => {
      const r = state(row);
      const value = refusedValue(row);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toContain(
        `Error: ENABLE_LIQUID=${value} in .env is not a switch value; use 1 (on) or 0 (off).`
      );
      expect(r.stderr).toMatch(
        new RegExp(`^::aiw-error::ENABLE_LIQUID must be 1 or 0, not '${value}'\\.`, 'm')
      );
    });
  }
});

describe('CS-1 the check names every refused key', () => {
  test('CS-1 two refused keys give two refusals and exit 1', () => {
    const r = run('lu_components_check', 'ENABLE_LIQUID=yes\nENABLE_OPENCLAW=1\nENABLE_OPENCODE=off\n');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Error: ENABLE_LIQUID=yes in .env');
    expect(r.stderr).toContain('Error: ENABLE_OPENCODE=off in .env');
    expect(r.stderr).not.toContain('ENABLE_OPENCLAW');
  });

  test('CS-1 the counterpart: a valid file passes, silently', () => {
    const r = run('lu_components_check', 'ENABLE_LIQUID=0\nENABLE_OPENCLAW=1\n');
    expect({ code: r.code, output: r.output }).toEqual({ code: 0, output: '' });
  });
});

describe('CS-1 lu_component_profiles lists exactly what is on', () => {
  const cases: [string, string][] = [
    ['', 'liquid,openclaw,opencode'],
    ['ENABLE_LIQUID=0\n', 'openclaw,opencode'],
    ['ENABLE_OPENCLAW=0\n', 'liquid,opencode'],
    ['ENABLE_OPENCODE=0\n', 'liquid,openclaw'],
    ['ENABLE_LIQUID=0\nENABLE_OPENCLAW=0\nENABLE_OPENCODE=0\n', '']
  ];
  for (const [env, profiles] of cases) {
    test(`CS-1 ${JSON.stringify(env.trim() || 'no key')} gives ${JSON.stringify(profiles)}`, () => {
      const r = run('lu_component_profiles', env);
      expect({ code: r.code, stdout: r.stdout }).toEqual({ code: 0, stdout: profiles });
    });
  }
});
