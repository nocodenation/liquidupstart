/**
 * M-B4 · Contract · The container runs the entrypoint the cases read
 *
 * Purpose:  config/liquid/entrypoint.sh is COPYed into liquidupstart/liquid:latest,
 *           not mounted, and so is the parser beside it. On 2026-09-08 the
 *           running container was thirty-eight lines behind the file, and B2-5
 *           and B2-6 were green over it: a stack built from one branch and
 *           asserted from another is indistinguishable from a broken fix. Every
 *           other case in this milestone reads the file on disk, so all of them
 *           are worth exactly what this one is.
 * Given:    config/liquid/entrypoint.sh and config/liquid/narcheck.py on disk,
 *           and /opt/nifi/scripts/entrypoint.sh and /opt/nifi/scripts/narcheck.py
 *           read out of the running liquid container.
 * When:     The two pairs are compared as text, and the file on disk is read for
 *           the order of its steps.
 * Then:     Each pair is identical, and in the copy loop the check runs before
 *           the cp into lib/ -- a check after the copy refuses nothing. The
 *           remedy when this fails is ./config/scripts/build/liquid.sh followed
 *           by docker compose up -d --no-deps liquid, which is a restart and so
 *           the operator's.
 * Covers:   B4-7, FR36, and §4 check 3b
 * Unhappy:  The failure this case exists for is a green suite over a container
 *           running something else; it has no positive counterpart, because the
 *           positive is every other case in the milestone.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { LIQUID_SERVICE, narcheckPath, CONTAINER_NARCHECK } from '../lib/narcheckfixture';
import { entrypointPath, CONTAINER_ENTRYPOINT } from '../lib/entrypointfixture';

const REMEDY = './config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid';

function inContainer(path: string): string {
  const r = sh(['docker', 'compose', 'exec', '-T', LIQUID_SERVICE, 'cat', path]);
  if (r.code !== 0) throw new Error(`${path} could not be read out of ${LIQUID_SERVICE}: ${r.output}`);
  return r.stdout;
}

const text = readFileSync(entrypointPath, 'utf8');

test('B4-7 the entrypoint in the container is the file on disk', () => {
  expect(inContainer(CONTAINER_ENTRYPOINT)).toBe(text);
});

test('B4-7 the parser in the container is the file on disk', () => {
  expect(inContainer(CONTAINER_NARCHECK)).toBe(readFileSync(narcheckPath, 'utf8'));
});

test('B4-7 the entrypoint checks a NAR before it copies it', () => {
  const check = text.indexOf('check "$NAR" "$LIB_DIR"');
  const copy = text.indexOf('cp -v');
  expect(text).toContain('narcheck.py');
  expect(check).toBeGreaterThan(-1);
  expect(copy).toBeGreaterThan(check);
});

test('B4-7 the image is built from the file this case read', () => {
  const dockerfile = readFileSync(join(repoRoot, 'config/liquid/templates/Dockerfile'), 'utf8');
  expect(dockerfile).toContain('COPY --chown=nifi:nifi ./entrypoint.sh /opt/nifi/scripts/entrypoint.sh');
  expect(dockerfile).toContain('COPY --chown=nifi:nifi ./narcheck.py /opt/nifi/scripts/narcheck.py');
  expect(REMEDY).toContain('config/scripts/build/liquid.sh');
});
