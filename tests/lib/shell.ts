import { repoRoot, runnerPath } from './paths';

export type Result = { code: number; stdout: string; stderr: string; output: string };

export function sh(argv: string[], cwd: string = repoRoot): Result {
  const p = Bun.spawnSync(argv, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const stdout = p.stdout ? p.stdout.toString() : '';
  const stderr = p.stderr ? p.stderr.toString() : '';
  return { code: p.exitCode ?? -1, stdout, stderr, output: stdout + stderr };
}

export function runner(args: string[], cwd: string = repoRoot): Result {
  return sh([runnerPath, ...args], cwd);
}
