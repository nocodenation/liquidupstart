/**
 * OC-15, OC-16 — the npm flag that stands between a working CLI and an empty launcher.
 *
 * Purpose: `@anthropic-ai/claude-code` fetches its native binary in a postinstall
 * script. 2026.9.1's base image ships **npm 12**, which blocks install scripts
 * unless `allowScripts` names the package — so without the flag the install
 * succeeds with a warning and the image ships a launcher with nothing to launch.
 * That is exactly what happened on 2026-09-05: the build reported success, the
 * start printed every URL and password, and OpenClaw could not serve a single
 * request.
 *
 * Given  the 2026.9.1 base image, and the install line as build/openclaw.sh renders it
 * When   the image is built with the flag, and again without it
 * Then   the first ends in a version string and the second fails at the version
 *        check instead of shipping -- or, when the build was cut off before it
 *        could do either, the case fails with "this run measured nothing" rather
 *        than with a verdict on the flag. Each build carries a timeout of its own
 *        below the case's budget, so a cut-off build is known as one (SP-5).
 *
 * OC-16, the negative, is the one that matters. With only OC-15 we would know the
 * flag is present, not that it is load-bearing — and a flag that turned out to be
 * decorative would be worth removing. It is not: measured 2026-09-06, the build
 * without it fails, naming the blocked `install.cjs`.
 *
 * The `&& claude --version` at the end of the line is the point of the whole
 * construction: it converts a silent, successful-looking install into a failed
 * build. Both cases assert against that, not against npm's exit code.
 *
 * Test data: the install line is read out of `config/scripts/build/openclaw.sh`
 * rather than retyped, and the base image out of the rendered Dockerfile template,
 * so neither can drift from what the stack actually builds. The negative variant
 * is that same line with `--allow-scripts=@anthropic-ai/claude-code ` removed and
 * nothing else changed.
 *
 * Requirements covered: OC-G4, FEATURE-openclaw-2026-9-1.md §5.5; the budget and
 * the guard are held by SP-5.
 *
 * Precondition: registryReachable() -- a package registry answers, because the
 *           build does `npm install -g`. Skipped where it does not, which is an
 *           offline machine -- or one with no `curl` to ask with, which then
 *           shows as SP-3's permitting half failing in m-sp.preconditions, not
 *           as two quiet skips here.
 *
 *           **And a budget of its own, because the precondition is not what the
 *           failures were.** These two timed out at the suite's 60s under load,
 *           with the registry reachable every time. They carry 600 s; the figure
 *           and its measurement are SP-5's.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh, refuseInterrupted } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { registryReachable } from '../lib/preconditions';

let workRoot: string;

beforeAll(() => { workRoot = mkdtempSync(join(tmpdir(), 'lu-oc16-')); });
afterAll(() => {
  rmSync(workRoot, { recursive: true, force: true });
  for (const tag of ['lu-oc15-with', 'lu-oc16-without']) {
    sh(['docker', 'rmi', '-f', tag]);
  }
});

/** The install line the build script renders, taken from the build script. */
function installLine(): string {
  const script = readFileSync(join(repoRoot, 'config/scripts/build/openclaw.sh'), 'utf8');
  const m = script.match(/RUN npm install -g [^|']*claude --version/);
  if (!m) throw new Error('install line not found in config/scripts/build/openclaw.sh');
  return m[0].replace(/\\&/g, '&');
}

/** The base image the Dockerfile template pins. */
function baseImage(): string {
  const df = readFileSync(join(repoRoot, 'config/openclaw/templates/Dockerfile'), 'utf8');
  const m = df.match(/^FROM (\S+)/m);
  if (!m) throw new Error('FROM line not found in the Dockerfile template');
  return m[1];
}

// bun's budget kills the child and docker exits 255 silently, so the build
// carries its own timeout 30 s inside it. The figure is SP-5's.
const BUILD_BUDGET_MS = 600_000;
const BUILD_TIMEOUT_MS = BUILD_BUDGET_MS - 30_000;

function build(tag: string, run: string): { code: number; output: string; timedOut: boolean } {
  const dir = mkdtempSync(join(workRoot, 'ctx-'));
  writeFileSync(join(dir, 'Dockerfile'), `FROM ${baseImage()}\nUSER root\n${run}\n`);
  return sh(['docker', 'build', '--no-cache', '--progress=plain', '-t', tag, dir], repoRoot, {}, BUILD_TIMEOUT_MS);
}

describe('OC-15/OC-16 the install script flag', () => {
  test('the build script really does pass --allow-scripts and end in a version check', () => {
    // Read, not assumed: this is what the other two cases are built from.
    const line = installLine();
    expect(line).toContain('--allow-scripts=@anthropic-ai/claude-code');
    expect(line).toContain('claude --version');
  });

  test.skipIf(!registryReachable())(
    'OC-15 with the flag, the image is built and the CLI reports a version',
    () => {
      const r = build('lu-oc15-with', installLine());
      refuseInterrupted(r, 'OC-15', BUILD_TIMEOUT_MS);
      expect(r.code).toBe(0);
      expect(r.output).toMatch(/\d+\.\d+\.\d+ \(Claude Code\)/);
    },
    BUILD_BUDGET_MS
  );

  test.skipIf(!registryReachable())(
    'OC-16 without the flag, the build fails instead of shipping an empty launcher',
    () => {
      const without = installLine().replace('--allow-scripts=@anthropic-ai/claude-code ', '');
      expect(without).not.toContain('--allow-scripts');
      const r = build('lu-oc16-without', without);
      // Before the assertion, not after: this case expects a non-zero exit, so an
      // interrupted build would satisfy it by accident.
      refuseInterrupted(r, 'OC-16', BUILD_TIMEOUT_MS);
      expect(r.code).not.toBe(0);
      // npm names the script it refused to run; the build then dies on the version check.
      expect(r.output).toContain('install.cjs');
    },
    BUILD_BUDGET_MS
  );
});
