import { repoRoot } from './paths';
import { sh } from './shell';

export const AGENT_CONTAINERS = ['openclaw-gateway', 'opencode'];

export function containerRunning(name: string): boolean {
  const r = sh(['docker', 'ps', '--filter', `name=^${name}$`, '--format', '{{.Names}}']);
  return r.code === 0 && r.stdout.trim().split('\n').includes(name);
}

export function requireStack(names: string[] = AGENT_CONTAINERS): void {
  const missing = names.filter((n) => !containerRunning(n));
  if (missing.length > 0) {
    throw new Error(
      `stack not running: container(s) ${missing.join(', ')} are not up. ` +
        `Start the stack with ./scripts/linux/start.sh before running system tests.`
    );
  }
}

export function compose(args: string[]) {
  return sh(['docker', 'compose', ...args], repoRoot);
}

export function inContainer(service: string, script: string) {
  return compose(['exec', '-T', service, 'sh', '-lc', script]);
}

export const SKILL_PATHS: Record<string, string> = {
  'openclaw-gateway': '/home/node/.claude/skills',
  opencode: '/root/.config/opencode/skills'
};

export function requireSkillFile(service: string, path: string): string {
  const r = inContainer(service, `cat ${path}`);
  if (r.code !== 0) {
    throw new Error(
      `skill file not readable in ${service}: ${path} is missing. ` +
        `Check that ./config/agents/skills is mounted into ${service} in compose.yml.`
    );
  }
  return r.stdout;
}

export const SECRETS_DIR_HOST = 'volumes/_git-secrets';
export const SECRETS_DIR_CONTAINER = '/git-secrets';
