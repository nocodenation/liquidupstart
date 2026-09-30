import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './paths';
import type { Result } from './shell';

export const dashboardDir = join(repoRoot, 'dashboard');

/**
 * What makes this run's docker objects its own.
 *
 * Container names and image tags were fixed strings, and `startDashboard` runs
 * `docker rm -f <name>` before it starts -- so a second suite run on the same
 * host destroyed the first one's fixtures. Measured 2026-09-30 with two
 * checkouts running `m-a8.served-card` at once: `could not start
 * lu-a8-unprepared: … No such container`, and before that a page served from the
 * other run's project directory, which read as A8-20 failing. A red that is about
 * the machine and not the product is the kind that teaches everyone to stop
 * believing red.
 *
 * The pid alone is not enough: pids are reused, and two runs started a second
 * apart on a busy machine are exactly when this bites.
 */
export const RUN_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** A docker tag no other run will touch. `<repo>:<label>` in, suffixed out. */
export function throwawayTag(base: string): string {
  return `${base}-${RUN_ID}`;
}

/** The container name this run uses for a logical fixture name. */
export function containerName(name: string): string {
  return `${name}-${RUN_ID}`;
}

function docker(args: string[], timeout = 600_000): Result {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout });
  const stdout = p.stdout ?? '';
  const stderr = p.stderr ?? '';
  return { code: p.status ?? -1, stdout, stderr, output: stdout + stderr };
}

export function buildDashboardImage(tag: string): Result {
  return docker(['build', '-q', '-t', tag, dashboardDir]);
}

export function removeImage(tag: string): void {
  docker(['rmi', '-f', tag], 60_000);
}

export function imageExists(tag: string): boolean {
  return docker(['image', 'inspect', tag], 60_000).code === 0;
}

export type Dashboard = {
  port: number;
  url: (path: string) => string;
  logs: () => string;
  stop: () => void;
};

export async function startDashboard(
  project: string,
  logicalName: string,
  tag: string
): Promise<Dashboard> {
  // The caller names the fixture; this decides what docker calls it, so no
  // caller can forget the suffix.
  const name = containerName(logicalName);
  docker(['rm', '-f', name], 60_000);
  const started = docker([
    'run', '-d', '--name', name,
    '-p', '127.0.0.1:0:3000',
    '-e', `ENV_DIR=${project}`,
    '-v', `${project}:${project}`,
    tag
  ], 120_000);
  if (started.code !== 0) throw new Error(`could not start ${name}: ${started.output}`);

  // Throwing here without removing what `docker run` just created leaves it
  // running, and the caller never got a handle to clean up: on 2026-09-07 one
  // throw inside a Promise.all left three containers and an image behind, and
  // the next run started from that state.
  const mapped = docker(['port', name, '3000'], 60_000);
  const port = Number(mapped.stdout.trim().split('\n')[0]?.split(':').pop());
  if (!Number.isFinite(port) || port === 0) {
    const logs = docker(['logs', name], 60_000).output;
    docker(['rm', '-f', name], 60_000);
    throw new Error(`no published port for ${name}: ${mapped.output}\n${logs}`);
  }

  const dashboard: Dashboard = {
    port,
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    logs: () => docker(['logs', name], 60_000).output,
    stop: () => {
      docker(['rm', '-f', name], 60_000);
    }
  };

  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const res = await fetch(dashboard.url('/'), { redirect: 'manual' });
      if (res.status > 0) return dashboard;
    } catch {
      await Bun.sleep(200);
    }
  }
  const logs = dashboard.logs();
  dashboard.stop();
  throw new Error(`${name} never answered on port ${port}:\n${logs}`);
}

export async function get(
  dashboard: Dashboard,
  path: string
): Promise<{ status: number; html: string }> {
  const res = await fetch(dashboard.url(path), { redirect: 'manual' });
  return { status: res.status, html: await res.text() };
}

/**
 * Fetch until the page reflects a change just written to the project directory.
 *
 * A file written on the host is not immediately what the container reads: the
 * project is a bind mount, and Docker Desktop propagates with a delay. A8-20
 * wrote a narrowed manifest and fetched at once, and **failed 2 of 3 runs on an
 * idle machine** -- measured 2026-09-30 -- because the dashboard served the file
 * as it had been. With 1.5s in between it passed 3 of 3, which is what identified
 * the cause and is also why a fixed wait is not the fix: it is a guess that goes
 * flaky again on a slower host, and a flaky suite trains everyone to ignore red.
 *
 * So the wait is on the condition, not on the clock, and it fails loudly with
 * what it last saw rather than letting the assertion report the stale page.
 */
export async function getWhen(
  dashboard: Dashboard,
  path: string,
  reflects: (html: string) => boolean,
  what: string,
  seconds = 20
): Promise<{ status: number; html: string }> {
  const deadline = Date.now() + seconds * 1000;
  let last = { status: 0, html: '' };
  while (Date.now() < deadline) {
    last = await get(dashboard, path);
    if (reflects(last.html)) return last;
    await Bun.sleep(100);
  }
  throw new Error(
    `${dashboard.url(path)} never reflected ${what} within ${seconds}s. ` +
      `Last status ${last.status}; the page is below.\n${last.html}`
  );
}

export function withoutScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}
