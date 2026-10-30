/**
 * `scripts/linux/start.sh`, run whole in a tree of its own, with nothing it starts real.
 *
 * The start decides which steps run and which compose profiles are active, and those
 * decisions are spread over five hundred lines of pre-flights, steps and output. Running
 * the script whole is the only way to see their order: a case over one function cannot
 * show that the profiles were exported before `openclaw.sh`, which is the order compose's
 * `run` needs (CS-0).
 *
 * What is real: `start.sh`, every library under `config/scripts/start/lib/`, and the nginx
 * template, which a pre-flight reads. What is a stub: `scripts/linux/down.sh` and every
 * script under `config/scripts/start/`, each appending its name and `COMPOSE_PROFILES` to
 * `steps.log`; and `docker`, first on `PATH`, which appends its arguments with
 * `COMPOSE_PROFILES` and `COMPOSE_FILE` to `docker.log`, prints nothing and exits 0 -- so
 * every pre-flight that asks docker passes, the port probe finds the ports free, and the
 * Copilot check finds no login -- except `image inspect` of an image named in `missing`, which
 * exits 1. `docker inspect` of a container answers `running healthy`, or `running unhealthy`
 * for one named in `unhealthy`. No engine is reached.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

const START_STEPS = readdirSync(join(repoRoot, 'config/scripts/start')).filter((f) => f.endsWith('.sh'));

export type StartRun = Result & {
  root: string;
  /** One entry per step, as `name profiles`; git's pre-flight is `git(--check-declaration)`. */
  steps: string[];
  /** One entry per docker call, as `argv<TAB>COMPOSE_PROFILES<TAB>COMPOSE_FILE`. */
  docker: string[];
};

const stepStub = (log: string) => `#!/usr/bin/env bash
n="$(basename "$0" .sh)"
for a in "$@"; do [ "$a" = --check-declaration ] && n="$n(--check-declaration)"; done
printf '%s %s\\n' "$n" "\${COMPOSE_PROFILES-}" >> ${JSON.stringify(log)}
`;

export type StartOptions = {
  /** Images `docker image inspect` reports as absent, as `liquidupstart/liquid:latest`. */
  missing?: string[];
  /** A COMPOSE_PROFILES the caller's shell already exports; empty by default. */
  inherited?: string;
  /** Containers `docker inspect` reports as running but unhealthy. */
  unhealthy?: string[];
};

export function runStart(env: string, options: StartOptions = {}): StartRun {
  const root = mkdtempSync(join(tmpdir(), 'lu-cs-start-'));
  for (const d of ['scripts/linux', 'config/scripts/start', 'config/nginx/templates', 'bin']) {
    mkdirSync(join(root, d), { recursive: true });
  }
  cpSync(join(repoRoot, 'scripts/linux/start.sh'), join(root, 'scripts/linux/start.sh'));
  cpSync(join(repoRoot, 'config/scripts/start/lib'), join(root, 'config/scripts/start/lib'), {
    recursive: true
  });
  cpSync(join(repoRoot, 'config/nginx/templates/nginx.conf'), join(root, 'config/nginx/templates/nginx.conf'));

  const steps = join(root, 'steps.log');
  const docker = join(root, 'docker.log');
  // down.sh logs as `down`, by the same basename rule.
  for (const f of [...START_STEPS.map((s) => `config/scripts/start/${s}`), 'scripts/linux/down.sh']) {
    writeFileSync(join(root, f), stepStub(steps));
    chmodSync(join(root, f), 0o755);
  }
  writeFileSync(
    join(root, 'bin', 'docker'),
    `#!/bin/sh
printf '%s\\t%s\\t%s\\n' "$*" "\${COMPOSE_PROFILES-}" "\${COMPOSE_FILE-}" >> ${JSON.stringify(docker)}
if [ "$1 $2" = "image inspect" ]; then
  for m in \${CS_MISSING_IMAGES-}; do [ "$3" = "$m" ] && exit 1; done
fi
if [ "$1" = inspect ]; then
  for a in "$@"; do last="$a"; done
  for u in \${CS_UNHEALTHY-}; do [ "$last" = "$u" ] && { printf 'running unhealthy'; exit 0; }; done
  printf 'running healthy'
fi
exit 0
`
  );
  chmodSync(join(root, 'bin', 'docker'), 0o755);
  writeFileSync(join(root, '.env'), env);

  const r = sh(['bash', join(root, 'scripts/linux/start.sh')], root, {
    PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    COMPOSE_PROFILES: options.inherited ?? '',
    COMPOSE_FILE: '',
    CS_MISSING_IMAGES: (options.missing ?? []).join(' '),
    CS_UNHEALTHY: (options.unhealthy ?? []).join(' ')
  });
  const lines = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
  return { ...r, root, steps: lines(steps), docker: lines(docker) };
}

/** `.env.example`, with these keys' lines replaced, or removed where the value is null. */
export function exampleEnv(changes: Record<string, string | null> = {}): string {
  const text = readFileSync(join(repoRoot, '.env.example'), 'utf8');
  const seen = new Set<string>();
  const out = text.split('\n').flatMap((line) => {
    const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1];
    if (!key || !(key in changes)) return [line];
    seen.add(key);
    return changes[key] === null ? [] : [`${key}=${changes[key]}`];
  });
  for (const [key, value] of Object.entries(changes)) {
    if (!seen.has(key) && value !== null) out.push(`${key}=${value}`);
  }
  return out.join('\n');
}

/** The docker call that brought the stack up, or undefined. */
export function composeUp(run: StartRun): { profiles: string; file: string } | undefined {
  const line = run.docker.find((l) => l.startsWith('compose up -d\t'));
  if (!line) return undefined;
  const [, profiles, file] = line.split('\t');
  return { profiles, file };
}
