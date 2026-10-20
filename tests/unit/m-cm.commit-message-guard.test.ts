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
 *           `config/agents/hooks/commit-msg` reads the message while it can still be
 *           changed. These cases are the ones that were run by hand before the
 *           hook was written, with the real message of `5aa5bc9` among them --
 *           **whole**, which it was not until 2026-10-20 -- so the guard is
 *           measured against the defect it exists for rather than against an
 *           invention.
 *
 *           **What this file cannot see, and where that is covered.** It hands
 *           the hook a file, so it cannot see which lines git will *store* nor
 *           whether git will run the hook at all. Both were wrong, and both
 *           ended with the guard silently off: `-m` and `-F` store `#` lines,
 *           and the installed path lived in a checkout. `CM-4` and `CM-5` in
 *           `tests/integration/m-cm.guard-installed.test.ts` run the installer
 *           and `git commit` in a throwaway clone; `CM-6` in
 *           `tests/contract/m-a4.hooks-path.test.ts` holds the copy the stack's
 *           agents get.
 * Given:    `config/agents/hooks/commit-msg`, invoked as git invokes it -- one
 *           argument, the path to a file holding the message
 * When:     it is handed the message that closed #18, the correction that
 *           followed it, each keyword and reference form GitHub honours, prose
 *           that names the same numbers without instructing anything, a comment
 *           line, text under the verbose-commit scissors, and the override
 * Then:     every form that would close something is refused with `rc=1` and
 *           the offending line is named; everything else passes with `rc=0`;
 *           and `ALLOW_CLOSING_KEYWORD=1` passes the refused message while
 *           saying on stderr that it did
 * Covers:   CM-1, CM-2, CM-3, CM-7
 * Unhappy:  The refusals are the negative halves -- **thirteen** of them in CM-1
 *           as of 2026-10-20, counted rather than recalled: the header said
 *           "six" while there were eight, and then more arrived. Their
 *           counterparts are the ones that matter most here: a guard that
 *           refused every `#12` would pass every negative and make the
 *           repository's own prose uncommittable -- which is why CM-2 holds
 *           **ten** shapes that name a number and must go through, including the
 *           word `resolved` used as ordinary English about a file, `hotfix #12`,
 *           `the unresolved #12 thread`, and git's own editor template.
 *
 *           The two counts are what `exit 0` and `exit 1` redden, and they are
 *           asymmetric on purpose: `exit 0` reddens 15 (CM-1's thirteen and two
 *           of CM-3), `exit 1` reddens 14 (CM-2's ten, CM-3's positive, and
 *           three of CM-1 -- the ones that assert on the *output*, which a bare
 *           `exit 1` does not produce). A refusal and a useful refusal are
 *           different properties.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

// Beside `pre-push`, since 2026-10-20: one file serves the operator's clone and
// the stack's agents, and `config/agents/hooks` is a directory the fixture
// projects already copy. See `install.sh` for what the old location cost.
const HOOK = join(repoRoot, 'config/agents/hooks/commit-msg');

// The message that did the damage, **whole**, as `git log -1 --format=%B 5aa5bc9`
// prints it. It used to be a splice that dropped the first body paragraph and
// re-ended the last line, while three documents called it "the real one, kept
// verbatim" -- so the case asserted line `4:` for a line that is `10:` in the
// message that was actually committed. Found by the reviewer, 2026-10-20. The
// line number is part of what the hook promises, so the fixture has to be the
// thing itself.
const THE_REAL_ONE = [
  "docs: #10 and #25 merged, and two suites at once invent red",
  "",
  "The review latency broke today. iztiev took #10 in at 09:20Z as b59d19c and #25",
  "within the hour as 9858651, both without a comment -- the first of ours to go in",
  "after a review, and the second carrying 691dd2e, so B7-5's figures reached main",
  "the same day they were taken. This section had opened with \"nothing merged",
  "today\", true two hours earlier, which is why each claim now carries its time.",
  "",
  "Nine of ours are open. Exactly two conflicted with the new main, both only in",
  "BACKLOG.md, and both are merged and resolved: #18, where both sides appended an",
  "item under Open findings, and #19, where main appended next to the",
  "operator.admin section that #19 removes because it closes it -- that section is",
  "identical in main and in the merge base, so honouring the removal discarded",
  "nothing. git merge-tree now reports all nine clean.",
  "",
  "Also recorded, because it cost an hour of reading failures that were not there:",
  "the full suite run on two branches at the same time on this host produced 13 red",
  "cases, all artefacts. B6-37 asserts what judging a bundle costs, and a competing",
  "suite breaks that -- the same case took 6.3 s on one branch and 10.3 s on the",
  "other. B6-21 to B6-23 take each other's fixed-name fixtures, which is what #19",
  "fixes, so eight of the eleven landed on #18, the branch without that fix.",
  "Serially the same files are green on both.",
  "",
  "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
].join('\n');

// The line of it that GitHub acted on, and its number in the message above.
const OFFENDING_LINE = 10;

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
    expect(r.output).toMatch(new RegExp(`^${OFFENDING_LINE}:`, 'm'));
  });

  test.each([
    ['fixes, bare reference', 'fix: something\n\nfixes #19 in passing\n'],
    ['closes with a colon', 'fix: something\n\ncloses: #7\n'],
    ['uppercase resolve', 'fix: something\n\nRESOLVES #5 at last\n'],
    ['GH- form', 'fix: something\n\nClosed GH-7 with this\n'],
    ['owner/repo form', 'fix: something\n\nfixed nocodenation/liquidupstart#12\n'],
    ['issue URL', 'fix: something\n\ncloses https://github.com/nocodenation/liquidupstart/issues/7\n'],
    ['pull URL', 'fix: something\n\nresolve https://github.com/nocodenation/liquidupstart/pull/18\n'],
    // **A1 of the first review.** `grep` reads one line at a time, so the
    // incident's own sentence wrapped two words earlier went straight through:
    // `resolved:` ends line 3 and `#18, where both sides` opens line 4. Whether
    // GitHub closes across a line break is not verified -- measuring it needs a
    // commit pushed to a default branch -- and the costs decide it: a false
    // refusal costs a rephrase, a false pass costs a pull request.
    [
      'a keyword at the end of a line and its reference at the start of the next',
      'docs: something\n\nboth are merged and resolved:\n#18, where both sides appended an item\n'
    ],
    // **A2's counterpart.** The left boundary must not swallow punctuation: a
    // keyword in brackets is still a keyword.
    ['a keyword inside brackets', 'fix: something\n\n(fixes #12)\n'],
    // **Blocking item 1.** A `#` line is stored by `-m` and `-F`, so it is read.
    [
      'a body line beginning with a reference, as -m stores it',
      'docs: x\n\n#18 is merged, and this closes #20\n'
    ]
  ])('CM-1 %s is refused', (_name, message) => {
    expect(runHook(message).code).toBe(1);
  });

  test('CM-1 and the line it names is the line in the file, not a shifted one', () => {
    // While `#` lines were being dropped before the search, every reported number
    // was short by however many had been dropped above it. The `#` line here is
    // line 3 and the offending line is 5.
    const r = runHook('docs: x\n\n# a comment line\n\nthis closes #20\n');
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/^5:/m);
  });

  test('CM-1 and the refusal names the file git actually used', () => {
    // It said `.git/COMMIT_EDITMSG` from a template. In a worktree `.git` is a
    // file and the message lives elsewhere, so the sentence pointed at nothing.
    const dir = mkdtempSync(join(tmpdir(), 'lu-commit-msg-path-'));
    try {
      const file = join(dir, 'MSG_SOMEWHERE_ELSE');
      writeFileSync(file, 'docs: x\n\nthis closes #20\n');
      const r = sh([HOOK, file], repoRoot);
      expect(r.code).toBe(1);
      expect(r.output).toContain(file);
      expect(r.output).not.toContain('.git/COMMIT_EDITMSG');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  test('CM-2 git\'s own editor template passes, which is what the # rule was for', () => {
    // The premise that replaced *"a comment line is stripped, so it passes"*.
    // What matters is not that `#` lines are ignored -- they are not, under `-m`
    // and `-F` -- but that git's template carries no keyword in front of a
    // reference, so reading it costs nothing.
    const r = runHook(
      [
        'docs: something',
        '',
        '# Please enter the commit message for your changes. Lines starting',
        "# with '#' will be ignored, and an empty message aborts the commit.",
        '#',
        '# On branch feature/commit-message-guard',
        '# Changes to be committed:',
        '#\tmodified:   config/agents/hooks/commit-msg',
        ''
      ].join('\n')
    );
    expect(r.code, r.output).toBe(0);
  });

  test.each([
    // A1's counterpart: the pair pass must not refuse prose that merely spans a
    // line break. `this closes` / `the gap #18 left open` is the same sentence
    // CM-2 already holds on one line, wrapped.
    [
      'a keyword and a reference on adjacent lines with a word between them',
      'docs: something\n\nthis closes\nthe gap #18 left open\n'
    ],
    // A2's counterparts, each measured as refused before the boundary was added.
    ['a word ending in fix', 'docs: something\n\nhotfix #12 landed this morning\n'],
    ['a word ending in resolved', 'docs: something\n\nthe unresolved #12 thread stays open\n'],
    ['disclosed, enclosed, suffixed', 'docs: something\n\ndisclosed: #12, enclosed #13, suffixed #14\n']
  ])('CM-2 %s passes', (_name, message) => {
    const r = runHook(message);
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

describe('CM-7 the guard fails closed, and the locale cannot change its answer', () => {
  // **It failed OPEN, and the suite could not see it in either direction.**
  // Under a UTF-8 locale -- the operator's normal state in Terminal.app -- one
  // byte that is invalid in that locale makes BSD `sed` exit with `RE error:
  // illegal byte sequence`. `body` was then empty, nothing matched, and the hook
  // permitted the message. Measured 2026-10-20, git 2.48.1: a message carrying
  // one Latin-1 byte in its subject and the incident's own sentence, pure ASCII,
  // in its body committed with **rc 0** under `LC_ALL=en_US.UTF-8` and was
  // refused under `LC_ALL=C`. GNU sed handles the same file, so the hole belonged
  // to the machine the guard was written and reviewed on.
  //
  // `tests/lib/shell.ts` pins `LC_ALL=C`, `LANG=C` and `LANGUAGE=C` for every
  // case, for its own good reasons -- which is exactly why no case here could see
  // this. **So these scenarios set the locale themselves**, and that is the point
  // of them: a guard whose verdict depends on the environment has to be measured
  // across the environments it will meet.
  //
  // The repair is two things, because the locale is one cause and not the class.
  // The hook exports `LC_ALL=C` so both tools work on bytes, and every step's
  // status is read: a guard that cannot read the message refuses it.
  const LOCALES = ['C', 'en_US.UTF-8', 'de_DE.UTF-8'];

  // One Latin-1 'ö' (0xF6) in the subject; everything else is ASCII, and the
  // offending line is the sentence that closed #18.
  const LATIN1_SUBJECT = Buffer.from([
    ...Buffer.from('docs: M', 'ascii'), 0xf6, ...Buffer.from('ller\n\n', 'ascii'),
    ...Buffer.from('both are merged and resolved: #18\n', 'ascii')
  ]);
  const LATIN1_PROSE = Buffer.from([
    ...Buffer.from('docs: M', 'ascii'), 0xf6, ...Buffer.from('ller reviewed it\n\n', 'ascii'),
    ...Buffer.from('the #18 conflict, answered on #19\n', 'ascii')
  ]);

  function runWithLocale(bytes: Buffer, locale: string) {
    const dir = mkdtempSync(join(tmpdir(), 'lu-cm-locale-'));
    try {
      const file = join(dir, 'COMMIT_EDITMSG');
      writeFileSync(file, bytes);
      return sh([HOOK, file], repoRoot, { LC_ALL: locale, LANG: locale, LANGUAGE: locale });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test.each(LOCALES)('CM-7 the negative: a byte sed cannot read does not let the message through (%s)', (locale) => {
    expect(runWithLocale(LATIN1_SUBJECT, locale as string).code).toBe(1);
  });

  test.each(LOCALES)('CM-7 the counterpart: the same byte in harmless prose still commits (%s)', (locale) => {
    // Without this, "refuse whenever a byte looks odd" would pass the three
    // above and make a message with one mis-encoded character uncommittable --
    // which is a guard nobody can use.
    const r = runWithLocale(LATIN1_PROSE, locale as string);
    expect(r.code, r.output).toBe(0);
  });

  test('CM-7 and a valid multi-byte character is ordinary text in either direction', () => {
    const utf8Prose = Buffer.from('docs: Möller reviewed it\n\nthe #18 conflict, answered on #19\n', 'utf8');
    const utf8Hit = Buffer.from('docs: Möller\n\nboth are merged and resolved: #18\n', 'utf8');
    expect(runWithLocale(utf8Prose, 'en_US.UTF-8').code).toBe(0);
    expect(runWithLocale(utf8Hit, 'en_US.UTF-8').code).toBe(1);
  });

  test('CM-7 and the hook says it refuses because it could not read, not because it judged', () => {
    // The two refusals are different facts and the message has to tell them
    // apart, or an author edits a sentence that was never the problem.
    const r = runWithLocale(LATIN1_SUBJECT, 'en_US.UTF-8');
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/could not read it|would close the reference/);
  });

  test('CM-7 and the hook pins the locale itself, so a caller cannot change the verdict', () => {
    const body = readFileSync(HOOK, 'utf8');
    expect(body).toContain('export LC_ALL=C');
    // And no step's status is thrown away: `|| true` on the match was what made
    // "found nothing" and "could not look" the same answer.
    expect(body).not.toMatch(/grep -niE "\$pattern" \|\| true/);
  });
});
