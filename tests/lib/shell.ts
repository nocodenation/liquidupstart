import { repoRoot, runnerPath } from './paths';

export type Result = { code: number; stdout: string; stderr: string; output: string };

/**
 * Was this child cut off rather than finished?
 *
 * Four signs, each measured, and read in this order:
 *
 * - **Its own timeout fired** (`timedOut`, from `sh(..., timeoutMs)`). The one a
 *   case can rely on. Under bun 1.4.3 the per-test budget kills a `spawnSync`
 *   child with SIGTERM, and `docker build` then exits **255** and prints nothing
 *   about it -- measured 2026-10-21 with docker 29.8.1 -- so none of the signs
 *   below sees it. A case gives its build a timeout under its budget and reads
 *   that instead. With that timeout the build exits 255 whichever signal ends it:
 *   SIGINT and SIGTERM measured the same.
 * - **A signal ended it** (`signal`): the OOM killer, or anyone's `kill`. Its exit
 *   code is then no exit code at all, which `sh()` reports as -1.
 * - **130**: SIGINT, an operator's Ctrl-C. What the budget produced under bun
 *   1.3.13 on 2026-10-09, when `OC-15` read *"expected 0, received 130"*.
 * - **`context canceled`**, which docker prints on SIGINT --
 *   `ERROR: failed to build: failed to solve: Canceled: context canceled`,
 *   measured 2026-10-21. Read only for a non-zero exit, so a build that passed is
 *   never called interrupted for a word in its log.
 *
 * It exists because a cut-off run says nothing about the code under test, and two
 * cases read it as if it did: `OC-15` expects exit 0, so an interrupted build read
 * as a verdict on `--allow-scripts`, and `OC-16` expects a non-zero exit, so an
 * interrupted build satisfied its first assertion **by accident**.
 */
export function wasInterrupted(
  r: Pick<Result, 'code' | 'output'> & { timedOut?: boolean; signal?: string | null }
): boolean {
  return (
    r.timedOut === true ||
    (r.signal ?? null) !== null ||
    r.code === 130 ||
    (r.code !== 0 && /context canceled/i.test(r.output))
  );
}

// Bun loads the repository's own .env into process.env, and this helper used to
// forward all of it. git.sh prefers $GIT_REPOSITORIES over the file in the
// project it is given, so every fixture-based test was silently running against
// the developer's live declaration instead of its own. Invisible while that
// declaration happened to be valid; on 2026-09-08 a malformed one turned five
// unrelated cases red. A test is handed a project directory: what is in it is
// the input, and what is in the operator's .env is not. extraEnv is applied
// afterwards, so a case that means to set it still can.
function childEnv(extraEnv: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    LANGUAGE: 'C'
  };
  delete env.GIT_REPOSITORIES;
  Object.assign(env, extraEnv);
  return env;
}

export function sh(
  argv: string[],
  cwd: string = repoRoot,
  extraEnv: Record<string, string> = {},
  timeoutMs?: number
): Result & { timedOut: boolean; signal: string | null } {
  const p = Bun.spawnSync(argv, {
    cwd,
    env: childEnv(extraEnv),
    stdout: 'pipe',
    stderr: 'pipe',
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs })
  });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return {
    code: p.exitCode ?? -1,
    stdout,
    stderr,
    output: stdout + stderr,
    timedOut: p.exitedDueToTimeout === true,
    signal: p.signalCode ?? null
  };
}

// The concurrent counterpart of sh(). It waits for the child's exit status as
// well as reading both its streams: on 2026-09-08 a helper in this repository
// read stdout alone, bash refused the script it ran, and empty came back --
// which is indistinguishable from a command that had nothing to say. `startedAt`
// and `endedAt` are taken around the child so a case can establish that two
// invocations overlapped instead of assuming they did.
export type Timed = Result & { startedAt: number; endedAt: number };

export function shAsync(
  argv: string[],
  cwd: string = repoRoot,
  extraEnv: Record<string, string> = {}
): Promise<Timed> {
  const startedAt = Date.now();
  const p = Bun.spawn(argv, {
    cwd,
    env: childEnv(extraEnv) as Record<string, string>,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  return (async () => {
    const [stdout, stderr, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited
    ]);
    return { code, stdout, stderr, output: stdout + stderr, startedAt, endedAt: Date.now() };
  })();
}

export function runner(args: string[], cwd: string = repoRoot): Result {
  return sh([runnerPath, ...args], cwd);
}
