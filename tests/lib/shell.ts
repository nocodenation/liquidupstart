import { repoRoot, runnerPath } from './paths';

export type Result = { code: number; stdout: string; stderr: string; output: string };

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
  extraEnv: Record<string, string> = {}
): Result {
  const p = Bun.spawnSync(argv, { cwd, env: childEnv(extraEnv), stdout: 'pipe', stderr: 'pipe' });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
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
