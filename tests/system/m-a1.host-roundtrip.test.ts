/**
 * M-A1 · System · A repository created in a container is browsable on the host
 *
 * Purpose:  FR1 asks for a workspace the operator can browse, and NFR3 requires
 *           all state to live in ./volumes as a bind mount rather than a named
 *           volume. A container-only check would pass just as happily against a
 *           named volume, so the assertion deliberately crosses back to the host
 *           filesystem.
 * Given:    A running stack with volumes/repos mounted at /repos.
 * When:     A repository is initialised inside openclaw-gateway.
 * Then:     Its .git/HEAD is readable on the host under volumes/repos.
 * Covers:   A1-8, FR1, NFR3
 * Unhappy:  A path outside the workspace is covered by m-a1.no-confinement.
 */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { requireStack, inContainer } from '../lib/stack';
import { repoRoot } from '../lib/paths';

const NAME = 'probe-roundtrip';
const hostDir = join(repoRoot, 'volumes', 'repos', NAME);

beforeAll(() => requireStack());
afterAll(() => rmSync(hostDir, { recursive: true, force: true }));

test('A1-8 the host sees a repository the container created', () => {
  const r = inContainer(
    'openclaw-gateway',
    `cd /repos && rm -rf ${NAME} && git init -q ${NAME} && echo ok`
  );
  expect(r.code).toBe(0);

  const head = join(hostDir, '.git', 'HEAD');
  expect(existsSync(head)).toBe(true);
  expect(readFileSync(head, 'utf8')).toContain('ref:');
});
