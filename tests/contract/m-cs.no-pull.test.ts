/**
 * M-CS · Contract · No local-only image is ever pulled
 *
 * Purpose:  The six `liquidupstart/*` images are built here and are on no registry this stack
 *           trusts. Docker Hub's `liquidupstart` namespace belongs to nobody -- every lookup
 *           answered 404 on 2026-10-30 -- so a `docker run` or a compose service that finds
 *           such an image missing would pull whatever anyone had put there and run it on the
 *           stack network. Timur's review on #56 found the pairing card and three sign-in
 *           probes doing exactly that path once OpenClaw was switched on before a build
 *           (decision 14). One site without the flag brings it back, and sites are added
 *           often: OpenClaw's start step alone has ten.
 * Given:    the shipped code read as text: every shell script under `config/` and
 *           `scripts/` (by extension `.sh`, or by a shell shebang), except `scripts/tests/`,
 *           plus `run.sh` and `cleanup.sh`; every `.ts`, `.js` and `.svelte` file under
 *           `dashboard/src/` except tests; and `compose.yml`, service by service.
 * When:     Every line that runs `docker run` or `docker container run` is collected,
 *           leaving out comments and the text an `echo`, `printf` or `warn` prints; every
 *           `'run'` element of a docker argv in the dashboard; every service whose `image:` is
 *           `liquidupstart/…`.
 * Then:     Every shell site reads `docker run --pull never` (or `docker container run
 *           --pull never`), and every dashboard argv `'run', '--pull', 'never'`, the flag
 *           straight after `run` so a reader sees it at a glance -- except the three named
 *           sites, each of which runs the public image it is named for. The two `ingest-pdf`
 *           builds are run as well, with a stub `docker` that logs its arguments and fails so
 *           the script stops at its run: without `OPENCLAW_IMAGE` they refuse, naming the
 *           image to set, and with `liquidupstart/openclaw:latest` they pass `--pull never`
 *           (the local reviews of 2026-10-30; the remedy `BACKLOG.md` left for whoever next
 *           edited them). The sites found
 *           include `config/scripts/openclaw-pairing.sh`. The seven services each declare
 *           `pull_policy: never` and no `build:`.
 * Covers:   CS-22, CS-FR15, CS-FR5
 * Negative: a site without the flag is named, and so is a service without the setting; the
 *           predicate itself names `docker run --rm liquidupstart/openclaw:latest`.
 * Counterpart: the predicate passes `docker run --pull never --rm liquidupstart/openclaw:latest`;
 *           each named site is held to its public image, so an exemption cannot cover a
 *           local one; and the list of sites is not empty, so a pattern that matched nothing
 *           cannot pass.
 *
 * Test data: **the named sites** -- `config/scripts/start/nginx.sh`, `keytool` from
 * `eclipse-temurin:17-jre-jammy`; `scripts/install/install.sh`, `hello-world`, two sites. **The
 * builds:** `config/openclaw/plugins/ingest-pdf/build.sh` and
 * `config/openclaw/claude_tools/ingest-pdf/build.sh`, run with `OPENCLAW_IMAGE` unset, where
 * stderr must hold `set it to the image this stack runs` and docker is never called, and with
 * `OPENCLAW_IMAGE=liquidupstart/openclaw:latest`, where the first two arguments after `run` must be
 * `--pull never`. **The services:** `opencode`,
 * `bun_runner`, `nar_builder`, `liquid`, `openclaw-gateway`, `openclaw-cli`, `privacy-proxy`;
 * Hermes is commented out and is not one.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { composeText, serviceBlock } from '../lib/compose-file';

type Site = { file: string; line: number; command: string };

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.svelte-kit']);

function walk(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(full, keep));
    } else if (entry.isFile() && keep(full)) out.push(full);
  }
  return out;
}

const isShell = (path: string) => {
  if (path.endsWith('.sh')) return true;
  if (/\.[A-Za-z0-9]+$/.test(path.split('/').pop() ?? '') || statSync(path).size > 2_000_000) return false;
  return /^#!.*\b(ba)?sh\b/.test(readFileSync(path, 'utf8').slice(0, 80));
};

const SHELL_FILES = [
  ...walk(join(repoRoot, 'config'), isShell),
  ...walk(join(repoRoot, 'scripts'), (p) => !relative(repoRoot, p).startsWith('scripts/tests/') && isShell(p)),
  join(repoRoot, 'run.sh'),
  join(repoRoot, 'cleanup.sh')
];
const DASHBOARD_FILES = walk(join(repoRoot, 'dashboard', 'src'), (p) => /\.(ts|js|svelte)$/.test(p) && !/\.test\./.test(p));

const PRINTED = /^\s*(echo|printf|warn|info)\b/;
const RUN = /\bdocker (container )?run\b/;

/** A shell `docker run`, with its continuation lines joined, that does not say `--pull never` straight after `run`. */
function unguarded(command: string): boolean {
  const m = command.match(/\bdocker (?:container )?run\b(.*)$/s);
  return !!m && !/^\s+--pull never\b/.test(m[1]);
}

function shellSites(): Site[] {
  const sites: Site[] = [];
  for (const path of SHELL_FILES) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line) || PRINTED.test(line)) return;
      const at = line.search(RUN);
      if (at === -1) return;
      const hash = line.indexOf(' #');
      if (hash !== -1 && hash < at) return;
      let command = line;
      for (let j = i; lines[j]?.trimEnd().endsWith('\\') && j + 1 < lines.length; j++) command += `\n${lines[j + 1]}`;
      sites.push({ file: relative(repoRoot, path), line: i + 1, command });
    });
  }
  return sites;
}

function dashboardSites(): Site[] {
  const sites: Site[] = [];
  for (const path of DASHBOARD_FILES) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim() !== "'run'," && !/\[\s*'run'\s*,/.test(line)) return;
      const command = lines.slice(i, i + 3).map((l) => l.trim()).join(' ');
      sites.push({ file: relative(repoRoot, path), line: i + 1, command });
    });
  }
  return sites;
}

const NAMED: { file: string; image: string; count: number }[] = [
  { file: 'config/scripts/start/nginx.sh', image: 'eclipse-temurin:17-jre-jammy', count: 1 },
  { file: 'scripts/install/install.sh', image: 'hello-world', count: 2 }
];
const named = (s: Site) => NAMED.some((n) => n.file === s.file);

const INGEST = ['config/openclaw/plugins/ingest-pdf/build.sh', 'config/openclaw/claude_tools/ingest-pdf/build.sh'];
const stubDir = mkdtempSync(join(tmpdir(), 'lu-cs22-'));
afterAll(() => rmSync(stubDir, { recursive: true, force: true }));
writeFileSync(join(stubDir, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" > ${JSON.stringify(join(stubDir, 'argv'))}\nexit 1\n`);
chmodSync(join(stubDir, 'docker'), 0o755);

/** A build run against the stub: its exit, its stderr, and the two arguments after `run`, if docker was called. */
function build(file: string, image?: string): { code: number; stderr: string; first: string } {
  rmSync(join(stubDir, 'argv'), { force: true });
  const env: Record<string, string> = { PATH: `${stubDir}:${process.env.PATH}` };
  if (image) env.OPENCLAW_IMAGE = image;
  const r = sh(['bash', '-c', image ? 'bash "$0"' : 'unset OPENCLAW_IMAGE; bash "$0"', join(repoRoot, file)], repoRoot, env);
  const line = (() => { try { return readFileSync(join(stubDir, 'argv'), 'utf8'); } catch { return ''; } })();
  return { code: r.code, stderr: r.stderr, first: line ? line.split(' ').slice(1, 3).join(' ') : '(docker not called)' };
}

const LOCAL_SERVICES = ['bun_runner', 'liquid', 'nar_builder', 'openclaw-cli', 'openclaw-gateway', 'opencode', 'privacy-proxy'];

describe('CS-22 no local-only image is ever pulled', () => {
  test('CS-22 the predicate names a run without the flag, and passes one with it', () => {
    expect(unguarded('docker run --rm liquidupstart/openclaw:latest')).toBe(true);
    expect(unguarded('with_timeout 60 docker run --rm --init \\\n  "${OPENCLAW_IMAGE}"')).toBe(true);
    expect(unguarded('docker run --pull never --rm liquidupstart/openclaw:latest')).toBe(false);
    expect(unguarded('docker container run --pull never --rm x')).toBe(false);
  });

  test('CS-22 the negative: every docker run in the shipped scripts says --pull never, but the named sites', () => {
    const sites = shellSites();
    expect(sites.map((s) => s.file)).toContain('config/scripts/openclaw-pairing.sh');
    expect(sites.filter((s) => s.file === 'config/scripts/start/openclaw.sh').length).toBe(10);
    const missing = sites.filter((s) => !named(s) && unguarded(s.command)).map((s) => `${s.file}:${s.line}`);
    expect(missing).toEqual([]);
  });

  test('CS-22 the negative: and every docker argv in the dashboard says --pull never straight after run', () => {
    const sites = dashboardSites();
    expect(sites.length).toBe(9);
    const missing = sites
      .filter((s) => !/'run', '--pull', 'never'|'run',\s*'--pull',\s*'never'/.test(s.command))
      .map((s) => `${s.file}:${s.line}`);
    expect(missing).toEqual([]);
  });

  test('CS-22 the counterpart: each named site runs the public image it is named for', () => {
    const sites = shellSites().filter(named);
    for (const n of NAMED) {
      const here = sites.filter((s) => s.file === n.file);
      expect(`${n.file}: ${here.length}`).toBe(`${n.file}: ${n.count}`);
      for (const s of here) expect(s.command, `${s.file}:${s.line}`).toContain(n.image);
    }
  });

  test('CS-22 the negative: the two ingest-pdf builds refuse without OPENCLAW_IMAGE, and call no docker', () => {
    for (const file of INGEST) {
      const r = build(file);
      expect(r.code, file).not.toBe(0);
      expect(r.stderr, file).toContain('set it to the image this stack runs');
      expect(`${file}: ${r.first}`).toBe(`${file}: (docker not called)`);
    }
  });

  test('CS-22 the counterpart: given the stack\'s image, they run it with --pull never', () => {
    for (const file of INGEST) {
      expect(`${file}: ${build(file, 'liquidupstart/openclaw:latest').first}`).toBe(`${file}: --pull never`);
    }
  });

  test('CS-22 the negative: every compose service of a liquidupstart image says pull_policy: never and has no build', () => {
    const names = [...composeText().matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
    const local = names.filter((n) => /^ {4}image: liquidupstart\//m.test(serviceBlock(n))).sort();
    expect(local).toEqual(LOCAL_SERVICES);
    for (const name of local) {
      const block = serviceBlock(name);
      expect(`${name}: ${/^ {4}pull_policy: never$/m.test(block)}`).toBe(`${name}: true`);
      expect(`${name} build: ${/^ {4}build:/m.test(block)}`).toBe(`${name} build: false`);
    }
  });
});
