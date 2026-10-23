/**
 * A8-34 · Contract · No test starts a container under a name another run could use
 *
 * Purpose:  `A2` of the 2026-10-01 review measured two checkouts destroying each
 *           other's fixtures through fixed container names, and the default and
 *           integration tiers moved to `containerName()` and `fixtureLabels()`.
 *           The system tier did not: `m-b5.hand-drop` removed and started
 *           `lu-b5-live` and `lu-b5-boot` by name, inside a half-hour `beforeAll`,
 *           so a second checkout running it removed the first one's Liquid and the
 *           failure read as a NAR loader timeout. Found by a local review on
 *           2026-10-20 and recorded on #45. Nothing stopped the next one, because
 *           the rule was a convention to remember; this is it computed.
 * Given:    Every `*.test.ts` under tests/, and a fixture tree of its own.
 * When:     Each code line is searched for a container name written into the
 *           file: `'--name', 'x'` or a backtick literal in an argument list;
 *           `--name x`, `--name "x"`, `--name 'x'` or `--name=x` in a command line;
 *           or `'--name', X` where the file has `const X = 'x'`.
 * Then:     None in the tree; in the fixture, exactly the seven fixed names, and
 *           none of the three names a run computes.
 * Covers:   A8-34
 * Negative: the fixture's seven fixed names are found, so a search that matched
 *           nothing cannot pass the tree.
 * Counterpart: the fixture's `containerName('lu-x')` and `` `lu-x-${RUN_ID}` ``
 *           are not, so a search that matched every `--name` cannot either.
 *
 * Test data: the fixture `integration/m-zz.names.test.ts`, whose code lines are `sh(['docker', 'run', '--name', 'lu-fixed', IMAGE]);`,
 * `` sh(['sh', '-c', `docker run --name lu-shell ${IMAGE}`]); ``,
 * `sh(['docker', 'run', '--name', containerName('lu-x'), IMAGE]);`,
 * `` sh(['docker', 'run', '--name', `lu-x-${RUN_ID}`, IMAGE]); ``, `const KEPT =
 * 'lu-kept';` with `'--name', KEPT`, and `const RAN = containerName('lu-ran');`
 * with `'--name', RAN`; the command lines `docker run --name "lu-dq" img`,
 * `docker run --name 'lu-sq' img` and `docker run --name=lu-eq img`; and
 * `` '--name', `lu-tick` `` -- and a header line naming `'--name', 'lu-prose'`, which
 * is prose and must not count. Not read: tests/lib, whose helpers are where the
 * computed names come from, and tests/verify, which holds hand-run scripts.
 * This file carries those lines and is excluded from the tree by name.
 * The image tags `m-oc.allow-scripts` fixes are left to #42, which changes that
 * file; this holds container names.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';

// This file carries such names as its fixture, so it is excluded by name rather
// than by a construction that would hide the exception from a reader.
const SELF = 'm-a8.run-names.test.ts';
const QUOTED = /['"]--name['"]\s*,\s*(['"`])([^'"`$]*)\1/g;
const IN_COMMAND = /--name(?:\s+|=)(["']?)([a-z][\w.-]*)\1(?=[\s'"`]|$)/g;
// And a constant holding one: `const LIVE = 'lu-b5-live'` and then `'--name', LIVE`
// is the same fixed name one line removed.
const BY_NAME = /['"]--name['"]\s*,\s*([A-Za-z_$][\w$]*)\s*[,\]]/g;
const CONSTANT = (id: string) => new RegExp(`\\bconst ${id}\\s*=\\s*(['"])([^'"]*)\\1`);

function fixedNames(testsDir: string): string[] {
  const found: string[] = [];
  for (const tier of readdirSync(testsDir)) {
    const dir = join(testsDir, tier);
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => n.endsWith('.test.ts') && n !== SELF);
    } catch {
      continue;
    }
    for (const name of names) {
      const body = readFileSync(join(dir, name), 'utf8');
      body.split('\n').forEach((line, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
        for (const m of line.matchAll(QUOTED)) found.push(`${tier}/${name}:${i + 1} ${m[2]}`);
        for (const m of line.matchAll(IN_COMMAND)) found.push(`${tier}/${name}:${i + 1} ${m[2]}`);
        for (const m of line.matchAll(BY_NAME)) {
          const c = body.match(CONSTANT(m[1]));
          if (c) found.push(`${tier}/${name}:${i + 1} ${c[2]}`);
        }
      });
    }
  }
  return found;
}

const fixture = mkdtempSync(join(tmpdir(), 'lu-a8-34-'));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('A8-34 every container a test starts carries a name of its run', () => {
  test('A8-34 none in the tree is a fixed name', () => {
    expect(existsSync(join(repoRoot, 'tests', 'system', 'm-b5.hand-drop.test.ts'))).toBe(true);
    expect(fixedNames(join(repoRoot, 'tests')).join('\n')).toBe('');
  });

  test('A8-34 the negative and its counterpart: fixed names are found, computed ones and prose are not', () => {
    mkdirSync(join(fixture, 'integration'));
    writeFileSync(
      join(fixture, 'integration', 'm-zz.names.test.ts'),
      [
        " * a header naming '--name', 'lu-prose'",
        "sh(['docker', 'run', '--name', 'lu-fixed', IMAGE]);",
        'sh([\'sh\', \'-c\', `docker run --name lu-shell ${IMAGE}`]);',
        "sh(['docker', 'run', '--name', containerName('lu-x'), IMAGE]);",
        "sh(['docker', 'run', '--name', `lu-x-${RUN_ID}`, IMAGE]);",
        "const KEPT = 'lu-kept';",
        "sh(['docker', 'run', '--name', KEPT, IMAGE]);",
        "const RAN = containerName('lu-ran');",
        "sh(['docker', 'run', '--name', RAN, IMAGE]);",
        `sh(['bash', '-c', 'docker run --name "lu-dq" img']);`,
        `sh(['bash', '-c', "docker run --name 'lu-sq' img"]);`,
        "sh(['bash', '-c', 'docker run --name=lu-eq img']);",
        "sh(['docker', 'run', '--name', `lu-tick`, IMAGE]);"
      ].join('\n')
    );
    expect(fixedNames(fixture)).toEqual([
      'integration/m-zz.names.test.ts:2 lu-fixed',
      'integration/m-zz.names.test.ts:3 lu-shell',
      'integration/m-zz.names.test.ts:7 lu-kept',
      'integration/m-zz.names.test.ts:10 lu-dq',
      'integration/m-zz.names.test.ts:11 lu-sq',
      'integration/m-zz.names.test.ts:12 lu-eq',
      'integration/m-zz.names.test.ts:13 lu-tick'
    ]);
  });
});
