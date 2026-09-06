import { sh } from './shell';
import { repoRoot } from './paths';

export type ServiceHealth = {
  name: string;
  status: string;
  restarts: number;
  health: string;
};

/**
 * Read every container's state, restart count and health.
 *
 * The one-line `docker compose ps` Status string is not enough: a container in a
 * restart loop reads as `running` with health `starting` in the window between
 * two crashes, so a single sample can call a crash-looping stack sound. That
 * happened on 2026-09-06 while the gateway was on its tenth restart.
 */
export function serviceHealth(): ServiceHealth[] {
  const ids = sh(['docker', 'compose', 'ps', '-q'], repoRoot).stdout.trim();
  if (!ids) return [];
  const r = sh(
    ['docker', 'inspect', ...ids.split('\n'),
     '--format', '{{.Name}}\t{{.State.Status}}\t{{.RestartCount}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'],
    repoRoot
  );
  return r.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [name, status, restarts, health] = line.split('\t');
    return { name: name.replace(/^\//, ''), status, restarts: Number(restarts), health };
  });
}

/**
 * The services that are not sound, with the reason. Empty means the stack is up.
 *
 * Three positive conditions rather than a filter on what looks wrong: the
 * container runs, it has not restarted, and if it declares a healthcheck it has
 * actually reached `healthy`. `starting` is not accepted — a container that
 * never becomes healthy sits there forever.
 */
export function unsoundServices(expectRestarts = 0): string[] {
  return serviceHealth()
    .filter((s) => s.status !== 'running' || s.restarts > expectRestarts || (s.health !== 'healthy' && s.health !== 'no-healthcheck'))
    .map((s) => `${s.name}: status=${s.status} restarts=${s.restarts} health=${s.health}`);
}
