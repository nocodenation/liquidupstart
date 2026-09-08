import { repoRoot, runnerPath } from './paths';

export type Result = { code: number; stdout: string; stderr: string; output: string };

// Bun loads the repository's own .env into process.env, and this helper used to
// forward all of it. git.sh prefers $GIT_REPOSITORIES over the file in the
// project it is given, so every fixture-based test was silently running against
// the developer's live declaration instead of its own. Invisible while that
// declaration happened to be valid; on 2026-09-08 a malformed one turned five
// unrelated cases red. A test is handed a project directory: what is in it is
// the input, and what is in the operator's .env is not.
export function sh(argv: string[], cwd: string = repoRoot): Result {
  const env: Record<string, string | undefined> = {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    LANGUAGE: 'C'
  };
  delete env.GIT_REPOSITORIES;
  const p = Bun.spawnSync(argv, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function runner(args: string[], cwd: string = repoRoot): Result {
  return sh([runnerPath, ...args], cwd);
}
