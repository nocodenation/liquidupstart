/**
 * M-CS · Component · stackState() asks docker only for the images of what is on
 *
 * Purpose:  CS-12 holds `builtImages()` to the switches; this holds the one caller that
 *           decides `needBuild` to reading them from the installation's `.env`. Asking for a
 *           switched-off component's image makes the dashboard demand a build the operator
 *           does not need, for as long as the component stays off.
 * Given:    the project `tests/lib/dashboardfixture.ts` owns, its `.env` written from
 *           `.env.example` with every flag at `1` except `ENABLE_LIQUID=0`; a stub `docker`
 *           first on `PATH` that appends its arguments to `docker.log` and exits 0.
 * When:     `stackState()` runs, then again with `ENABLE_LIQUID=1`, and with Liquid on and
 *           `PRIVACY_PROXY_ENABLE` at `1` and at `0`; and, added on 2026-10-30 for the review
 *           on #56, at `'1'`, through `stackState()` and the launchpad's `load`.
 * Then:     With Liquid off, the `image inspect` call names `opencode`, `bun-runner` and
 *           `openclaw` and neither `liquid` nor `nar-builder`, and `needBuild` is false
 *           since the stub finds every image it is asked for. With Liquid on, it names all
 *           five. With the privacy proxy on it names `liquidupstart/privacy-proxy:latest`,
 *           which the start requires, and with it off it does not. With `'1'` it names it too,
 *           and the *Privacy proxy* tile links: the key is read by the switches' rule, as the
 *           build and the start read it (CS-FR16). Before the review the dashboard read `'1'`
 *           as off while the start required the image, so the page offered a Start the start
 *           refused.
 * Covers:   CS-12, CS-FR8, CS-FR16
 * Negative: with Liquid off, `liquidupstart/liquid:latest` and
 *           `liquidupstart/nar-builder:latest` are not asked for.
 * Counterpart: with Liquid on they are, so a `stackState()` that never asked for them cannot
 *           pass.
 *
 * Test data: the `.env` is `envFrom()` of `tests/lib/gitproject.ts` -- every key of
 * `.env.example` with its fixture value, flags at `1` -- with `ENABLE_LIQUID=0`, then `1`, and
 * `PRIVACY_PROXY_ENABLE=0`. For the privacy rows its line becomes `PRIVACY_PROXY_ENABLE=1`, then
 * stays `PRIVACY_PROXY_ENABLE=0`; for the review's row it becomes `PRIVACY_PROXY_ENABLE='1'`, and
 * the tile's link is `http://privacy.localhost:8888/policy/ui`, the fixture's HTTP port.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { borrowSharedProject, launchpadData, projectDir } from '../lib/dashboardfixture';
import { envFrom, fixtureValue, resetProject, writeEnv } from '../lib/gitproject';
import { stackState } from '../../dashboard/src/lib/server/project';

// The shared project and ENV_DIR go back as they were found, for the files after this one.
borrowSharedProject();

const bin = mkdtempSync(join(tmpdir(), 'lu-cs12-'));
const log = join(bin, 'docker.log');
writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`);
chmodSync(join(bin, 'docker'), 0o755);
afterAll(() => rmSync(bin, { recursive: true, force: true }));

// `privacy` replaces the PRIVACY_PROXY_ENABLE line where `.env.example` has it, byte for byte.
async function inspected(liquid: string, privacy = 'PRIVACY_PROXY_ENABLE=0'): Promise<{ args: string; needBuild: boolean }> {
  process.env.ENV_DIR = projectDir;
  resetProject(projectDir);
  const text = envFrom((key) => (key === 'ENABLE_LIQUID' ? liquid : key === 'PRIVACY_PROXY_ENABLE' ? '0' : fixtureValue(key)));
  writeEnv(projectDir, text.replace(/^PRIVACY_PROXY_ENABLE=0$/m, privacy));
  rmSync(log, { force: true });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const state = await stackState();
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : [];
    return { args: calls.find((l) => l.startsWith('image inspect')) ?? '', needBuild: state.needBuild };
  } finally {
    process.env.PATH = path;
  }
}

describe('CS-12 stackState() asks docker for the images of what is on', () => {
  test('CS-12 the negative: with Liquid off, neither liquid nor nar-builder is asked for', async () => {
    const { args, needBuild } = await inspected('0');
    for (const name of ['opencode', 'bun-runner', 'openclaw']) expect(args).toContain(`liquidupstart/${name}:latest`);
    expect(args).not.toContain('liquidupstart/liquid:latest');
    expect(args).not.toContain('liquidupstart/nar-builder:latest');
    expect(needBuild).toBe(false);
  });

  test('CS-12 and the privacy proxy\'s image is asked for while it is on, as the launchpad shows it', async () => {
    const on = await inspected('1', 'PRIVACY_PROXY_ENABLE=1');
    const off = await inspected('1', 'PRIVACY_PROXY_ENABLE=0');
    expect(on.args).toContain('liquidupstart/privacy-proxy:latest');
    expect(off.args).not.toContain('liquidupstart/privacy-proxy:latest');
  });

  test("CS-12 and with PRIVACY_PROXY_ENABLE='1' it is asked for, and the launchpad's privacy tile links", async () => {
    const quoted = await inspected('1', "PRIVACY_PROXY_ENABLE='1'");
    expect(quoted.args).toContain('liquidupstart/privacy-proxy:latest');
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const data = await launchpadData();
      const tile = data.groups.flatMap((g: any) => g.tiles).find((t: any) => t.name === 'Privacy proxy');
      expect(tile?.url).toBe('http://privacy.localhost:8888/policy/ui');
    } finally {
      process.env.PATH = path;
    }
  });

  test('CS-12 the counterpart: with Liquid on, all five are', async () => {
    const { args } = await inspected('1');
    for (const name of ['opencode', 'bun-runner', 'liquid', 'openclaw', 'nar-builder']) {
      expect(args).toContain(`liquidupstart/${name}:latest`);
    }
  });
});
