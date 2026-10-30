/**
 * M-CS · Integration · The three lists of images give one answer
 *
 * Purpose:  Which images an installation needs is written down three times. `build.sh`
 *           builds them, `start.sh`'s pre-flight requires them, and `builtImages()` tells
 *           the dashboard whether a build is needed. They are in two languages, so they do
 *           not share one list; making them would be a change of its own (§7 of the feature
 *           specification, the second review). If one drifts, the dashboard offers a Start
 *           the start refuses, or the build leaves out an image the start requires. Timur's
 *           review on #56 named the duplication; this holds the three to one answer instead.
 * Given:    `scripts/linux/build.sh` with `components.sh` in a temporary tree, its build
 *           scripts stubbed to log their names, each name mapped to the `IMAGE=` line of the
 *           real script under `config/scripts/build/`; `scripts/linux/start.sh` run whole by
 *           `tests/lib/startfixture.ts` with every image reported present, its `image
 *           inspect liquidupstart/…` calls collected; and `builtImages()` from
 *           `dashboard/src/lib/server/project.ts`, imported after `tests/lib/dashboardfixture.ts`
 *           as CS-12 imports it.
 * When:     All three are asked for each of the sixteen combinations of `ENABLE_LIQUID`,
 *           `ENABLE_OPENCLAW`, `ENABLE_OPENCODE` and `PRIVACY_PROXY_ENABLE`.
 * Then:     For every combination the three sets are equal. With all four at `1` that is six
 *           images; with all four at `0`, `liquidupstart/bun-runner:latest` alone.
 * Covers:   CS-23, CS-FR8
 * Negative: a combination where one list leaves out an image the others name shows as a
 *           difference, named by the combination.
 * Counterpart: the all-on set has six images and the all-off set one, so three lists that
 *           agreed on being empty cannot pass.
 *
 * Test data: the images, from the six `IMAGE=` lines:
 * `liquidupstart/{opencode,bun-runner,nar-builder,liquid,openclaw,privacy-proxy}:latest`. The
 * build's `.env` holds the four keys alone. The start's is `.env.example` with
 * `SYSTEM_SIGNIN_WAIT_SECONDS=0` and the four keys set. No docker engine is involved.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../lib/dashboardfixture';
import { builtImages } from '../../dashboard/src/lib/server/project';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { exampleEnv, runStart } from '../lib/startfixture';

const STEPS = ['opencode', 'bun-runner', 'nar-builder', 'liquid', 'openclaw', 'privacy-proxy'];
const IMAGE_OF = Object.fromEntries(
  STEPS.map((step) => {
    const text = readFileSync(join(repoRoot, 'config/scripts/build', `${step}.sh`), 'utf8');
    return [step, text.match(/^IMAGE="(liquidupstart\/[^"]+)"$/m)?.[1] ?? `(no IMAGE= in ${step}.sh)`];
  })
);

const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function built(env: string): string[] {
  const root = mkdtempSync(join(tmpdir(), 'lu-cs23-'));
  made.push(root);
  for (const d of ['scripts/linux', 'config/scripts/start/lib', 'config/scripts/build']) mkdirSync(join(root, d), { recursive: true });
  cpSync(join(repoRoot, 'scripts/linux/build.sh'), join(root, 'scripts/linux/build.sh'));
  cpSync(join(repoRoot, 'config/scripts/start/lib/components.sh'), join(root, 'config/scripts/start/lib/components.sh'));
  const log = join(root, 'build.log');
  for (const step of STEPS) {
    const stub = join(root, 'config/scripts/build', `${step}.sh`);
    writeFileSync(stub, `#!/usr/bin/env bash\nprintf '%s\\n' ${step} >> ${JSON.stringify(log)}\n`);
    chmodSync(stub, 0o755);
  }
  writeFileSync(join(root, '.env'), env);
  const r = sh(['bash', join(root, 'scripts/linux/build.sh')], root);
  if (r.code !== 0) throw new Error(`build.sh failed: ${r.output}`);
  const ran = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return ran.map((step) => IMAGE_OF[step]).sort();
}

function required(keys: Record<string, string>): string[] {
  const run = runStart(exampleEnv({ SYSTEM_SIGNIN_WAIT_SECONDS: '0', ...keys }));
  made.push(run.root);
  if (run.code !== 0) throw new Error(`start.sh failed: ${run.output}`);
  const asked = run.docker
    .map((l) => l.split('\t')[0].match(/^image inspect (liquidupstart\/\S+)$/)?.[1])
    .filter((x): x is string => !!x);
  return [...new Set(asked)].sort();
}

const bit = (n: number, i: number) => ((n >> i) & 1 ? '1' : '0');

describe('CS-23 the three lists of images give one answer', () => {
  for (let n = 0; n < 16; n++) {
    const keys = {
      ENABLE_LIQUID: bit(n, 0),
      ENABLE_OPENCLAW: bit(n, 1),
      ENABLE_OPENCODE: bit(n, 2),
      PRIVACY_PROXY_ENABLE: bit(n, 3)
    };
    const name = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join(' ');
    test(`CS-23 ${name}: build, start and dashboard name the same images`, () => {
      const dashboard = builtImages(
        { liquid: keys.ENABLE_LIQUID === '1', openclaw: keys.ENABLE_OPENCLAW === '1', opencode: keys.ENABLE_OPENCODE === '1' },
        keys.PRIVACY_PROXY_ENABLE === '1'
      ).sort();
      const env = Object.entries(keys).map(([k, v]) => `${k}=${v}\n`).join('');
      expect({ build: built(env), start: required(keys) }).toEqual({ build: dashboard, start: dashboard });
      if (n === 15) expect(dashboard.length).toBe(6);
      if (n === 0) expect(dashboard).toEqual(['liquidupstart/bun-runner:latest']);
    }, 60_000);
  }
});
