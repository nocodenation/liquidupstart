/**
 * M-CS · Integration · The start runs what is on, and a refused switch stops nothing
 *
 * Purpose:  The start has to agree with compose about which services exist, and it runs
 *           `down.sh` early: every check that once came after it cost a running
 *           installation (A8-21, A10-7). Two things follow. A switch value it cannot read
 *           must stop it before `down.sh`, and so must an image of a component that is on and
 *           was never built: compose would try to pull it, with the stack already down, which
 *           is how switching Liquid on and pressing Restart left nothing running (the local
 *           review of 2026-10-29). And the profiles must be exported before
 *           `openclaw.sh`, which runs `docker compose run` and `rm` against
 *           `openclaw-gateway`, while `run` does not enable a dependency's profile (CS-0).
 *           What the start prints is what the operator reads, so it names nothing that is
 *           switched off: that URL would answer 502.
 * Given:    `scripts/linux/start.sh` run whole by `tests/lib/startfixture.ts`: the real
 *           script, libraries and nginx template; stubs for `down.sh`, every start step
 *           and `docker`. `.env` is `.env.example` with the changes below.
 * When:     The start runs once per `.env`.
 * Then:     A refused value exits 1 naming it, with no `down` and no `compose up`, and so
 *           does a missing image of a component that is on; a missing image of one that is off
 *           stops nothing. A valid start runs `down` and `compose up -d`. With no switch key, today's steps run and
 *           compose gets all three profiles, which the `openclaw` step already sees. Each
 *           switch at `0` takes its profile and its steps away -- the Copilot check with
 *           OpenClaw's -- except `opencode.sh`, which creates the always-on services' log
 *           directories and runs regardless. No printed line names a component that is
 *           off. A COMPOSE_PROFILES the caller exported does not bring a switched-off component
 *           back. With the privacy proxy on and OpenClaw off, the start still creates the Claude
 *           login directory the proxy mounts, with mode 700, which `openclaw.sh` used to do.
 *           And a gateway that is on but unhealthy fails the start after `compose up`, which
 *           `required: false` no longer does by itself (the second local review of
 *           2026-10-29, measured on compose 5.6.1); with OpenClaw off it is not asked. Since
 *           the review on #56 the pre-flight reads the privacy proxy's switch by the switches'
 *           rule (CS-FR16), so `=0` followed by `=1` requires its image, as the dashboard asks.
 * Covers:   CS-4, CS-5, CS-FR4, CS-FR16, CS-NFR1, CS-NFR2
 * Negative: `ENABLE_LIQUID=yes` stops before `down`; each switched-off row lacks its
 *           profile, its steps and every line naming it; with OpenClaw off and Copilot on,
 *           no `exec openclaw-gateway` is run.
 * Counterpart: `ENABLE_LIQUID=1` runs `down` and `compose up`; the row without switch keys
 *           runs every step `main` runs and prints every line `main` prints, the Copilot
 *           check included; OpenCode off still runs `opencode.sh`.
 *
 * Test data: every `.env` is `.env.example` with `SYSTEM_SIGNIN_WAIT_SECONDS=0`, then:
 * (missing) `ENABLE_LIQUID=1` and `PRIVACY_PROXY_ENABLE=1` while `docker image inspect` reports
 * `liquidupstart/liquid:latest` and `liquidupstart/privacy-proxy:latest` absent; (missing, off)
 * `ENABLE_LIQUID=0` with the Liquid image absent; (doubled) `PRIVACY_PROXY_ENABLE=0` with the
 * line `PRIVACY_PROXY_ENABLE=1` appended, while the privacy proxy's image is absent; (inherited) `ENABLE_LIQUID=0` while the
 * caller's shell exports `COMPOSE_PROFILES=liquid`; (unhealthy) `ENABLE_OPENCLAW=1`, and
 * `ENABLE_OPENCLAW=0`, while `docker inspect openclaw-gateway` answers `running unhealthy`;
 * (all) the three switch lines removed and `ENABLE_GITHUB_COPILOT=1`; (liquid)
 * `ENABLE_LIQUID=0`; (openclaw) `ENABLE_OPENCLAW=0` with `ENABLE_GITHUB_COPILOT=1` and
 * `SYSTEM_BIND_ADDRESS=0.0.0.0`, so the warning that names the OpenClaw gateway is reached;
 * (opencode) `ENABLE_OPENCODE=0`; (none) all three `0` with `PRIVACY_PROXY_ENABLE=1`;
 * (refused) `ENABLE_LIQUID=yes`; (accepted) `ENABLE_LIQUID=1`. Today's steps, from
 * `start.sh` at `da4e2d1`: `git(--check-declaration) generate_api_key pgadmin opencode git
 * nextcloud nginx liquid nar-builder openclaw`. The lines `main` prints for the three
 * components: `Liquid`, `Liquid username:`, `Liquid password:`, `Liquid ingresses`,
 * `OpenClaw`, `OpenClaw node bridge`, `OpenClaw MS Teams endpoint`, `OpenCode`.
 */
import { test, expect, describe } from 'bun:test';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { composeUp, exampleEnv, runStart, type StartOptions, type StartRun } from '../lib/startfixture';

const TODAY = [
  'git(--check-declaration)',
  'generate_api_key',
  'pgadmin',
  'opencode',
  'git',
  'nextcloud',
  'nginx',
  'liquid',
  'nar-builder',
  'openclaw'
];

function start(changes: Record<string, string | null>, options: StartOptions = {}): StartRun & { claudeDirMode: number | null } {
  const run = runStart(exampleEnv({ SYSTEM_SIGNIN_WAIT_SECONDS: '0', ...changes }), options);
  const claudeDir = join(run.root, 'volumes', '_openclaw-claude');
  const claudeDirMode = existsSync(claudeDir) ? statSync(claudeDir).mode & 0o777 : null;
  rmSync(run.root, { recursive: true, force: true });
  return { ...run, claudeDirMode };
}

const names = (run: StartRun) => run.steps.map((s) => s.split(' ')[0]).filter((s) => s !== 'down');
const profilesAt = (run: StartRun, step: string) =>
  run.steps.find((s) => s.split(' ')[0] === step)?.split(' ')[1];
const printed = (run: StartRun, word: string) => run.stdout.split('\n').filter((l) => l.includes(word));

describe('CS-4 a refused value costs the start nothing', () => {
  test('CS-4 the negative: ENABLE_LIQUID=yes exits 1 before down.sh, with no compose up', () => {
    const run = start({ ENABLE_LIQUID: 'yes' });
    expect(run.code).toBe(1);
    expect(run.steps).not.toContain('down ');
    expect(run.steps).toEqual([]);
    expect(composeUp(run)).toBeUndefined();
    expect(run.stderr).toContain('Error: ENABLE_LIQUID=yes in .env is not a switch value');
    expect(run.stderr).toContain('Nothing has been stopped; the stack is as it was.');
  });

  test('CS-4 the negative: a missing image of what is on stops the start before down.sh, named', () => {
    const run = start(
      { ENABLE_LIQUID: '1', PRIVACY_PROXY_ENABLE: '1' },
      { missing: ['liquidupstart/liquid:latest', 'liquidupstart/privacy-proxy:latest'] }
    );
    expect(run.code).toBe(1);
    expect(run.steps).toEqual(['git(--check-declaration) ']);
    expect(composeUp(run)).toBeUndefined();
    expect(run.stderr).toContain('Error: these images are not built: liquidupstart/liquid:latest liquidupstart/privacy-proxy:latest');
    expect(run.stderr).toContain('Nothing has been stopped; the stack is as it was.');
    expect(run.stderr).toMatch(/^::aiw-error::Not built yet: /m);
  });

  test('CS-4 the negative: PRIVACY_PROXY_ENABLE=0 followed by =1 requires the proxy\'s image too', () => {
    const run = runStart(
      `${exampleEnv({ SYSTEM_SIGNIN_WAIT_SECONDS: '0', PRIVACY_PROXY_ENABLE: '0' })}\nPRIVACY_PROXY_ENABLE=1\n`,
      { missing: ['liquidupstart/privacy-proxy:latest'] }
    );
    expect(run.code).toBe(1);
    expect(run.steps).toEqual(['git(--check-declaration) ']);
    expect(composeUp(run)).toBeUndefined();
    expect(run.stderr).toContain('Error: these images are not built: liquidupstart/privacy-proxy:latest');
  });

  test('CS-4 the counterpart: a missing image of a component that is off stops nothing', () => {
    const run = start({ ENABLE_LIQUID: '0' }, { missing: ['liquidupstart/liquid:latest'] });
    expect(run.code).toBe(0);
    expect(run.steps).toContain('down ');
    expect(composeUp(run)?.profiles).toBe('openclaw,opencode');
  });

  test('CS-4 the counterpart: ENABLE_LIQUID=1 runs down.sh and compose up', () => {
    const run = start({ ENABLE_LIQUID: '1' });
    expect(run.code).toBe(0);
    expect(run.steps).toContain('down ');
    expect(composeUp(run)).toBeDefined();
  });
});

describe('CS-5 the start activates what is on, and only that', () => {
  const all = start({ ENABLE_LIQUID: null, ENABLE_OPENCLAW: null, ENABLE_OPENCODE: null, ENABLE_GITHUB_COPILOT: '1' });
  const liquidOff = start({ ENABLE_LIQUID: '0' });
  const openclawOff = start({ ENABLE_OPENCLAW: '0', ENABLE_GITHUB_COPILOT: '1', SYSTEM_BIND_ADDRESS: '0.0.0.0' });
  const opencodeOff = start({ ENABLE_OPENCODE: '0' });
  const none = start({ ENABLE_LIQUID: '0', ENABLE_OPENCLAW: '0', ENABLE_OPENCODE: '0', PRIVACY_PROXY_ENABLE: '1' });

  test('CS-5 with no switch key: today\'s steps and all three profiles', () => {
    expect(all.code).toBe(0);
    expect(names(all)).toEqual(TODAY);
    expect(composeUp(all)?.profiles).toBe('liquid,openclaw,opencode');
  });

  test('CS-5 and the profiles are exported before openclaw.sh runs', () => {
    expect(profilesAt(all, 'openclaw')).toBe(composeUp(all)?.profiles);
  });

  test('CS-5 and the counterpart: every line main prints, and the Copilot check', () => {
    for (const label of ['Liquid ', 'Liquid username:', 'Liquid password:', 'Liquid ingresses', 'OpenClaw ', 'OpenClaw node bridge', 'OpenClaw MS Teams endpoint', 'OpenCode ']) {
      expect(printed(all, label).length, label).toBeGreaterThan(0);
    }
    expect(all.docker.some((l) => l.startsWith('exec openclaw-gateway'))).toBe(true);
  });

  test('CS-5 the negative: Liquid off leaves out its profile, its steps and its lines', () => {
    expect(composeUp(liquidOff)?.profiles).toBe('openclaw,opencode');
    expect(names(liquidOff)).toEqual(TODAY.filter((s) => s !== 'liquid' && s !== 'nar-builder'));
    expect(printed(liquidOff, 'Liquid')).toEqual([]);
  });

  test('CS-5 the negative: OpenClaw off leaves out its profile, its step, the Copilot check and its lines', () => {
    expect(composeUp(openclawOff)?.profiles).toBe('liquid,opencode');
    expect(names(openclawOff)).toEqual(TODAY.filter((s) => s !== 'openclaw'));
    expect(openclawOff.docker.some((l) => l.startsWith('exec openclaw-gateway'))).toBe(false);
    expect(printed(openclawOff, 'OpenClaw')).toEqual([]);
    expect(openclawOff.stdout).toContain('Reachable from: your network');
  });

  test('CS-5 the negative: OpenCode off leaves out its profile and its lines', () => {
    expect(composeUp(opencodeOff)?.profiles).toBe('liquid,openclaw');
    expect(printed(opencodeOff, 'OpenCode')).toEqual([]);
  });

  test('CS-5 the counterpart: OpenCode off still runs opencode.sh', () => {
    expect(names(opencodeOff)).toEqual(TODAY);
  });

  test('CS-5 the negative: a gateway that is on but unhealthy fails the start after compose up', () => {
    const run = start({ ENABLE_OPENCLAW: '1' }, { unhealthy: ['openclaw-gateway'] });
    expect(run.code).toBe(1);
    expect(composeUp(run)).toBeDefined();
    expect(run.stderr).toContain('Error: did not come up as it should: openclaw-gateway');
    expect(run.stderr).toMatch(/^::aiw-error::Starting the stack failed: openclaw-gateway did not come up/m);
  });

  test('CS-5 the counterpart: with OpenClaw off, the gateway is not asked about', () => {
    const run = start({ ENABLE_OPENCLAW: '0' }, { unhealthy: ['openclaw-gateway'] });
    expect(run.code).toBe(0);
    expect(run.docker.some((l) => l.startsWith('inspect') && l.includes('openclaw-gateway'))).toBe(false);
  });

  test('CS-5 the negative: a profile the caller exported does not bring Liquid back', () => {
    const inherited = start({ ENABLE_LIQUID: '0' }, { inherited: 'liquid' });
    expect(composeUp(inherited)?.profiles).toBe('openclaw,opencode');
    expect(profilesAt(inherited, 'nginx')).toBe('openclaw,opencode');
  });

  test('CS-5 and with the privacy proxy on and OpenClaw off, the Claude login directory is made, mode 700', () => {
    expect(none.claudeDirMode).toBe(0o700);
    expect(all.claudeDirMode).toBeNull();
  });

  test('CS-5 the negative: all three off leave only the privacy profile, when that is on', () => {
    expect(none.code).toBe(0);
    expect(composeUp(none)?.profiles).toBe('privacy-proxy');
    expect(names(none)).toEqual(TODAY.filter((s) => !['liquid', 'nar-builder', 'openclaw'].includes(s)));
    for (const word of ['Liquid', 'OpenClaw', 'OpenCode']) expect(printed(none, word), word).toEqual([]);
  });
});
