// Shared server-side project facts: project-root paths, .env access, and
// docker-based stack state.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { parseEnvValues } from '../env-file';
import { componentsFrom, privacyProxyOn, type Component } from '../component-switches';

/**
 * The project directory, read at the moment it is asked for.
 *
 * `ENV_DIR` below is the same answer frozen at first load, and every path derived
 * from it is frozen with it. In the running dashboard the two are identical --
 * nothing changes the environment after start -- but under `bun test` a level is
 * one process, so the first module to import this file decides the directory for
 * every file after it, and a fixture that sets the variable later sets something
 * nothing reads again.
 *
 * Measured 2026-10-14: that had made `OC-66`, `OC-68` and `OC-70` green in
 * isolation and dead under `tests/run.sh` since 2026-10-01 -- the unit level
 * loads first and `m-oc.pairing-choice` imports `$lib/server/pairing` there, so
 * the capture happens before any fixture runs. Five signed scenarios, passing on
 * nothing.
 *
 * So the pairing path asks instead of remembering, which is the same reason the
 * suite computes its preconditions rather than prescribing a directory.
 */
export function envDir(): string {
  return process.env.ENV_DIR ?? resolve(process.cwd(), '..');
}

export const ENV_DIR = envDir();
export const ENV_FILE = join(ENV_DIR, '.env');
export const EXAMPLE_FILE = join(ENV_DIR, '.env.example');
export const RESULT_FILE = join(ENV_DIR, '.install-result');
// Written by install.sh (release tag) or install-local.sh (local-<sha>); absent
// when the project is run straight from a checkout.
export const VERSION_FILE = join(ENV_DIR, '.liquidupstart-version');
// Dropped by update.sh after pulling a new release to force a rebuild.
export const REBUILD_MARKER = join(ENV_DIR, '.needs-rebuild');
const DEV_SRC_KEYS = ['PRIVACY_PROXY_DEV_SRC'];
export const APP_PASSWORD_DIR = join(ENV_DIR, 'volumes', 'dashboard');
export const APP_PASSWORD_FILE = join(APP_PASSWORD_DIR, '.app_password');

// Images produced by build.sh for the components that are on; all of them must exist for a
// start to succeed. 'hermes' is intentionally disabled (commented out in build/start/compose).
//
// A switched-off component's image is left out, so needBuild asks for a build exactly when an
// image of something that is on is missing: never for switching off, and for switching on
// only when the image is gone (CS-FR8, decision 10). The privacy proxy's is in while
// PRIVACY_PROXY_ENABLE=1: start.sh refuses to start without it, and a dashboard that did not
// ask for it would offer Start for a start that cannot happen.
export function builtImages(on: Record<Component, boolean>, privacyProxy = false): string[] {
  // nar-builder is built locally like the other four. Leaving it out made
  // stackState() answer needBuild: false on a checkout that has never built it,
  // so `docker compose up -d` tried to *pull* a local-only image and failed --
  // and since proxy depends on nar_builder, the whole stack failed to start.
  // Blocker 2 of the 2026-09-28 review.
  const images: [string, Component | null][] = [
    ['opencode', 'opencode'],
    ['bun-runner', null],
    ['liquid', 'liquid'],
    ['openclaw', 'openclaw'],
    ['nar-builder', 'liquid']
  ];
  return images
    .filter(([, component]) => component === null || on[component])
    .map(([name]) => `liquidupstart/${name}:latest`)
    .concat(privacyProxy ? ['liquidupstart/privacy-proxy:latest'] : []);
}

// The switches as the installation's .env sets them, read from each line's text after `=`
// rather than from `value`, so the dashboard applies the rule the start applies (CS-2).
export function installedComponents(
  values: Map<string, { value: string; raw?: string }> = envValues()
): Record<Component, boolean> {
  return componentsFrom(values);
}

// The same, from the .env of the directory asked for now rather than the one frozen in
// ENV_FILE, for the reason envDir() gives.
export function componentsAt(dir: string = envDir()): Record<Component, boolean> {
  const file = join(dir, '.env');
  return installedComponents(existsSync(file) ? parseEnvValues(readFileSync(file, 'utf8')) : new Map());
}

export function projectVersion(): string | null {
  try {
    const raw = readFileSync(VERSION_FILE, 'utf8').trim();
    return raw === '' ? null : raw.split('\n')[0];
  } catch {
    return null;
  }
}

export function readEnvFile() {
  const exampleText = readFileSync(EXAMPLE_FILE, 'utf8');
  const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  return { exampleText, envText };
}

export function envValues(): Map<string, { value: string }> {
  return existsSync(ENV_FILE) ? parseEnvValues(readFileSync(ENV_FILE, 'utf8')) : new Map();
}

export function devSourceMounts(
  values: Map<string, { value: string }> = envValues(),
  envDir: string = ENV_DIR
): string[] {
  return DEV_SRC_KEYS.flatMap((key) => {
    const value = values.get(key)?.value.trim() ?? '';
    if (value === '') return [];
    const root = resolve(envDir);
    const path = resolve(root, value);
    const inside = path === root || path.startsWith(`${root}/`);
    return inside ? [] : ['-v', `${path}:${path}:ro`];
  });
}

export function readAppPassword(): string | null {
  try {
    const value = readFileSync(APP_PASSWORD_FILE, 'utf8').trim();
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

export function writeAppPassword(value: string): void {
  mkdirSync(APP_PASSWORD_DIR, { recursive: true });
  writeFileSync(APP_PASSWORD_FILE, `${value.trim()}\n`, 'utf8');
  chmodSync(APP_PASSWORD_FILE, 0o600);
}

// "Configured" = the form has been saved at least once. Saving fills every
// empty autogenerated secret, so an empty DATABASE_PASSWORD means .env is still
// the untouched copy of .env.example.
export function isConfigured(): boolean {
  return Boolean(envValues().get('DATABASE_PASSWORD')?.value);
}

export function dockerExitCode(args: string[], timeoutMs = 30_000): Promise<number> {
  return new Promise((res) => {
    const c = spawn('docker', args, { cwd: ENV_DIR, stdio: 'ignore' });
    const t = setTimeout(() => c.kill(), timeoutMs);
    c.on('error', () => {
      clearTimeout(t);
      res(1);
    });
    c.on('close', (code) => {
      clearTimeout(t);
      res(code ?? 1);
    });
  });
}

function dockerOutput(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((res) => {
    const c = spawn('docker', args, { cwd: ENV_DIR });
    let out = '';
    const t = setTimeout(() => c.kill(), timeoutMs);
    c.stdout.on('data', (d) => (out += d.toString()));
    c.on('error', () => {
      clearTimeout(t);
      res('');
    });
    c.on('close', () => {
      clearTimeout(t);
      res(out);
    });
  });
}

// The nginx proxy depends on every service that is on, so "proxy is running" is the
// best single signal for "the stack is up". `values` is the caller's parsed .env, when it
// has one, so the switches are not read twice.
export async function stackState(
  values: Map<string, { value: string; raw?: string }> = envValues()
): Promise<{ running: boolean; needBuild: boolean }> {
  // As the build, the start and the launchpad's privacy tile read it (CS-FR16).
  const privacyProxy = privacyProxyOn(values);
  const [proxy, images] = await Promise.all([
    dockerOutput(['ps', '-q', '--filter', 'name=^proxy$', '--filter', 'status=running']),
    dockerExitCode(['image', 'inspect', ...builtImages(installedComponents(values), privacyProxy)])
  ]);
  const imagesMissing = images !== 0;
  // update.sh drops the rebuild marker (and the built images). Once the images
  // are back the rebuild has happened, so clear it.
  let flagged = existsSync(REBUILD_MARKER);
  if (flagged && !imagesMissing) {
    try {
      rmSync(REBUILD_MARKER, { force: true });
    } catch {
      // best-effort; the marker is advisory
    }
    flagged = false;
  }
  return { running: proxy.trim() !== '', needBuild: imagesMissing || flagged };
}
