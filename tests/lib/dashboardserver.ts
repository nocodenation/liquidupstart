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

// Every object these helpers create carries both labels. LU_LABEL identifies the
// suite's litter whatever run made it; the RUN_ID one identifies this run's.
//
// They exist because per-run names removed a side effect the suite had been
// relying on without anyone writing it down: the next run's
// `docker rm -f lu-a8-ready` reclaimed whatever an interrupted run had left, and
// the rebuilt tag reclaimed the image. With unique names nothing ever names those
// again, so a run killed after the containers start -- Ctrl-C, a hook timeout, a
// cancelled CI job -- leaks three dashboards and a tag for good. A1 and A2 of the
// 2026-10-01 review: the fix for one defect had introduced another, and the
// reviewer caught it by killing a run and then watching a later green one leave
// the litter alone.
const LU_LABEL = 'lu-test';
const RUN_LABEL = 'lu-test-run';
const labels = () => ['--label', `${LU_LABEL}=1`, '--label', `${RUN_LABEL}=${RUN_ID}`];

/** A docker tag no other run will touch. `<repo>:<label>` in, suffixed out. */
export function throwawayTag(base: string): string {
  return `${base}-${RUN_ID}`;
}

/** The container name this run uses for a logical fixture name. */
export function containerName(name: string): string {
  return `${name}-${RUN_ID}`;
}

/** The label pair every fixture object should carry, for the sweep to find it. */
export const fixtureLabels = (): string[] => labels();

/**
 * Two adjacent /24s no other run is likely to be using.
 *
 * A suffix on the *name* is not enough for a network: two runs creating a decoy on
 * one range collide with "Pool overlaps with other one on this address space", so
 * the range has to differ too. Derived from RUN_ID rather than allocated, because
 * allocation needs a lock and the whole point is that runs do not coordinate.
 *
 * 10.128–10.227 keeps clear of the stack's own 10.99.0.0/24 and of docker's
 * default pools. Two concurrent runs can still land on one pair; at 100 x 256
 * starting points that is rare enough to be worth less than a lock, and the
 * failure is a loud `docker network create` error rather than a wrong verdict.
 * B3 of the 2026-10-01 review.
 */
export function runSubnets(): { taken: string; free: string } {
  let h = 0;
  for (const ch of RUN_ID) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  const a = 128 + (h % 100);
  const b = Math.floor(h / 100) % 255;
  return { taken: `10.${a}.${b}.0/24`, free: `10.${a}.${b + 1}.0/24` };
}

function docker(args: string[], timeout = 600_000): Result {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout });
  const stdout = p.stdout ?? '';
  const stderr = p.stderr ?? '';
  return { code: p.status ?? -1, stdout, stderr, output: stdout + stderr };
}

/**
 * How old a fixture has to be before this suite treats it as abandoned.
 *
 * **Three hours is not an estimate of a run, it is a distance from one.** The
 * longest measured full run on this host is 17 minutes, so the floor is an order
 * of magnitude above it; anything closer turns the sweep into a race it can lose
 * on a slow machine. The cost of the distance is only that litter from a run
 * killed half an hour ago survives until the next sweep after it ages, which is
 * the cheap direction to be wrong in.
 */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Which of these fixtures are stale, decided over what docker said.
 *
 * **"Not this run" is not "stale", and reading it that way reintroduced the
 * defect this file exists against.** The first sweep removed every `lu-test=1`
 * object whose RUN_ID was not its own, which is precisely a second run
 * destroying a live first one -- the headline of #19, arriving back through the
 * repair for A2. The reviewer measured it on 2026-10-20: one `sweepStaleFixtures()`
 * from a second clone, while a run's first container was up, and that run failed
 * with `lu-a8-ready-1-vyc8xo never answered on port 32780: … No such container`.
 *
 * A separate exported function because the decision is the part that was wrong,
 * and a decision that only exists inside a docker call can only be tested by
 * destroying something. Given rows and a clock it is a pure function.
 *
 * **An unreadable timestamp keeps the object.** "Cannot measure" is not "stale",
 * which is the rule `SP-4` carries for the disk and `B5-33` for the image, and
 * here it is also the only direction that cannot destroy a live run.
 */
export function staleIds(
  rows: Array<{ id: string; created: string }>,
  mine: Set<string>,
  now: number,
  after = STALE_AFTER_MS
): string[] {
  return rows
    .filter((r) => r.id && !mine.has(r.id))
    .filter((r) => {
      const at = Date.parse(r.created);
      return Number.isFinite(at) && now - at >= after;
    })
    .map((r) => r.id);
}

const lines = (out: string): string[] =>
  out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * `<id> <created>` for the ids given, from docker's own record.
 *
 * `inspect` rather than `ps --format`, because `{{.CreatedAt}}` prints
 * `2026-10-20 14:03:11 +0200 CEST`, whose parse is engine-dependent, while
 * `{{.Created}}` is RFC 3339 -- `2026-10-20T12:22:29.90022963Z`, measured on
 * docker 29.8.1 for all three object kinds. A row that inspect does not answer
 * for is simply absent, and an absent row is not swept.
 */
function createdAt(kind: 'container' | 'image' | 'network', ids: string[]): Array<{ id: string; created: string }> {
  if (ids.length === 0) return [];
  const field = kind === 'network' ? '.ID' : '.Id';
  const r = docker([kind, 'inspect', '-f', `{{${field}}} {{.Created}}`, ...ids], 120_000);
  return lines(r.stdout).map((l) => {
    const [id, created] = l.split(' ');
    return { id: id ?? '', created: created ?? '' };
  });
}

/**
 * Remove containers, networks and images this suite abandoned -- from a run that
 * is over, never from one that is going on.
 *
 * Called at the start of a run rather than at the end of one, because the run
 * that leaks is by definition the run that did not reach its own cleanup. What it
 * may *not* do is make that true of somebody else's run, which is why the age
 * floor is the whole subject of `staleIds` above.
 */
export function sweepStaleFixtures(now = Date.now()): void {
  const mine = `${RUN_LABEL}=${RUN_ID}`;
  const theirs = (listing: string[]) => lines(docker(listing, 60_000).stdout);

  const sweep = (
    kind: 'container' | 'image' | 'network',
    all: string[],
    own: string[],
    remove: (id: string) => string[]
  ) => {
    const candidates = theirs(all);
    if (candidates.length === 0) return;
    const ours = new Set(theirs(own));
    // Inspect only what is not ours: this run's own fixtures are never swept,
    // whatever their age, and a run longer than the floor would otherwise start
    // deleting its own containers out from under itself.
    const rows = createdAt(kind, candidates.filter((id) => !ours.has(id)));
    for (const id of staleIds(rows, ours, now)) docker(remove(id), 60_000);
  };

  sweep(
    'container',
    ['ps', '-aq', '--filter', `label=${LU_LABEL}=1`],
    ['ps', '-aq', '--filter', `label=${mine}`],
    (id) => ['rm', '-f', id]
  );
  sweep(
    'network',
    ['network', 'ls', '-q', '--filter', `label=${LU_LABEL}=1`],
    ['network', 'ls', '-q', '--filter', `label=${mine}`],
    (id) => ['network', 'rm', '-f', id]
  );
  sweep(
    'image',
    ['images', '-q', '--filter', `label=${LU_LABEL}=1`],
    ['images', '-q', '--filter', `label=${mine}`],
    (id) => ['rmi', '-f', id]
  );
}

export function buildDashboardImage(tag: string): Result {
  sweepStaleFixtures();
  return docker([
    'build', '-q', '-t', tag,
    '--label', `${LU_LABEL}=1`, '--label', `${RUN_LABEL}=${RUN_ID}`,
    dashboardDir
  ]);
}

export function removeImage(tag: string): void {
  docker(['rmi', '-f', tag], 60_000);
}

export function imageExists(tag: string): boolean {
  return docker(['image', 'inspect', tag], 60_000).code === 0;
}

export type Dashboard = {
  /** What docker calls it, so a caller can ask the container what it sees. */
  container: string;
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
    'run', '-d', '--name', name, ...labels(),
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
    container: name,
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
  path: string,
  seconds = 30
): Promise<{ status: number; html: string }> {
  // Bounded, because the fetch had no timeout at all: against a server that
  // accepts and never answers, the call simply waited until bun killed the hook,
  // and whatever had been collected was lost with it. B1a of the 2026-10-01
  // review.
  const res = await fetch(dashboard.url(path), {
    redirect: 'manual',
    signal: AbortSignal.timeout(seconds * 1000)
  });
  return { status: res.status, html: await res.text() };
}

/**
 * Wait until the container can see a file the host just wrote, then fetch once.
 *
 * A file written on the host is not immediately what the container reads: the
 * project is a bind mount and Docker Desktop propagates with a delay. A8-20 wrote
 * a narrowed manifest and fetched at once, and **failed 2 of 3 runs on an idle
 * machine** -- measured 2026-09-30 -- because the dashboard served the file as it
 * had been.
 *
 * **Rewritten 2026-10-02.** The first repair polled the *page* until it said what
 * the case expected, and that was worse than the flake in the way that matters: a
 * predicate about the product turns a product defect into a timeout. Reword the
 * heading and the wait expires, bun reports one `(unnamed)` failure, and none of
 * the ten tests runs -- where `main` reported a named A8-20 failure beside nine
 * passes. The truncated-manifest predicate was worse still: it waited for
 * `could not be read`, which no assertion checks, so it added an assertion the
 * specification does not have and reported it as timing. A1 of the 2026-10-01
 * review.
 *
 * So the wait is on the **diagnosis** -- the bytes the container reads -- and the
 * verdict is left to the assertions. `docker exec cat` is the only thing that can
 * answer "has it arrived yet", and it says nothing about what the page should
 * contain.
 */
export async function awaitFileInContainer(
  dashboard: Dashboard,
  containerPath: string,
  expected: string,
  seconds = 20
): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const r = docker(['exec', dashboard.container, 'cat', containerPath], 30_000);
    last = r.code === 0 ? r.stdout : r.output;
    if (r.code === 0 && r.stdout === expected) return;
    await Bun.sleep(100);
  }
  throw new Error(
    `${dashboard.container} did not see the written ${containerPath} within ${seconds}s. ` +
      `It last read:\n${last}`
  );
}

export function withoutScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}
