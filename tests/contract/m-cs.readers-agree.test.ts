/**
 * M-CS · Contract · The shell and the dashboard read the switches alike
 *
 * Purpose:  The dashboard decides what it shows from `component-switches.ts`, and the
 *           start decides what runs from `components.sh`. Where the two differ, the page
 *           and the stack disagree about the installation: a tile linking to a service
 *           the start left out, or fields hidden for a component that runs. That is the
 *           kind of disagreement A12 was about for the repositories card.
 * Given:    each row of `tests/lib/component-values.ts`, written to a file.
 * When:     `lu_component_state <file> ENABLE_LIQUID` answers for the shell, and
 *           `componentsFrom` over `parseEnvValues` of the same text for the dashboard -- the
 *           function the dashboard's loads reach through `installedComponents()`.
 * Then:     On every row the shell accepts, both give the row's answer. On every row the
 *           shell refuses, the dashboard reads on, which is the side where nothing is
 *           hidden while the start's banner reports the refusal (CS-FR2).
 * Covers:   CS-2, CS-FR2
 * Negative: `ENABLE_LIQUID='0'` reads off in both. `parseEnvValues` removes double
 *           quotes only, so a dashboard reader left to it would read on while the shell
 *           reads off -- the row is in the table for that reason. So are the six rows the
 *           local review of 2026-10-29 found the readers disagreeing on: a tab before the
 *           comment read off in the shell and on in the dashboard, and four quoted shapes were
 *           refused by the shell and read off by the dashboard, which hid Liquid's tiles.
 * Counterpart: the on rows, so two readers that both always said off cannot agree their
 *           way through; and the refused rows, where agreement is deliberately not
 *           asked for and the dashboard's answer is pinned instead.
 *
 * Test data: the table's twenty-four rows, unchanged, stated in `tests/lib/component-values.ts`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { ROWS } from '../lib/component-values';
import { parseEnvValues } from '../../dashboard/src/lib/env-file';
import { componentsFrom } from '../../dashboard/src/lib/component-switches';

const LIB = join(repoRoot, 'config/scripts/start/lib/components.sh');
const dir = mkdtempSync(join(tmpdir(), 'lu-cs2-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function shell(env: string, i: number): string {
  const file = join(dir, `env-${i}`);
  writeFileSync(file, env);
  const r = sh(['bash', '-c', '. "$1"; lu_component_state "$2" ENABLE_LIQUID', 'cs2', LIB, file]);
  return r.code === 0 ? r.stdout.trim() : 'refused';
}

function dashboard(env: string): string {
  return componentsFrom(parseEnvValues(env)).liquid ? 'on' : 'off';
}

describe('CS-2 the two readers agree on every line the shell accepts', () => {
  ROWS.forEach((row, i) => {
    if (row.expected === 'refused') return;
    test(`CS-2 ${row.name}: both read ${row.expected}`, () => {
      expect({ shell: shell(row.env, i), dashboard: dashboard(row.env) }).toEqual({
        shell: row.expected,
        dashboard: row.expected
      });
    });
  });
});

describe('CS-2 the negative: on a refused line the shell refuses and the dashboard reads on', () => {
  ROWS.forEach((row, i) => {
    if (row.expected !== 'refused') return;
    test(`CS-2 ${row.name}: refused by the shell, on in the dashboard`, () => {
      expect({ shell: shell(row.env, i), dashboard: dashboard(row.env) }).toEqual({
        shell: 'refused',
        dashboard: 'on'
      });
    });
  });
});
