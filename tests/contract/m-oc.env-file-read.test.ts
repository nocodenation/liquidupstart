/**
 * OC-80 · Contract · A build reads .env as compose does, and keeps a command as written
 *
 * Purpose:  #5 replaced `source .env` in the Liquid, OpenCode and privacy-proxy
 *           builds with `load_env_file` in config/scripts/build/lib/dockerfile-render.sh,
 *           which kept a quoted value's comment: `.env.example` writes
 *           `LIQUID_SYSTEM_DEPENDENCIES_MODE="add" # add | override`, the value read
 *           was `"add" # add | override`, every build warned that the mode was
 *           unrecognized, and a mode set to `override` fell back to `add`. Compose
 *           reads the same line as `add`, so the build and the stack disagreed about
 *           one file. Found on 2026-10-27, the day #5 merged; the operator chose to
 *           repair it on #52. The same file trimmed packages and commands with
 *           `xargs`, which took the quotes out of a command, so `sh -c 'a && b'`
 *           was rendered as `sh -c a && b`, and choked on a lone quote in a mode;
 *           and it handed the commands to awk with `-v`, which turned `\.` in a
 *           sed command into `.` and split a `\n` across two lines.
 * Given:    dockerfile-render.sh, sourced in bash, and a fixture .env holding
 *           the twenty shapes compose was measured on: the ones `.env.example`
 *           and the dashboard's `formatValue` write, and their edges.
 * When:     `load_env_file` reads the fixture; `resolve_image_settings LIQUID`
 *           runs after it with an override set behind a comment, and with the
 *           default `add`; `resolve_setting` is handed a mode with a lone quote;
 *           and `render_dockerfile` renders a template with a command that quotes,
 *           and packages written with spaces.
 * Then:     Each value is what `docker compose config` gave for the same line,
 *           and `${VAR}` and `\n`, which compose expands and the `source .env`
 *           #5 replaced did not, are deliberately not among them;
 *           the override takes, and neither run warns; the lone quote is named as
 *           an unrecognized mode, with no `xargs` error; commands with quotes and
 *           backslashes are rendered as written, and the packages as a plain list.
 * Covers:   OC-80, CLAUDE.md's `.env.example` contract
 * Negative: no comment is part of a value, the first ` #` ending an unquoted one;
 *           whitespace around a value goes, tabs too; an escaped quote is a
 *           quote and an escaped backslash a backslash, a last one included; a
 *           trailing `=` stays; an override
 *           behind a comment overrides; a command keeps its quotes and its
 *           backslashes; a lone quote draws the warning the mode check promises,
 *           not a tool's error.
 * Counterpart: a `#` inside quotes, one with no whitespace before it, and one
 *           after a tab stay in the value, so a parser that cut at every `#`
 *           cannot pass; a backslash that escapes nothing stays; `add` still adds;
 *           packages are still trimmed and joined.
 *
 * Test data: the fixture .env, with compose's reading of each line, measured
 * with docker compose 5.6.1 on 2026-10-27: `QUOTED_COMMENT="add" # add | override`
 * is `add`; `SINGLE_COMMENT='override' # add | override` is `override`;
 * `HASH_INSIDE="a # b"` is `a # b`; `UNQUOTED_COMMENT=plain # trailing` is
 * `plain`; `UNQUOTED_HASH=pa#ss` is `pa#ss`; `QUOTE_IN_COMMENT="x" # say "hi"` is
 * `x`; `EMPTY=` is empty; `TWO_COMMENTS=a # b # c` is `a`; `LEAD=  lead` is
 * `lead`; `TRAIL=trail` with three trailing spaces is `trail`; `SPACED_QUOTE= "q"`
 * is `q`; `ESCAPED="a\"b"` is `a"b`; `ESCAPED_HASH="x\" # y" # c` is `x" # y`,
 * the line the dashboard writes for the value `x" # y` beside a comment;
 * `BACKSLASH="c:\path"` is `c:\path`; `TAB_HASH=x`, a tab, `#tab` is all of it;
 * `PADDED=b=` is `b=`, base64's padding; `DOUBLE_BACKSLASH="a\\b"` is `a\b`;
 * `TRAILING_BACKSLASH="a\\"` is `a\`; `TAB_LEAD=`, a tab, `"x"` is `x`; and
 * `TAB_TRAIL=x` and a tab is `x`.
 * The settings: `SYSTEM_DEPENDENCIES="git"`,
 * `LIQUID_SYSTEM_DEPENDENCIES="curl"` and `LIQUID_SYSTEM_DEPENDENCIES_MODE` set to
 * `"override" # add | override`, then to `"add" # add | override`. The lone
 * quote is `don't`. The template is `RUN apt-get install -y __SYSTEM_DEPENDENCIES__`
 * above `# POST_INSTALL_COMMANDS`, rendered with
 * `POST_INSTALLATION_COMMANDS` holding `sed -i 's/\./_/' /f`, `printf 'a\nb' > /g`
 * and `sh -c 'echo a && echo b'`, comma-separated as the setting is, and
 * `SYSTEM_DEPENDENCIES=" git ,  curl "`.
 *
 * Dependencies: bun and bash. No docker: compose's reading is the measured data.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const renderer = join(repoRoot, 'config/scripts/build/lib/dockerfile-render.sh');
const work = mkdtempSync(join(tmpdir(), 'lu-oc80-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

// A bash that sources the renderer and runs `script`, with `$1` the file named.
const run = (script: string, file = '', env: Record<string, string> = {}) =>
  sh(['bash', '-c', `source "$0" && ${script}`, renderer, file], repoRoot, env);

const COMPOSE_READS: Array<[string, string, string]> = [
  ['QUOTED_COMMENT', '"add" # add | override', 'add'],
  ['SINGLE_COMMENT', "'override' # add | override", 'override'],
  ['HASH_INSIDE', '"a # b"', 'a # b'],
  ['UNQUOTED_COMMENT', 'plain # trailing', 'plain'],
  ['UNQUOTED_HASH', 'pa#ss', 'pa#ss'],
  ['QUOTE_IN_COMMENT', '"x" # say "hi"', 'x'],
  ['EMPTY', '', ''],
  ['TWO_COMMENTS', 'a # b # c', 'a'],
  ['LEAD', '  lead', 'lead'],
  ['TRAIL', 'trail   ', 'trail'],
  ['SPACED_QUOTE', ' "q"', 'q'],
  ['ESCAPED', '"a\\"b"', 'a"b'],
  ['ESCAPED_HASH', '"x\\" # y" # c', 'x" # y'],
  ['BACKSLASH', '"c:\\path"', 'c:\\path'],
  ['TAB_HASH', 'x\t#tab', 'x\t#tab'],
  ['PADDED', 'b=', 'b='],
  ['DOUBLE_BACKSLASH', '"a\\\\b"', 'a\\b'],
  ['TRAILING_BACKSLASH', '"a\\\\"', 'a\\'],
  ['TAB_LEAD', '\t"x"', 'x'],
  ['TAB_TRAIL', 'x\t', 'x']
];
const expected = (k: string) => COMPOSE_READS.find(([n]) => n === k)![2];

describe('OC-80 load_env_file reads each line as compose does', () => {
  const env = join(work, 'shapes.env');
  writeFileSync(env, COMPOSE_READS.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  // One value per line, NUL-free and tab-safe: each is printed with its key.
  const r = run(
    `load_env_file "$1" && for k in ${COMPOSE_READS.map(([k]) => k).join(' ')}; do printf '%s=[%s]\\n' "$k" "\${!k}"; done`,
    env
  );
  const read = Object.fromEntries(
    [...r.stdout.matchAll(/^([A-Z_]+)=\[(.*)\]$/gm)].map((m) => [m[1], m[2]])
  );

  test('OC-80 the negative: no comment is part of a value', () => {
    expect(r.code).toBe(0);
    for (const k of ['QUOTED_COMMENT', 'SINGLE_COMMENT', 'UNQUOTED_COMMENT', 'QUOTE_IN_COMMENT', 'TWO_COMMENTS', 'ESCAPED_HASH']) {
      expect({ k, v: read[k] }).toEqual({ k, v: expected(k) });
    }
  });

  test('OC-80 the negative: whitespace around a value goes, escapes resolve, and a trailing = stays', () => {
    for (const k of ['LEAD', 'TRAIL', 'SPACED_QUOTE', 'TAB_LEAD', 'TAB_TRAIL', 'ESCAPED', 'DOUBLE_BACKSLASH', 'TRAILING_BACKSLASH', 'PADDED']) {
      expect({ k, v: read[k] }).toEqual({ k, v: expected(k) });
    }
  });

  test('OC-80 the counterpart: a # inside quotes, with no space before it, or after a tab, stays', () => {
    for (const k of ['HASH_INSIDE', 'UNQUOTED_HASH', 'TAB_HASH', 'BACKSLASH', 'EMPTY']) {
      expect({ k, v: read[k] }).toEqual({ k, v: expected(k) });
    }
  });
});

describe('OC-80 a mode set behind a comment takes effect, and draws no warning', () => {
  const settings = (mode: string) => {
    const env = join(work, `mode-${mode}.env`);
    writeFileSync(
      env,
      `SYSTEM_DEPENDENCIES="git"\nLIQUID_SYSTEM_DEPENDENCIES="curl"\nLIQUID_SYSTEM_DEPENDENCIES_MODE="${mode}" # add | override\n`
    );
    return run(`load_env_file "$1" && resolve_image_settings LIQUID && printf '%s' "$SYSTEM_DEPENDENCIES"`, env);
  };

  test('OC-80 the negative: override overrides', () => {
    const r = settings('override');
    expect({ code: r.code, deps: r.stdout, stderr: r.stderr }).toEqual({ code: 0, deps: 'curl', stderr: '' });
  });

  test('OC-80 the counterpart: add still adds', () => {
    const r = settings('add');
    expect({ code: r.code, deps: r.stdout, stderr: r.stderr }).toEqual({ code: 0, deps: 'git, curl', stderr: '' });
  });
});

describe('OC-80 nothing between the .env and the Dockerfile rewrites a value', () => {
  test('OC-80 the negative: a lone quote in a mode is named as unrecognized, with no xargs error', () => {
    const r = run(`resolve_setting "" "" "don't" X_MODE`);
    expect({ code: r.code, named: r.stderr.includes("unrecognized X_MODE value 'don't'"), xargs: r.stderr.includes('xargs') })
      .toEqual({ code: 0, named: true, xargs: false });
  });

  test('OC-80 the negative: commands that quote and escape are rendered as written', () => {
    const template = join(work, 'Dockerfile.template');
    const out = join(work, 'Dockerfile');
    writeFileSync(template, 'RUN apt-get install -y __SYSTEM_DEPENDENCIES__\n# POST_INSTALL_COMMANDS\n');
    const r = run(`render_dockerfile "$1" "${out}"`, template, {
      POST_INSTALLATION_COMMANDS: "sed -i 's/\\./_/' /f, printf 'a\\nb' > /g, sh -c 'echo a && echo b'",
      SYSTEM_DEPENDENCIES: ' git ,  curl '
    });
    expect(r.code).toBe(0);
    const rendered = readFileSync(out, 'utf8');
    expect(rendered).toContain("RUN sed -i 's/\\./_/' /f\n");
    expect(rendered).toContain("RUN printf 'a\\nb' > /g\n");
    expect(rendered).toContain("RUN sh -c 'echo a && echo b'");
    // The counterpart, in the same render: packages are still trimmed and joined.
    expect(rendered).toContain('RUN apt-get install -y git curl\n');
  });
});
