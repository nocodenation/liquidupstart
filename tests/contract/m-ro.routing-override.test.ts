/**
 * M-RO · Contract · The routing-only override tells OpenCode the mode
 *
 * Purpose:  OpenCode's entrypoint can only act on a mode it is told. `scripts/linux/start.sh`
 *           adds `config/privacy-proxy/compose.routing-only.yml` to `COMPOSE_FILE` under `only`
 *           and under no other mode, so that file is where OpenCode learns it, under the name
 *           `openclaw.sh` already passes to its own writer.
 * Given:    the `opencode` block of the override and of `compose.yml`, read as text with
 *           `serviceBlock()` of `tests/lib/compose-file.ts`.
 * When:     Each block is searched for `PRIVACY_ROUTING` on a line compose acts on, with any
 *           trailing comment cut off.
 * Then:     The override holds `PRIVACY_ROUTING: "only"`; `compose.yml` names no
 *           `PRIVACY_ROUTING`, so nothing reaches OpenCode under `opt-in`.
 * Covers:   RO-4, RO-FR4
 * Negative: `compose.yml` carries no such line, and a comment mentioning the name would not
 *           count as one.
 *
 * Test data: the two files as committed.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { serviceBlock } from '../lib/compose-file';

const live = (block: string) => block.split(/\r?\n/).map((l) => l.replace(/\s*#.*$/, '').trim()).filter(Boolean);
const override = readFileSync(join(repoRoot, 'config/privacy-proxy/compose.routing-only.yml'), 'utf8');

describe('RO-4 the override tells OpenCode the mode', () => {
  test('RO-4 compose.routing-only.yml gives opencode PRIVACY_ROUTING: "only"', () => {
    expect(live(serviceBlock('opencode', override))).toContain('PRIVACY_ROUTING: "only"');
  });

  test('RO-4 the negative: compose.yml gives opencode no PRIVACY_ROUTING', () => {
    expect(live(serviceBlock('opencode')).filter((l) => l.includes('PRIVACY_ROUTING'))).toEqual([]);
  });
});
