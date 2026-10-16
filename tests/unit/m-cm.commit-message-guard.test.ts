/**
 * M-CM · Unit · A commit message must not close what it only names
 *
 * Purpose:  On 2026-10-16 a documentation commit on `main` carried the line
 *           `both are merged and resolved: #18, where both sides appended an
 *           item`. It was prose about a pull request. GitHub read
 *           `resolved: #18` as an instruction and closed pull request #18 --
 *           four answered review rounds -- attributing the act to whoever
 *           pushed, so the timeline accused a person while the cause sat in a
 *           commit message nobody had reason to re-read. It took three wrong
 *           readings to find; the `closed` event had carried the commit id from
 *           the start.
 *
 *           `scripts/hooks/commit-msg` reads the message while it can still be
 *           changed. These cases are the ones that were run by hand before the
 *           hook was written, with the real message of `5aa5bc9` among them, so
 *           the guard is measured against the defect it exists for rather than
 *           against an invention.
 * Given:    `scripts/hooks/commit-msg`, invoked as git invokes it -- one
 *           argument, the path to a file holding the message
 * When:     it is handed the message that closed #18, the correction that
 *           followed it, each keyword and reference form GitHub honours, prose
 *           that names the same numbers without instructing anything, a comment
 *           line, text under the verbose-commit scissors, and the override
 * Then:     every form that would close something is refused with `rc=1` and
 *           the offending line is named; everything else passes with `rc=0`;
 *           and `ALLOW_CLOSING_KEYWORD=1` passes the refused message while
 *           saying on stderr that it did
 * Covers:   CM-1, CM-2, CM-3
 * Unhappy:  The refusals are the negative halves. Their counterparts are the
 *           ones that matter most here: a guard that refused every `#12` would
 *           pass all six negatives and make the repository's own prose
 *           uncommittable -- which is why CM-2 holds four shapes of text that
 *           name a number and must go through, including the word `resolved`
 *           used as ordinary English about a file.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const HOOK = join(repoRoot, 'scripts/hooks/commit-msg');

// The message that did the damage, kept verbatim as test data rather than
// paraphrased: the point of the case is that this exact sentence is prose.
const THE_REAL_ONE = [
  'docs: #10 and #25 merged, and two suites at once invent red',
  '',
  'Nine of ours are open. Exactly two conflicted with the new main, both only in',
  'BACKLOG.md, and both are merged and resolved: #18, where both sides appended an',
  'item under Open findings, and #19, where main appended next to the',
  'operator.admin section that #19 removes because it closes it.'
].join('\n');

function runHook(message: string, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lu-commit-msg-'));
  try {
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message.endsWith('\n') ? message : `${message}\n`);
    return sh([HOOK, file], repoRoot, env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('CM-1 a message that would close a reference is refused', () => {
  test('CM-1 the message that closed #18 is refused, and the line is named', () => {
    const r = runHook(THE_REAL_ONE);
    expect(r.code).toBe(1);
    // Named, not merely counted: the author has to see which line to change,
    // and this is the line.
    expect(r.output).toContain('resolved: #18');
    expect(r.output).toMatch(/^4:/m);
  });

  test.each([
    ['fixes, bare reference', 'fix: something\n\nfixes #19 in passing\n'],
    ['closes with a colon', 'fix: something\n\ncloses: #7\n'],
    ['uppercase resolve', 'fix: something\n\nRESOLVES #5 at last\n'],
    ['GH- form', 'fix: something\n\nClosed GH-7 with this\n'],
    ['owner/repo form', 'fix: something\n\nfixed nocodenation/liquidupstart#12\n'],
    ['issue URL', 'fix: something\n\ncloses https://github.com/nocodenation/liquidupstart/issues/7\n'],
    ['pull URL', 'fix: something\n\nresolve https://github.com/nocodenation/liquidupstart/pull/18\n']
  ])('CM-1 %s is refused', (_name, message) => {
    expect(runHook(message).code).toBe(1);
  });
});

describe('CM-2 text that names a reference without instructing anything passes', () => {
  test.each([
    [
      'the repository\'s own prose, including "resolved" about a file',
      'docs: something\n\nthe #18 conflict, answered on #19, resolved in BACKLOG.md\n'
    ],
    [
      'a bare reference with no keyword at all',
      'docs: something\n\nsee #18 and #19 for the rounds this answers\n'
    ],
    [
      'a keyword with a word between it and the number',
      'docs: something\n\nthis closes the gap #18 left open\n'
    ],
    [
      'the correction that followed the incident',
      'docs: a commit message took #18 to CLOSED, and the word that did it\n\nIts message put the word "resolved", with a colon after it, directly in front\nof the reference to that pull request.\n'
    ]
  ])('CM-2 %s passes', (_name, message) => {
    const r = runHook(message);
    expect(r.code, r.output).toBe(0);
  });

  test('CM-2 a comment line carrying the pattern passes, because git strips it', () => {
    const r = runHook('docs: something\n\n# resolved: #18 -- git removes this line\n');
    expect(r.code, r.output).toBe(0);
  });

  test('CM-2 text under the scissors passes, because the forge never sees it', () => {
    const r = runHook(
      [
        'docs: something',
        '',
        'An ordinary body.',
        '',
        '------------------------ >8 ------------------------',
        'Do not modify or remove the line above.',
        'Everything below it will be ignored.',
        'resolved: #18',
        ''
      ].join('\n')
    );
    expect(r.code, r.output).toBe(0);
  });
});

describe('CM-3 closing an issue on purpose is possible, and is not silent', () => {
  test('CM-3 ALLOW_CLOSING_KEYWORD=1 passes the refused message and says so', () => {
    const r = runHook(THE_REAL_ONE, { ALLOW_CLOSING_KEYWORD: '1' });
    expect(r.code, r.output).toBe(0);
    expect(r.output).toContain('ALLOW_CLOSING_KEYWORD=1');
    expect(r.output).toContain('resolved: #18');
  });

  test('CM-3 any other value of the override does not pass it', () => {
    expect(runHook(THE_REAL_ONE, { ALLOW_CLOSING_KEYWORD: 'yes' }).code).toBe(1);
  });

  test('CM-3 the tracked hook is executable, so a fresh clone can run it', () => {
    expect(statSync(HOOK).mode & 0o111).toBeGreaterThan(0);
  });
});
