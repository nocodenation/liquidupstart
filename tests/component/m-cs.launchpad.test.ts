/**
 * M-CS · Component · The launchpad says what is switched off, and links to nothing that is
 *
 * Purpose:  A tile that links to a switched-off service is a dead link with the stack's
 *           name on it: the address answers 502. Its credentials open nothing either. So
 *           the tiles and extras a component owns keep their names and say where it is
 *           switched on again, in the shape `privacy-tile.ts` already uses for the privacy
 *           proxy.
 * Given:    `load` of `dashboard/src/routes/+page.server.ts`, through `launchpadData()` of
 *           `tests/lib/dashboardfixture.ts`, over the fixture project's `.env`; a stub
 *           `docker` first on `PATH` that prints nothing and exits 0, so `stackState()`
 *           reaches no engine.
 * When:     The load runs with all three switches on, then with each one at `0`.
 * Then:     Off, each tile and extra the component owns carries the note and neither a
 *           `url` nor `creds`; every other tile is as it was. On, each carries today's link,
 *           and the Liquid tile today's credentials. `data.components` matches the switches.
 * Covers:   CS-13, CS-FR9
 * Negative: the off rows: no `url`, no `creds`, the note.
 * Counterpart: the on rows, so a load that dropped every link cannot pass; and with one
 *           component off, the other components' tiles keep their links.
 *
 * Test data: owners -- *Liquid.MX* and *Liquid ingresses* (Liquid); *OpenClaw*, *OpenClaw
 * node bridge* and *OpenClaw MS Teams endpoint* (OpenClaw); *OpenCode* (OpenCode). The
 * note: `switched off — enable it under Which apps to run in Configuration`. The `.env` is
 * `envFrom()` -- flags at `1`, ports 8888 and 8833 -- with `LIQUID_USERNAME=liquid` and
 * `LIQUID_PASSWORD=liquidpassword`, the values `.env.example` sets. With all on,
 * *Liquid.MX* has `url` `https://liquid.localhost:8833` and those two credentials.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { borrowSharedProject, launchpadData, projectDir } from '../lib/dashboardfixture';
import { envFrom, fixtureValue, resetProject, writeEnv } from '../lib/gitproject';

// The shared project and ENV_DIR go back as they were found, for the files after this one.
borrowSharedProject();

const NOTE = 'switched off — enable it under Which apps to run in Configuration';
const OWNED: Record<string, string[]> = {
  ENABLE_LIQUID: ['Liquid.MX', 'Liquid ingresses'],
  ENABLE_OPENCLAW: ['OpenClaw', 'OpenClaw node bridge', 'OpenClaw MS Teams endpoint'],
  ENABLE_OPENCODE: ['OpenCode']
};
const COMPONENT: Record<string, string> = { ENABLE_LIQUID: 'liquid', ENABLE_OPENCLAW: 'openclaw', ENABLE_OPENCODE: 'opencode' };

const bin = mkdtempSync(join(tmpdir(), 'lu-cs13-'));
writeFileSync(join(bin, 'docker'), '#!/bin/sh\nexit 0\n');
chmodSync(join(bin, 'docker'), 0o755);
afterAll(() => rmSync(bin, { recursive: true, force: true }));

async function launchpad(off: string | null) {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  const value = (key: string) =>
    key === off ? '0' : key === 'LIQUID_USERNAME' ? 'liquid' : key === 'LIQUID_PASSWORD' ? 'liquidpassword' : fixtureValue(key);
  writeEnv(projectDir, envFrom(value));
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const data = await launchpadData();
    const entries = [...data.groups.flatMap((g: any) => g.tiles), ...data.extras];
    return { data, entry: (name: string) => entries.find((e: any) => e.name === name) };
  } finally {
    process.env.PATH = path;
  }
}

describe('CS-13 the launchpad says what is switched off', () => {
  test('CS-13 the counterpart: with all on, each owned tile and extra links as today', async () => {
    const { data, entry } = await launchpad(null);
    expect(data.components).toEqual({ liquid: true, openclaw: true, opencode: true });
    const liquid = entry('Liquid.MX');
    expect(liquid.url).toBe('https://liquid.localhost:8833');
    expect(liquid.creds).toEqual([
      { label: 'username', value: 'liquid' },
      { label: 'password', value: 'liquidpassword' }
    ]);
    expect(entry('Liquid ingresses').note).toBe('ports 8900-8999, served on https://PORT.liquid.localhost:8833');
    expect(entry('OpenClaw').url).toBe('http://openclaw.localhost:8888');
    expect(entry('OpenClaw node bridge').url).toBe('http://bridge.openclaw.localhost:8888');
    expect(entry('OpenClaw MS Teams endpoint').url).toBe('http://msteams.openclaw.localhost:8888');
    expect(entry('OpenCode').url).toBe('http://opencode.localhost:8888');
  });

  for (const [key, names] of Object.entries(OWNED)) {
    test(`CS-13 the negative: ${key}=0 leaves its tiles the note and no link or credentials`, async () => {
      const { data, entry } = await launchpad(key);
      expect(data.components[COMPONENT[key]]).toBe(false);
      for (const name of names) {
        const e = entry(name);
        expect(e, name).toBeDefined();
        expect(e.note, name).toBe(NOTE);
        expect(e, name).not.toHaveProperty('url');
        expect(e, name).not.toHaveProperty('creds');
      }
      // The others keep their links.
      for (const [other, otherNames] of Object.entries(OWNED)) {
        if (other === key) continue;
        for (const name of otherNames) expect(entry(name).note, name).not.toBe(NOTE);
      }
      expect(entry('pgAdmin').url).toBe('http://pgadmin.localhost:8888');
    });
  }
});
