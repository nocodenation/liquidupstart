/**
 * M-CS · Integration · compose does what the profile design leans on
 *
 * Purpose:  Before #50 only the privacy proxy ran under a profile; the switches move four
 *           everyday services behind profiles. Three things the design relies on come from
 *           compose's documentation: that `required: false` accepts a dependency left out
 *           by its profile, that a condition still holds when the dependency is present,
 *           and that a command naming a profiled service enables its profile for that
 *           call. The last carries the README's, the skills' and `nar_builder`'s
 *           instructions -- `docker compose logs liquid`, `exec nar_builder`,
 *           `restart liquid` -- and the system tier's helpers. A fourth is recorded
 *           because `openclaw.sh` depends on it: whether `run` enables a dependency's
 *           profile. Measured by hand first on 2026-10-29, before any code was written
 *           (FEATURE §6); this file is that measurement, repeatable.
 * Given:    docker compose 5.6.1 and a throwaway project, not this repository's
 *           `compose.yml`: project name `lu-cs0-<pid>`, so no real project can be
 *           touched, in a `mkdtemp` directory.
 * When:     (1) `up -d` with no profile; (2) `down`, then `up -d` with `bp`; (3) with `b`
 *           running from (2) and no profile, `logs b`, `exec -T b true`, `restart b`,
 *           `stop b`, `start b`, `ps b`; (4) `run --rm c true` with no profile; and,
 *           as the negative, `config -q` of the same project without `required: false`; and
 *           `up -d` of a project whose `b` is present but never healthy, once with
 *           `required: false` and once without.
 * Then:     (1) rc 0, `a` running, no container for `b`. (2) rc 0, `b` healthy, and `a`
 *           started after `b`. (3) every command rc 0. (4) refused, `no such service: b`:
 *           `run` does not enable a dependency's profile, which is why `start.sh` exports
 *           the profiles before `openclaw.sh` (CS-5). Without `required: false`, compose
 *           refuses the project and names `b`. With `b` unhealthy, `required` makes `up` exit
 *           non-zero, and `required: false` makes it exit 0 with `a` running -- which is why
 *           `start.sh` asks after `up` whether the gateway is healthy (CS-5; found by the
 *           second local review of 2026-10-29 and measured the same day).
 * Covers:   CS-0, CS-FR5, CS-NFR1
 * Negative: the project without `required: false` is refused; and (4), where compose does
 *           not do what the start would need, recorded as measured.
 * Counterpart: (1) to (3), so a compose that refused everything cannot pass.
 * Precondition: docker with compose, and `nginx:latest` present locally, which `start.sh`
 *           already uses as its probe image. The file calls `docker compose`, so the runner
 *           classes it as stack tier and runs it with `--system`; it touches nothing but its
 *           own project, which (5) removes with `COMPOSE_PROFILES='*'`.
 *
 * Test data: `compose.yml` in full -- service `a`, `nginx:latest`, `command: ["sleep",
 * "infinity"]`, `depends_on: {b: {condition: service_healthy, required: false}}`; service
 * `b`, `nginx:latest`, `profiles: ["bp"]`, healthcheck `["CMD", "true"]` every second;
 * service `c`, `nginx:latest`, `profiles: ["cp"]`, `depends_on: [b]`. "No profile" is
 * `COMPOSE_PROFILES` set empty, which compose reads as none. **Must not exist:** any
 * container of the project before (1).
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sh } from '../lib/shell';

const PROJECT = `lu-cs0-${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), 'lu-cs0-'));
const COMPOSE = (required: boolean) => `services:
  a:
    image: nginx:latest
    command: ["sleep", "infinity"]
    depends_on:
      b:
        condition: service_healthy
${required ? '' : '        required: false\n'}  b:
    image: nginx:latest
    profiles: ["bp"]
    healthcheck:
      test: ["CMD", "true"]
      interval: 1s
      retries: 30
  c:
    image: nginx:latest
    profiles: ["cp"]
    command: ["true"]
    depends_on: [b]
`;
writeFileSync(join(dir, 'compose.yml'), COMPOSE(false));
writeFileSync(join(dir, 'strict.yml'), COMPOSE(true));
const UNHEALTHY = (required: boolean) => `services:
  a:
    image: nginx:latest
    command: ["sleep", "infinity"]
    depends_on:
      b:
        condition: service_healthy
        required: ${required}
  b:
    image: nginx:latest
    profiles: ["bp"]
    command: ["sleep", "infinity"]
    healthcheck:
      test: ["CMD", "false"]
      interval: 1s
      retries: 2
`;
writeFileSync(join(dir, 'unhealthy-required.yml'), UNHEALTHY(true));
writeFileSync(join(dir, 'unhealthy-optional.yml'), UNHEALTHY(false));
const unhealthy = (file: string, ...args: string[]) =>
  sh(['docker', 'compose', '-p', `${PROJECT}-u`, '-f', join(dir, file), ...args], dir, { COMPOSE_PROFILES: 'bp' });

const compose = (profiles: string, ...args: string[]) =>
  sh(['docker', 'compose', '-p', PROJECT, '-f', join(dir, 'compose.yml'), ...args], dir, {
    COMPOSE_PROFILES: profiles
  });

function container(service: string): { running: boolean; startedAt: string; health: string } | null {
  const id = compose('*', 'ps', '-aq', service).stdout.trim();
  if (!id) return null;
  const r = sh(['docker', 'inspect', '--format', '{{.State.Running}}|{{.State.StartedAt}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', id]);
  const [running, startedAt, health] = r.stdout.trim().split('|');
  return { running: running === 'true', startedAt, health };
}

afterAll(() => {
  compose('*', 'down', '--remove-orphans', '--timeout', '1');
  for (const f of ['unhealthy-required.yml', 'unhealthy-optional.yml']) {
    sh(['docker', 'compose', '-p', `${PROJECT}-u`, '-f', join(dir, f), 'down', '--remove-orphans', '--timeout', '1'], dir, { COMPOSE_PROFILES: '*' });
  }
  rmSync(dir, { recursive: true, force: true });
});

const LONG = 120_000;

describe('CS-0 compose does what the profile design leans on', () => {
  test('CS-0 required: false starts a service whose dependency\'s profile is inactive', () => {
    expect(compose('*', 'ps', '-aq').stdout.trim()).toBe('');
    const up = compose('', 'up', '-d');
    expect(up.code, up.output).toBe(0);
    expect(container('a')?.running).toBe(true);
    expect(container('b')).toBeNull();
  }, LONG);

  test('CS-0 and keeps condition: service_healthy when the profile is active', () => {
    expect(compose('*', 'down', '--timeout', '1').code).toBe(0);
    const up = compose('bp', 'up', '-d');
    expect(up.code, up.output).toBe(0);
    const a = container('a');
    const b = container('b');
    expect(b?.health).toBe('healthy');
    expect(Date.parse(a!.startedAt)).toBeGreaterThan(Date.parse(b!.startedAt));
  }, LONG);

  test('CS-0 and a command naming a running profiled service enables its profile for that call', () => {
    const calls: string[][] = [
      ['logs', 'b'],
      ['exec', '-T', 'b', 'true'],
      ['restart', 'b'],
      ['stop', 'b'],
      ['start', 'b'],
      ['ps', 'b']
    ];
    const codes = calls.map((args) => `${args.join(' ')}: ${compose('', ...args).code}`);
    expect(codes).toEqual(calls.map((args) => `${args.join(' ')}: 0`));
  }, LONG);

  test('CS-0 the negative, recorded: run does not enable a dependency\'s profile', () => {
    const r = compose('', 'run', '--rm', 'c', 'true');
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('no such service: b');
  }, LONG);

  test('CS-0 the negative, recorded: with b unhealthy, required makes up fail and required: false does not', () => {
    const strict = unhealthy('unhealthy-required.yml', 'up', '-d');
    expect(strict.code).not.toBe(0);
    unhealthy('unhealthy-required.yml', 'down', '--timeout', '1');
    const optional = unhealthy('unhealthy-optional.yml', 'up', '-d');
    expect(optional.code, optional.output).toBe(0);
    const ps = unhealthy('unhealthy-optional.yml', 'ps', '--format', '{{.Service}} {{.State}}').stdout;
    expect(ps).toContain('a running');
  }, LONG);

  test('CS-0 the negative: without required: false compose refuses the project, naming b', () => {
    const r = sh(['docker', 'compose', '-p', PROJECT, '-f', join(dir, 'strict.yml'), 'config', '-q'], dir, {
      COMPOSE_PROFILES: ''
    });
    expect(r.code).not.toBe(0);
    expect(r.output).toContain('depends on undefined service "b"');
  }, LONG);
});
