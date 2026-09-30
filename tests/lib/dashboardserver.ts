import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './paths';
import type { Result } from './shell';

export const dashboardDir = join(repoRoot, 'dashboard');

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
  name: string,
  tag: string
): Promise<Dashboard> {
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

export function withoutScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}
