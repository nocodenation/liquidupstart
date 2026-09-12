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
 *        check instead of shipping.
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
 * Requirements covered: OC-G4, FEATURE-openclaw-2026-9-1.md §5.5.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
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

function build(tag: string, run: string): { code: number; output: string } {
  const dir = mkdtempSync(join(workRoot, 'ctx-'));
  writeFileSync(join(dir, 'Dockerfile'), `FROM ${baseImage()}\nUSER root\n${run}\n`);
  return sh(['docker', 'build', '--no-cache', '--progress=plain', '-t', tag, dir]);
}

describe('OC-15/OC-16 the install script flag', () => {
  test('the build script really does pass --allow-scripts and end in a version check', () => {
    // Read, not assumed: this is what the other two cases are built from.
    const line = installLine();
    expect(line).toContain('--allow-scripts=@anthropic-ai/claude-code');
    expect(line).toContain('claude --version');
  });

  test('OC-15 with the flag, the image is built and the CLI reports a version', () => {
    const r = build('lu-oc15-with', installLine());
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/\d+\.\d+\.\d+ \(Claude Code\)/);
  });

  test('OC-16 without the flag, the build fails instead of shipping an empty launcher', () => {
    const without = installLine().replace('--allow-scripts=@anthropic-ai/claude-code ', '');
    expect(without).not.toContain('--allow-scripts');
    const r = build('lu-oc16-without', without);
    expect(r.code).not.toBe(0);
    // npm names the script it refused to run; the build then dies on the version check.
    expect(r.output).toContain('install.cjs');
  });
});
