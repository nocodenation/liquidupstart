/**
 * M-B1 · System · It works from where the agent actually is
 *
 * Purpose:  Every other case proves the mechanism; this proves it is reachable
 *           from the container an agent works in, over the path this stack
 *           requires — the proxy with a Host header, because X.localhost names
 *           do not resolve inside a container. That constraint has caught this
 *           project before, which is why it is asserted from openclaw-gateway
 *           and not only from the harness.
 * Given:    volumes/repos/.b1-gateway holding the B1-5 fixture, and the running
 *           openclaw-gateway container.
 * When:     nar-build is invoked from inside that container the way an agent
 *           would — the bare command name, cwd inside the source directory, no
 *           path and no port spelled out.
 * Then:     Exit 0, the artifact lands in volumes/nar_extensions, and the
 *           command was found on the bare PATH.
 * Covers:   B1-10, U9, FR21
 * Unhappy:  A command mounted but unreachable, or a builder addressed by a name
 *           that does not resolve inside a container, fails here — the negative
 *           control for it is check 6 of §4, which stops nar_builder and expects
 *           this to go red.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import { sh } from '../lib/shell';
import { seedSource, dropFixture, dropContents, DROP_HOST } from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'openclaw-gateway']);

const fx = seedSource('.b1-gateway');
const before = dropContents();
let run: Result;
let produced: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B1-10 the command is on the bare PATH in the container an agent works in', () => {
  const which = sh(['docker', 'compose', 'exec', '-T', 'openclaw-gateway', 'sh', '-lc', 'command -v nar-build']);
  expect(which.code).toBe(0);
  expect(which.stdout.trim()).toBe('/usr/local/bin/nar-build');
});

test('B1-10 a build run from inside that container lands the artifact', () => {
  run = sh([
    'docker',
    'compose',
    'exec',
    '-T',
    '-w',
    fx.container,
    'openclaw-gateway',
    'nar-build'
  ]);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(run.output).toBeTruthy();
  expect(run.code).toBe(0);
  expect(produced.length).toBe(1);
  expect(produced[0]).toEndWith('.nar');
}, 1_200_000);

test('B1-10 the answer named the artifact it wrote', () => {
  expect(run.stdout).toContain(produced[0]);
});
