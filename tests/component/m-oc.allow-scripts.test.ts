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
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh, wasInterrupted } from '../lib/shell';
import { repoRoot } from '../lib/paths';

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

// The case's budget, and the build's own timeout inside it. The build has to be
// stopped by its own timeout rather than by bun's: bun 1.4.3 kills a spawnSync
// child with SIGTERM when the budget fires, and docker then exits 255 and says
// nothing about why -- measured 2026-10-21 -- so only a timeout the helper set
// itself is known to have fired. Thirty seconds is the margin for the case to
// read that and say so before bun's budget ends it.
const BUILD_BUDGET_MS = 600_000;
const BUILD_TIMEOUT_MS = BUILD_BUDGET_MS - 30_000;

function build(tag: string, run: string): { code: number; output: string; timedOut: boolean } {
  const dir = mkdtempSync(join(workRoot, 'ctx-'));
  writeFileSync(join(dir, 'Dockerfile'), `FROM ${baseImage()}\nUSER root\n${run}\n`);
  return sh(['docker', 'build', '--no-cache', '--progress=plain', '-t', tag, dir], repoRoot, {}, BUILD_TIMEOUT_MS);
}

/**
 * A build that was cut off says nothing about the flag, and must not be read as
 * if it did.
 *
 * Both cases below run `docker build --no-cache` with an `npm install` inside, so
 * they reach the network. Under load or on a slow link the build outlives its
 * budget: under bun 1.3.13 docker returned **130** and `OC-15` read *"expected 0,
 * received 130"*, a statement about this machine presented as a verdict on
 * `--allow-scripts`; under bun 1.4.3 it returns 255 and says nothing, which is
 * why the build carries a timeout of its own. Measured twice on 2026-10-09 (`Received: 130`
 * and `this test timed out after 60000ms`), and both cases **passed in two later
 * runs on a quiet machine** -- which is what makes it the worse of the two
 * findings: a case whose colour depends on the load is how red stops meaning
 * anything.
 *
 * `OC-16` is worse still and in the other direction: it expects a **non-zero**
 * exit, so an interrupted build satisfies its first assertion by accident. Only
 * the second one -- that npm named the script it refused to run -- keeps it
 * honest. This guard makes the accident impossible rather than survivable.
 */
function refuseInterrupted(r: { code: number; output: string; timedOut: boolean }, what: string): void {
  if (!wasInterrupted(r)) return;
  const how = r.timedOut ? `ran past its ${BUILD_TIMEOUT_MS / 1000}s timeout` : `was interrupted (exit ${r.code})`;
  throw new Error(
    [
      `${what}: the docker build ${how}, so this run measured nothing.`,
      '  It reaches the network -- `docker build --no-cache` with an npm install inside -- and a',
      '  build that is cut off says nothing about --allow-scripts either way.',
      '  This is a statement about the machine, not about the code under test.'
    ].join('\n')
  );
}

describe('OC-15/OC-16 the install script flag', () => {
  test('the build script really does pass --allow-scripts and end in a version check', () => {
    // Read, not assumed: this is what the other two cases are built from.
    const line = installLine();
    expect(line).toContain('--allow-scripts=@anthropic-ai/claude-code');
    expect(line).toContain('claude --version');
  });

  // The budget: a docker build with an npm install in it does not belong in the
  // suite's 60-second default, which is a figure for tests that do not reach the
  // network. `m-b7`'s maven build carries 1_200_000 for the same reason. Ten
  // minutes here turns a slow link into a slow suite rather than a red one, which
  // is the first of the two ways out the backlog recorded -- and the guard above
  // is what keeps a cut-off build from reading as a verdict either way.
  test('OC-15 with the flag, the image is built and the CLI reports a version', () => {
    const r = build('lu-oc15-with', installLine());
    refuseInterrupted(r, 'OC-15');
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/\d+\.\d+\.\d+ \(Claude Code\)/);
  }, BUILD_BUDGET_MS);

  test('OC-16 without the flag, the build fails instead of shipping an empty launcher', () => {
    const without = installLine().replace('--allow-scripts=@anthropic-ai/claude-code ', '');
    expect(without).not.toContain('--allow-scripts');
    const r = build('lu-oc16-without', without);
    // Before the assertion, not after: this case expects a non-zero exit, so an
    // interrupted build would satisfy it by accident.
    refuseInterrupted(r, 'OC-16');
    expect(r.code).not.toBe(0);
    // npm names the script it refused to run; the build then dies on the version check.
    expect(r.output).toContain('install.cjs');
  }, BUILD_BUDGET_MS);
});
