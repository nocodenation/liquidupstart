/**
 * M-CS · Integration · compose resolves this repository's project in every combination
 *
 * Purpose:  A configuration compose refuses is found at `up`, after `down.sh` has emptied
 *           the stack. CS-7 reads the profiles as text; this asks compose what it makes of
 *           them. The routing-only override names `opencode`, `openclaw-gateway` and
 *           `openclaw-cli`, and has to resolve while they are profiled out.
 * Given:    this repository's `compose.yml`, with `.env` copied from `.env.example` into a
 *           `mkdtemp` directory given as `--project-directory`, so the installation's own
 *           `.env` is not read and no relative path reaches the checkout's `volumes/`.
 * When:     `config --services` with `COMPOSE_PROFILES=liquid,openclaw,opencode`, then with
 *           it empty; `config --format json` with all three; `config -q` with the
 *           routing-only override and `COMPOSE_PROFILES=privacy-proxy`.
 * Then:     All three: today's 21 services. None: rc 0 and those 21 without `liquid`,
 *           `nar_builder`, `openclaw-gateway` and `opencode`. The proxy's dependencies keep
 *           today's conditions, the three switchable ones `required: false` and the rest
 *           required. Routing-only resolves.
 * Covers:   CS-8, CS-FR5, CS-NFR1
 * Negative: with no profile the four are absent, and compose still resolves the project.
 * Counterpart: with all three the list is today's, so a project that lost a service, or
 *           one that profiled out more than the four, cannot pass.
 * Precondition: docker compose 5.6.1. `docker compose config` reads and starts nothing, but
 *           the call is a stack marker, so the runner runs this file with `--system`.
 *
 * Test data: today's services, from `docker compose config --services` on `da4e2d1` and
 * measured again on 2026-10-29: `bun_runner eurooffice liquid nar_builder nextcloud
 * nextcloud-db nextcloud-redis openclaw-gateway opencode openproject-cache openproject-cron
 * openproject-db openproject-seeder openproject-web openproject-worker pgadmin pgadmin_db
 * postgres postgrest_app proxy swagger`. The proxy's conditions on `da4e2d1`: `bun_runner`,
 * `nar_builder`, `opencode`, `openproject-web`, `pgadmin`, `postgrest_app` and `swagger`
 * `service_started`; `nextcloud` and `openclaw-gateway` `service_healthy`.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const TODAY = ['bun_runner', 'eurooffice', 'liquid', 'nar_builder', 'nextcloud', 'nextcloud-db', 'nextcloud-redis', 'openclaw-gateway', 'opencode', 'openproject-cache', 'openproject-cron', 'openproject-db', 'openproject-seeder', 'openproject-web', 'openproject-worker', 'pgadmin', 'pgadmin_db', 'postgres', 'postgrest_app', 'proxy', 'swagger'];
const SWITCHABLE = ['liquid', 'nar_builder', 'openclaw-gateway', 'opencode'];
const CONDITIONS: Record<string, string> = {
  bun_runner: 'service_started',
  nar_builder: 'service_started',
  nextcloud: 'service_healthy',
  'openclaw-gateway': 'service_healthy',
  opencode: 'service_started',
  'openproject-web': 'service_started',
  pgadmin: 'service_started',
  postgrest_app: 'service_started',
  swagger: 'service_started'
};

const dir = mkdtempSync(join(tmpdir(), 'lu-cs8-'));
cpSync(join(repoRoot, '.env.example'), join(dir, '.env'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = (profiles: string, files: string[], ...args: string[]) =>
  sh(
    ['docker', 'compose', ...files.flatMap((f) => ['-f', join(repoRoot, f)]), '--project-directory', dir, 'config', ...args],
    dir,
    { COMPOSE_PROFILES: profiles, COMPOSE_FILE: '' }
  );

const services = (profiles: string) => {
  const r = config(profiles, ['compose.yml'], '--services');
  return { code: r.code, list: r.stdout.trim().split('\n').filter(Boolean).sort(), output: r.output };
};

describe('CS-8 compose resolves every combination', () => {
  test('CS-8 with all three profiles, today\'s services', () => {
    const r = services('liquid,openclaw,opencode');
    expect(r.code, r.output).toBe(0);
    expect(r.list).toEqual(TODAY);
  });

  test('CS-8 the negative: with none, exactly the four are left out, and it still resolves', () => {
    const r = services('');
    expect(r.code, r.output).toBe(0);
    expect(r.list).toEqual(TODAY.filter((s) => !SWITCHABLE.includes(s)));
  });

  test('CS-8 and the proxy keeps today\'s conditions, the switchable three optional', () => {
    const r = config('liquid,openclaw,opencode', ['compose.yml'], '--format', 'json');
    expect(r.code, r.output).toBe(0);
    const deps = JSON.parse(r.stdout).services.proxy.depends_on as Record<string, { condition: string; required: boolean }>;
    expect(Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, v.condition]))).toEqual(CONDITIONS);
    for (const [name, dep] of Object.entries(deps)) {
      expect(`${name} required: ${dep.required}`).toBe(`${name} required: ${!['opencode', 'nar_builder', 'openclaw-gateway'].includes(name)}`);
    }
  });

  test('CS-8 and the routing-only override resolves with the agents profiled out', () => {
    const r = config('privacy-proxy', ['compose.yml', 'config/privacy-proxy/compose.routing-only.yml'], '-q');
    expect(r.code, r.output).toBe(0);
  });
});
