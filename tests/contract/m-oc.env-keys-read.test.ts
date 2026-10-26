/**
 * OC-79 · Contract · Every key .env.example declares is read by something
 *
 * Purpose:  `.env.example` is the contract (CLAUDE.md), so a key it declares is a
 *           promise that setting it does something. `OPENCLAW_GATEWAY_TOKEN` was
 *           declared and read by nothing: the 2026.9.1 migration found it in
 *           September, called it "a promise the contract does not keep", and left
 *           it because giving the gateway a token changes its authentication
 *           model. Carried over to BACKLOG; the operator chose on 2026-10-26 to
 *           remove the key. Measuring every key for that found four more: the
 *           rebrand of 2026-06-19 renamed `NIFI_SYSTEM_DEPENDENCIES` and its three
 *           siblings to `LIQUID_*` in `.env.example`, while `liquid.sh` went on
 *           asking `resolve_image_settings "NIFI"`, so the Liquid image's own
 *           package and command settings had done nothing since.
 * Given:    `.env.example`, and the tracked files under config/, scripts/,
 *           dashboard/src, compose.yml and run.sh; and a fixture tree of its own.
 * When:     Each declared key is looked for, whole, outside comment lines, and
 *           outside Markdown and test files, which describe a key and read none; a key of the shape `<P>_SYSTEM_DEPENDENCIES` or
 *           `<P>_POST_INSTALLATION_COMMANDS`, with or without `_MODE`, also counts
 *           as read where a build script calls `resolve_image_settings "<P>"`,
 *           which composes those names at run time.
 * Then:     No key in the tree is unread; in the fixture, exactly the five keys
 *           built to be unread are. And because `liquid.sh` now reads `LIQUID_*`,
 *           an .env from before the rebrand that still sets `NIFI_*` would lose
 *           those settings without a word: the build says so instead, naming the
 *           key it reads now, and says nothing for the defaults such an .env
 *           carries untouched.
 * Covers:   OC-79, CLAUDE.md's `.env.example` contract
 * Negative: a key mentioned only in a comment, only in Markdown, only in a test,
 *           only as part of a longer key, or only under a prefix no build script
 *           asks for is unread.
 * Counterpart: a key a template declares, one the dashboard reads, and two that a
 *           `resolve_image_settings` call composes are read, so a search that
 *           called every key unread cannot pass the fixture.
 *
 * Test data: the fixture's `.env.example` declares `LU_READ_KEY`, `LU_DASH_KEY`,
 * `LU_COMMENT_ONLY`, `LU_DOC_ONLY`, `LU_TEST_ONLY`, `LU_PREFIX`, `LU_PREFIX_LONGER`,
 * `ALPHA_SYSTEM_DEPENDENCIES`, `ALPHA_POST_INSTALLATION_COMMANDS_MODE` and
 * `BETA_SYSTEM_DEPENDENCIES`, each as `KEY=`. Its readers:
 * `config/x/templates/env_template` holding `LU_READ_KEY=` and
 * `LU_PREFIX_LONGER=`; `dashboard/src/lib/x.ts` holding
 * `const v = env.LU_DASH_KEY;`; `config/x/start.sh` holding the comment line
 * `# LU_COMMENT_ONLY is not read here`; `config/x/notes.md` holding
 * `LU_DOC_ONLY is described here`; `dashboard/src/lib/y.test.ts` holding
 * `expect(get('LU_TEST_ONLY'))`, the shape `env-file.test.ts` has for the Liquid
 * keys; and `config/scripts/build/alpha.sh` holding
 * `resolve_image_settings "ALPHA"` and `config/scripts/build/gamma.sh` holding
 * `resolve_image_settings "GAMMA"`, the shape `liquid.sh` had with `NIFI`.
 * `LU_PREFIX` is a prefix of `LU_PREFIX_LONGER` on purpose, and the names start
 * with `LU_` so no key of the stack's can be one of them by accident. The
 * retired setting is `NIFI_SYSTEM_DEPENDENCIES=ffmpeg`, and a mode moved away from
 * its default, `NIFI_POST_INSTALLATION_COMMANDS_MODE=override`; against them, the
 * four lines a pre-rebrand .env carries untouched, both values empty and both
 * modes `add`, which change nothing and must not be warned about on every build.
 * Each is handed to `warn_retired_prefix` from
 * `config/scripts/build/lib/dockerfile-render.sh` in a bash that sources it.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const ROOTS = ['config', 'scripts', 'dashboard/src', 'compose.yml', 'run.sh'];
const COMPOSED = /^([A-Z0-9_]+?)_(?:SYSTEM_DEPENDENCIES|POST_INSTALLATION_COMMANDS)(?:_MODE)?$/;
// A comment line in the file's own syntax: `#` for scripts, templates and YAML,
// `//`, `*` and `/*` for TypeScript and JavaScript.
const commentLines = (f: string) => (/\.[jt]s$/.test(f) ? /^[ \t]*(\/\/|\*|\/\*).*$/gm : /^[ \t]*#.*$/gm);

function unreadKeys(root: string, files: string[]): string[] {
  const keys = readFileSync(join(root, '.env.example'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter((k): k is string => !!k);
  const texts = files
    .filter((f) => !f.endsWith('.md') && !/\.(test|spec)\.[jt]s$/.test(f) && f !== '.env.example')
    .map((f) => [f, readFileSync(join(root, f), 'utf8').replace(commentLines(f), '')] as const);
  const prefixes = new Set(
    texts
      .filter(([f]) => f.startsWith('config/scripts/build/'))
      .flatMap(([, t]) => [...t.matchAll(/resolve_image_settings\s+"([A-Z0-9_]+)"/g)].map((m) => m[1]))
  );
  return keys.filter((k) => {
    const composed = k.match(COMPOSED);
    if (composed && prefixes.has(composed[1])) return false;
    const whole = new RegExp(`(?<![A-Z0-9_])${k}(?![A-Z0-9_])`);
    return !texts.some(([, t]) => whole.test(t));
  });
}

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p)];
  });
}

const fixture = mkdtempSync(join(tmpdir(), 'lu-oc79-'));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('OC-79 every key .env.example declares is read by something', () => {
  test('OC-79 none in the tree is unread', () => {
    const tracked = sh(['git', 'ls-files', ...ROOTS], repoRoot);
    expect(tracked.code).toBe(0);
    const files = tracked.stdout.split('\n').filter((f) => f && statSync(join(repoRoot, f)).isFile());
    expect(files.length).toBeGreaterThan(50);
    expect(unreadKeys(repoRoot, files)).toEqual([]);
  });

  test('OC-79 the negative and its counterpart: the five unread keys are found, the read ones are not', () => {
    const put = (path: string, text: string) => {
      mkdirSync(join(fixture, path, '..'), { recursive: true });
      writeFileSync(join(fixture, path), text);
    };
    put(
      '.env.example',
      [
        'LU_READ_KEY=', 'LU_DASH_KEY=', 'LU_COMMENT_ONLY=', 'LU_DOC_ONLY=', 'LU_TEST_ONLY=', 'LU_PREFIX=', 'LU_PREFIX_LONGER=',
        'ALPHA_SYSTEM_DEPENDENCIES=', 'ALPHA_POST_INSTALLATION_COMMANDS_MODE=', 'BETA_SYSTEM_DEPENDENCIES='
      ].join('\n') + '\n'
    );
    put('config/x/templates/env_template', 'LU_READ_KEY=\nLU_PREFIX_LONGER=\n');
    put('dashboard/src/lib/x.ts', 'const v = env.LU_DASH_KEY;\n');
    put('config/x/start.sh', '# LU_COMMENT_ONLY is not read here\n');
    put('config/x/notes.md', 'LU_DOC_ONLY is described here\n');
    put('dashboard/src/lib/y.test.ts', "expect(get('LU_TEST_ONLY'));\n");
    put('config/scripts/build/alpha.sh', 'resolve_image_settings "ALPHA"\n');
    put('config/scripts/build/gamma.sh', 'resolve_image_settings "GAMMA"\n');
    expect(unreadKeys(fixture, walk(fixture))).toEqual([
      'LU_COMMENT_ONLY',
      'LU_DOC_ONLY',
      'LU_TEST_ONLY',
      'LU_PREFIX',
      'BETA_SYSTEM_DEPENDENCIES'
    ]);
  });
});

describe('OC-79 an .env that still sets the retired NIFI_* settings is told', () => {
  const renderer = join(repoRoot, 'config/scripts/build/lib/dockerfile-render.sh');
  const warn = (env: Record<string, string>) =>
    sh(['bash', '-c', 'source "$1" && warn_retired_prefix NIFI LIQUID', '_', renderer], repoRoot, env);

  test('OC-79 the negative: NIFI_SYSTEM_DEPENDENCIES set, and the build names the key it reads now', () => {
    const r = warn({ NIFI_SYSTEM_DEPENDENCIES: 'ffmpeg' });
    expect({ code: r.code, said: r.stderr.includes('NIFI_SYSTEM_DEPENDENCIES is set and no longer read; this image reads LIQUID_SYSTEM_DEPENDENCIES') })
      .toEqual({ code: 0, said: true });
  });

  test('OC-79 and a mode set away from its default is said too', () => {
    const r = warn({ NIFI_POST_INSTALLATION_COMMANDS_MODE: 'override' });
    expect(r.stderr).toContain('NIFI_POST_INSTALLATION_COMMANDS_MODE is set and no longer read');
  });

  test('OC-79 the counterpart: the defaults a pre-rebrand .env carries, and nothing is said', () => {
    const r = warn({
      NIFI_SYSTEM_DEPENDENCIES: '',
      NIFI_SYSTEM_DEPENDENCIES_MODE: 'add',
      NIFI_POST_INSTALLATION_COMMANDS: '',
      NIFI_POST_INSTALLATION_COMMANDS_MODE: 'add'
    });
    expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: '' });
  });

  test('OC-79 and liquid.sh asks before it resolves, under the prefix .env.example declares', () => {
    const script = readFileSync(join(repoRoot, 'config/scripts/build/liquid.sh'), 'utf8');
    const asks = script.indexOf('warn_retired_prefix "NIFI" "LIQUID"');
    const resolves = script.indexOf('resolve_image_settings "LIQUID"');
    expect({ asks: asks > -1, before: resolves > asks }).toEqual({ asks: true, before: true });
  });
});
