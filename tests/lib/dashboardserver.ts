import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './paths';
import type { Result } from './shell';

export const dashboardDir = join(repoRoot, 'dashboard');

function docker(args: string[], timeout = 600_000): Result {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout });
  const stdout = p.stdout ?? '';
  // A spawn that failed, or ran out of its timeout, has no status and often no
  // output; the error is the only account of why, so it is kept.
  const stderr = (p.stderr ?? '') + (p.error ? `${p.error.message}\n` : '');
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

/**
 * The published port, read out of `docker port`'s answer.
 *
 * A pure function of the text, so both answers can be measured without docker.
 * The first line has to be what docker prints for a mapping -- an IPv4 address, a
 * bracketed IPv6 one (an IPv4-mapped one included), or the bare `::` older daemons
 * print, then a colon and a port from 1 to 65535 -- and anything else
 * is null rather than whatever `Number()` makes of the last colon's tail, which
 * read `127.0.0.1:1.5` as 1.5 and `nonsense:1` as 1.
 */
export function parsePublishedPort(stdout: string): number | null {
  const m = stdout.trim().split('\n')[0].match(/^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:.]*\]|::):(\d{1,5})$/);
  const port = m ? Number(m[1]) : 0;
  return port >= 1 && port <= 65535 ? port : null;
}

export type PortProbe = (id: string) => Result;

/**
 * Waited for, against a clock, and asked of the container's id.
 *
 * `startDashboard` asked `docker port` once, and on 2026-10-17, while a second
 * suite was running, the answer was empty. What makes it empty is not
 * established. Measured 2026-10-21 under the stack's load: the mapping was there
 * at the first ask in 40 runs of 40; a container created and not yet started
 * answers `no public port '3000' published`, a removed one `No such container`, and
 * neither is empty. The one empty answer measured is a `docker` call that ran out
 * of its timeout, which `docker()` returns as exit -1 with no output -- so the
 * message below says how the last attempt ended rather than guessing.
 *
 * The wait stays, because a mapping that is not visible yet costs a retry and not
 * a red. It ends when it has both asked `minAttempts` times and passed its
 * deadline: the clock, so a slow `docker` cannot turn it into forty slow calls,
 * and the count, because the other dashboards a case starts beside this one block
 * the same event loop with their own synchronous `docker` calls and can use up
 * the clock between two asks. Each ask keeps the 60 s it had, since a call that
 * runs out of its timeout is the one empty answer anyone has measured. And it
 * asks by **id**, as does everything after the start: the fixtures have fixed
 * names, and a second run's `docker rm -f` and `docker run` on the same name
 * would otherwise hand this one the other run's container -- per-run names are
 * #19's.
 */
export async function awaitPublishedPort(
  id: string,
  probe: PortProbe = (c) => docker(['port', c, '3000'], 60_000),
  deadlineMs = 15_000,
  waitMs = 50,
  minAttempts = 3
): Promise<{ last: Result; attempts: number }> {
  const until = Date.now() + deadlineMs;
  let attempts = 0;
  let last: Result;
  for (;;) {
    last = probe(id);
    attempts++;
    if (parsePublishedPort(last.stdout) !== null) return { last, attempts };
    if (attempts >= minAttempts && Date.now() >= until) return { last, attempts };
    await Bun.sleep(waitMs);
  }
}

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
  const id = started.stdout.trim();
  const { last: mapped, attempts } = await awaitPublishedPort(id);
  const port = parsePublishedPort(mapped.stdout);
  if (port === null) {
    const logs = docker(['logs', id], 60_000).output;
    docker(['rm', '-f', id], 60_000);
    const how =
      mapped.code === -1 ? 'no exit status -- it timed out, was killed, or could not be started' : `exit ${mapped.code}`;
    throw new Error(
      `no published port for ${name} after ${attempts} attempts; the last \`docker port\` ended with ${how}: ${mapped.output}\n${logs}`
    );
  }

  const dashboard: Dashboard = {
    port,
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    logs: () => docker(['logs', id], 60_000).output,
    stop: () => {
      docker(['rm', '-f', id], 60_000);
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
