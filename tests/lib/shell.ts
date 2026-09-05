import { repoRoot, runnerPath } from './paths';

export type Result = { code: number; stdout: string; stderr: string; output: string };

export function sh(
  argv: string[],
  cwd: string = repoRoot,
  extraEnv: Record<string, string> = {}
): Result {
  const env = { ...process.env, LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C', ...extraEnv };
  const p = Bun.spawnSync(argv, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function runner(args: string[], cwd: string = repoRoot): Result {
  return sh([runnerPath, ...args], cwd);
}
