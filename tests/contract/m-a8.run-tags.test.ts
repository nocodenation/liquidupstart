/**
 * A8-36 · Contract · No test removes an image under a fixed tag
 *
 * Purpose:  `m-oc.allow-scripts` built its two images as `lu-oc15-with` and
 *           `lu-oc16-without` and its `afterAll` ran `docker rmi -f` on both, so a
 *           second checkout running OC-15 and OC-16 removed whichever images held
 *           those tags, its own or the first checkout's. `A8-34` holds the same
 *           rule for container names and left the tags to #42, which changed that
 *           file and merged with them as they were. Recorded on #45 as part of
 *           `45-1`. Removal is what touches another run's object, so removal is
 *           what this reads: a fixed tag that is only built moves a tag and removes
 *           nothing, and `m-a8.toolbox-start-path` builds the product's own tag on
 *           purpose, when it is absent, and never removes it.
 * Given:    Every `*.test.ts` under tests/, and a fixture tree of its own.
 * When:     Each file's code, comment lines blanked, is searched as one text for an
 *           image removal, `'rmi'` or `'image', 'rm'` in an argument list or
 *           `docker rmi` and `docker image rm` in a command line handed to a
 *           shell after `-c`, and each tag it
 *           names is resolved: a literal in any of the three quotes, wrapped onto
 *           the next line or not; a constant holding one; or the variable of a
 *           `for (const x of [...])` around the removal, or of a constant holding
 *           such an array, through every literal and constant in it; in a command
 *           line, every operand that is no flag and expands nothing.
 * Then:     None in the tree; in the fixture, exactly the thirteen fixed tags, and
 *           none of the computed ones, the spread, the member or the build.
 * Covers:   A8-36
 * Negative: the fixture's thirteen fixed tags are found, so a search that matched
 *           nothing cannot pass the tree.
 * Counterpart: the fixture's `throwawayTag('lu-x')`, `` `lu-x-${RUN_ID}` ``, a
 *           constant and a loop array holding computed tags, `...left`, `OLD.tag`,
 *           a fixed tag that is only built, and a removal command that is only an
 *           expected output, are not; so a search that matched every `rmi`
 *           cannot pass either.
 *
 * Test data: the fixture `integration/m-zz.tags.test.ts`, whose lines are a header
 * line naming `'rmi', '-f', 'lu-prose'`, which is prose and must not count;
 * `sh(['docker', 'rmi', '-f', 'lu-fixed-tag']);`; `sh(['docker', 'image', 'rm',
 * 'lu-image-rm']);`; `const KEPT = 'lu-kept-tag';` with `'rmi', '-f', KEPT`;
 * `for (const tag of ['lu-loop-a', 'lu-loop-b']) {` with `'rmi', '-f', tag` in its
 * body, which is the shape `m-oc.allow-scripts` had; `docker rmi -f lu-shell-tag`
 * in a `bash -c` line; `'rmi', '-f',` with `'lu-wrap-tag']);` on the next line;
 * `` 'rmi', `lu-tick-tag` ``; `const PAIR = ['lu-pair-a', 'lu-pair-b'];` walked by
 * a loop without braces whose `'rmi', '-f', p` is wrapped onto the next line, the
 * same defect one refactor away; `docker rmi -f "$A" lu-second-tag`, a fixed tag
 * after a variable one; `docker image rm lu-combined-flag` handed over by
 * `bash -ec`; and `const $kept: string = 'lu-dollar-typed';` with `'rmi', '-f',
 * $kept`. On the other side: `throwawayTag('lu-x')`,
 * `` `lu-x-${RUN_ID}` ``, `const RAN = throwawayTag('lu-ran');` with `'rmi', '-f',
 * RAN`, a loop over `[WITH_RUN, throwawayTag('lu-y')]` where `WITH_RUN` is
 * `throwawayTag('lu-w')`, a loop over `const RUNS = [throwawayTag('lu-z')];`,
 * `docker rmi -f "$A" "${B}"`, `docker rmi -f $(docker images -q --filter
 * label=lu-test-run=x)`, `...left`, `OLD.tag`, `sh(['docker', 'build', '-t',
 * 'lu-built-only', ctx]);`, and `expect(out).toContain('docker image rm -f
 * lu-said-only');`, the shape `m-a8.toolbox-tools` has for the remedy the
 * product prints. Not read: tests/lib, whose helpers are where the
 * computed tags come from, and tests/verify, which holds hand-run scripts. This
 * file carries those lines and is excluded from the tree by name.
 *
 * Limits, stated: a tag handed to a helper in another file, or built from a
 * function's parameter, is not followed; tests/lib's helpers take computed tags.
 * And a computed tag is not judged: `m-b5.image-moved` named its images by a hash
 * of their recipe, the same in every checkout, and removed them after, which is
 * this defect without a literal in sight. The local review of #49 found it, and
 * it carries the run's id since; the scan judges what a file writes.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';

const SELF = 'm-a8.run-tags.test.ts';
const REMOVAL = /['"](?:rmi|image['"]\s*,\s*['"]rm)['"]/g;
// A command line is read where a shell is handed it, after `-c`: the same words
// in an expected output, `expect(out).toContain('docker image rm -f …')`, are a
// remedy the product prints, not a removal the test runs.
const SHELL_LINE = /['"]-[a-z]*c['"]\s*,\s*(['"`])([\s\S]*?)\1/g;
// What follows the command word up to the end of that command; every operand that
// is no flag and expands nothing is a tag written into the line.
const IN_COMMAND = /docker\s+(?:rmi|image\s+rm)\b([^;&|\n]*)/g;
const OPERAND = /^(["']?)([a-z][\w.:/-]*)\1$/;
const LITERAL = /^(['"`])([^'"`$]*)\1$/;
const escaped = (id: string) => id.replace(/\$/g, '\\$');
const CONSTANT = (id: string) =>
  new RegExp(`(?<![\\w$])const ${escaped(id)}(?:\\s*:\\s*[\\w<>\\[\\]| ]+?)?\\s*=\\s*(['"\`])([^'"\`$]*)\\1\\s*;`);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const QUOTES = `'"\``;

// The index of the quote that closes the one at `open`.
function quoteEnd(code: string, open: number): number {
  let i = open + 1;
  for (; i < code.length && code[i] !== code[open]; i++) if (code[i] === '\\') i++;
  return i;
}

// The index just past whatever closes the bracket at `open`, quotes respected.
function closing(code: string, open: number): number {
  const pairs: Record<string, string> = { '[': ']', '(': ')', '{': '}' };
  const stack: string[] = [];
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (QUOTES.includes(c)) i = quoteEnd(code, i);
    else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i + 1;
    }
  }
  return code.length;
}

// The items of an argument list from `from` to the `]` that closes it, split at
// its own commas.
function itemsFrom(code: string, from: number): Array<[number, string]> {
  const items: Array<[number, string]> = [];
  let start = from;
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (QUOTES.includes(c)) i = quoteEnd(code, i);
    else if ('[({'.includes(c)) i = closing(code, i) - 1;
    else if (c === ',' || c === ']') {
      const raw = code.slice(start, i);
      const lead = raw.length - raw.trimStart().length;
      if (raw.trim()) items.push([start + lead, raw.trim()]);
      if (c === ']') break;
      start = i + 1;
    }
  }
  return items;
}

function fixedTags(code: string, item: string, at: number): string[] {
  const lit = item.match(LITERAL);
  if (lit) return lit[2].startsWith('-') ? [] : [lit[2]];
  if (!IDENTIFIER.test(item)) return [];
  const constant = code.match(CONSTANT(item));
  if (constant) return [constant[2]];
  // The variable of a loop around the removal, through the array it walks: one
  // written in the loop's head, or a constant holding one.
  const loops = [...code.slice(0, at).matchAll(new RegExp(`for\\s*\\(\\s*const\\s+${escaped(item)}\\s+of\\s+(\\[|[A-Za-z_$][\\w$]*\\s*\\))`, 'g'))];
  const loop = loops.pop();
  if (!loop) return [];
  let open = loop.index! + loop[0].length - 1;
  if (loop[1] !== '[') {
    const named = code.match(new RegExp(`(?<![\\w$])const ${escaped(loop[1].replace(/[\s)]/g, ''))}\\s*=\\s*\\[`));
    if (!named) return [];
    open = named.index! + named[0].length - 1;
  }
  const headEnd = closing(code, code.indexOf('(', loop.index!));
  const next = code.slice(headEnd).search(/\S/);
  // A body without braces is one statement, which may be wrapped onto the next line.
  const bodyEnd = code[headEnd + next] === '{' ? closing(code, headEnd + next) : code.indexOf(';', headEnd);
  if (at > bodyEnd) return [];
  return itemsFrom(code, open + 1).flatMap(([, el]) => {
    const l = el.match(LITERAL);
    if (l) return [l[2]];
    const c = IDENTIFIER.test(el) ? code.match(CONSTANT(el)) : null;
    return c ? [c[2]] : [];
  });
}

function fixedRemovals(testsDir: string): string[] {
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
      // Comment lines blanked, not dropped, so an offset still maps to its line,
      // and searched as one text, as A8-34 does.
      const code = body.replace(/^[ \t]*(\*|\/\/|\/\*).*$/gm, '');
      const lineOf = (at: number) => code.slice(0, at).split('\n').length;
      const hits: Array<[number, string]> = [];
      for (const m of code.matchAll(REMOVAL)) {
        const rest = m.index! + m[0].length;
        for (const [at, item] of itemsFrom(code, code[rest] === ',' ? rest + 1 : rest)) {
          for (const tag of fixedTags(code, item, at)) hits.push([lineOf(at), tag]);
        }
      }
      for (const line of code.matchAll(SHELL_LINE)) {
        for (const m of line[2].matchAll(IN_COMMAND)) {
          // A substitution computes its words, so they are no operands of this command.
          for (const word of m[1].replace(/\$\([^)]*\)|`[^`]*`/g, ' ').trim().split(/\s+/)) {
            const operand = word.match(OPERAND);
            if (operand) hits.push([lineOf(line.index!), operand[2]]);
          }
        }
      }
      hits.sort((x, y) => x[0] - y[0]).forEach(([line, t]) => found.push(`${tier}/${name}:${line} ${t}`));
    }
  }
  return found;
}

const fixture = mkdtempSync(join(tmpdir(), 'lu-a8-36-'));
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('A8-36 no image a test removes is named by a fixed tag', () => {
  test('A8-36 none in the tree is a fixed tag', () => {
    expect(existsSync(join(repoRoot, 'tests', 'component', 'm-oc.allow-scripts.test.ts'))).toBe(true);
    expect(fixedRemovals(join(repoRoot, 'tests')).join('\n')).toBe('');
  });

  test('A8-36 the negative and its counterpart: fixed tags are found, computed ones and prose are not', () => {
    mkdirSync(join(fixture, 'integration'));
    writeFileSync(
      join(fixture, 'integration', 'm-zz.tags.test.ts'),
      [
        " * a header naming 'rmi', '-f', 'lu-prose'",
        "sh(['docker', 'rmi', '-f', 'lu-fixed-tag']);",
        "sh(['docker', 'image', 'rm', 'lu-image-rm']);",
        "const KEPT = 'lu-kept-tag';",
        "sh(['docker', 'rmi', '-f', KEPT]);",
        "for (const tag of ['lu-loop-a', 'lu-loop-b']) {",
        "  sh(['docker', 'rmi', '-f', tag]);",
        '}',
        "sh(['bash', '-c', 'docker rmi -f lu-shell-tag']);",
        "sh(['docker', 'rmi', '-f',",
        "  'lu-wrap-tag']);",
        "sh(['docker', 'rmi', `lu-tick-tag`]);",
        "const PAIR = ['lu-pair-a', 'lu-pair-b'];",
        "for (const p of PAIR)",
        "  sh(['docker', 'rmi', '-f', p]);",
        `sh(['bash', '-c', 'docker rmi -f "$A" lu-second-tag']);`,
        "const RUNS = [throwawayTag('lu-z')];",
        "for (const q of RUNS) sh(['docker', 'rmi', '-f', q]);",
        `sh(['bash', '-c', 'docker rmi -f "$A" "\${B}"']);`,
        "sh(['bash', '-c', 'docker rmi -f $(docker images -q --filter label=lu-test-run=x)']);",
        "const $kept: string = 'lu-dollar-typed';",
        "sh(['bash', '-ec', 'docker image rm lu-combined-flag']);",
        "sh(['docker', 'rmi', '-f', $kept]);",
        "sh(['docker', 'rmi', '-f', throwawayTag('lu-x')]);",
        "sh(['docker', 'rmi', '-f', `lu-x-${RUN_ID}`]);",
        "const RAN = throwawayTag('lu-ran');",
        "sh(['docker', 'rmi', '-f', RAN]);",
        "const WITH_RUN = throwawayTag('lu-w');",
        "for (const t of [WITH_RUN, throwawayTag('lu-y')]) sh(['docker', 'rmi', '-f', t]);",
        "sh(['docker', 'rmi', '-f', ...left]);",
        "sh(['docker', 'rmi', '-f', OLD.tag]);",
        "sh(['docker', 'build', '-t', 'lu-built-only', ctx]);",
        "expect(out).toContain('docker image rm -f lu-said-only');"
      ].join('\n')
    );
    expect(fixedRemovals(fixture)).toEqual([
      'integration/m-zz.tags.test.ts:2 lu-fixed-tag',
      'integration/m-zz.tags.test.ts:3 lu-image-rm',
      'integration/m-zz.tags.test.ts:5 lu-kept-tag',
      'integration/m-zz.tags.test.ts:7 lu-loop-a',
      'integration/m-zz.tags.test.ts:7 lu-loop-b',
      'integration/m-zz.tags.test.ts:9 lu-shell-tag',
      'integration/m-zz.tags.test.ts:11 lu-wrap-tag',
      'integration/m-zz.tags.test.ts:12 lu-tick-tag',
      'integration/m-zz.tags.test.ts:15 lu-pair-a',
      'integration/m-zz.tags.test.ts:15 lu-pair-b',
      'integration/m-zz.tags.test.ts:16 lu-second-tag',
      'integration/m-zz.tags.test.ts:22 lu-combined-flag',
      'integration/m-zz.tags.test.ts:23 lu-dollar-typed'
    ]);
  });
});
