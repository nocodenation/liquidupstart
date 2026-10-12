/**
 * A14-1 to A14-5 — every Skip is one control: same shape, same words, same place.
 *
 * Purpose: asked for by the reviewer on 2026-09-18, after the deploy-key work put
 * a fifth Skip on the screen. The five were built one at a time and looked it:
 * each carried `class="back"`, which is not a button style at all but the **link**
 * style — `color: var(--accent); text-decoration: none` — so they rendered as
 * links beside a solid "Sign in to Claude" button, with a different label each
 * ("Skip Claude for this start", "Skip this repository for this start", …) and
 * therefore a different width. And they sat to the **left** of the action they
 * are the alternative to.
 *
 * `.back` is also worn by real links in the same panels — "Open sign-in link ↗" —
 * so restyling it would have changed those too. The Skip controls get a class of
 * their own instead.
 *
 * Given  the runner component and the stylesheet, read as text
 * When   the Skip controls are examined
 * Then   each is a `button.skip`, each says the same thing, each sits at the end
 *        of its bar, and the class is shaped like the primary button but
 *        transparent until it is hovered, focused or pressed
 * And    `.back` still means a link, because links still use it
 *
 * A14-4 is the counterpart that keeps the rule honest: uniform width is the point
 * of the uniform label, so a case that only counted classes would pass on five
 * differently-worded buttons.
 *
 * What is **not** asserted here is whether it looks right: that needs eyes, and
 * is the manual observation A14-6 in the test specification. What can be read out
 * of the source is read out of the source.
 *
 * Test data: the literal label `Skip for this start`, the collective
 * `Skip all for this start`, the class `button.skip`, the accent `#1f6feb` and
 * its 0.1-alpha form, and the five step names `claude`, `copilot`, `codex`,
 * `grok` and `git-key-…`.
 *
 * Requirements covered: A14-1 to A14-6, the reviewer's note of 2026-09-18 and the
 * operator's two observations while looking at it: that the buttons were only
 * recognisable once touched, and that the confirmation vanished with the panel.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const RUNNER = readFileSync(
  join(repoRoot, 'dashboard/src/lib/components/TaskRunner.svelte'),
  'utf8'
);
const CSS = readFileSync(join(repoRoot, 'dashboard/src/app.css'), 'utf8');

/** The declarations of one rule, without the comments that explain them. */
function block(rule: string): string {
  const at = CSS.indexOf(`${rule} {`);
  return at === -1 ? '' : CSS.slice(at, CSS.indexOf('}', at));
}

/** Every line that carries a skipStep call, which is what makes a control a Skip. */
const skipLines = RUNNER.split('\n').filter((l) => /skipStep\(|skipAllGitKeys/.test(l));

describe('A14-1 every Skip is a button of the same class', () => {
  test('the scan has material: five Skips, one per credential', () => {
    // Four sign-ins and the deploy key. If this number falls, a panel lost its
    // way out and A9-10 is the case that should have said so.
    for (const step of ["skipStep('claude')", "skipStep('copilot')", "skipStep('codex')", "skipStep('grok')"]) {
      expect(RUNNER).toContain(step);
    }
    expect(RUNNER).toContain('skipStep(`git-key-${needGitKey}`)');
  });

  test('and none of them wears the link class any more', () => {
    const offenders = skipLines.filter((l) => /class="back"/.test(l)).map((l) => l.trim());
    expect(offenders).toEqual([]);
  });

  test('and each is class="skip"', () => {
    const offenders = skipLines
      .filter((l) => /<button/.test(l))
      .filter((l) => !/class="skip"/.test(l))
      .map((l) => l.trim());
    expect(offenders).toEqual([]);
  });
});

describe('A14-2 .back still means a link, because links still use it', () => {
  test('the sign-in links keep it, and it keeps its link styling', () => {
    // The reason the Skips got a class of their own rather than a new `.back`.
    expect(RUNNER).toContain('rel="noopener noreferrer" class="back"');
    const back = CSS.slice(CSS.indexOf('.back {'), CSS.indexOf('.back {') + 120);
    expect(back).toContain('text-decoration: none');
  });
});

describe('A14-3 the class is the primary button, minus its fill', () => {
  const skip = CSS.slice(CSS.indexOf('button.skip {'));

  test('it borrows the size of button.save', () => {
    // "the same as Sign in to Claude in terms of sizes (font, margins, paddings)"
    const save = block('button.save');
    for (const property of ['padding: 0.6rem 2rem', 'font-size: 1rem', 'font-weight: 600']) {
      expect(save).toContain(property);
      expect(block('button.skip')).toContain(property);
    }
  });

  test('and carries no background until it is touched', () => {
    expect(block('button.skip')).toContain('background: transparent');
    expect(block('button.skip')).toContain('color: var(--accent)');
  });

  test('but is recognisable as a button while nobody is touching it', () => {
    // The operator looked at it on 2026-09-18 and said the buttons "are only
    // recognisable as buttons on hover or when tabbed to". A control that has to
    // be found before it can be seen is not a control. The request was for a
    // transparent *background*, which an outline keeps.
    expect(block('button.skip')).toContain('border: 1px solid var(--accent)');
    // And the same box as the button beside it, or the pair is two heights.
    expect(block('button.save')).toContain('border: 1px solid transparent');
  });

  test('and answers to hover, keyboard focus and the press itself', () => {
    // Three states, because a control that only reacts to a mouse is a control a
    // keyboard cannot see.
    for (const state of ['button.skip:hover', 'button.skip:focus-visible', 'button.skip:active']) {
      expect(skip).toContain(state);
    }
    // The same blue at about a tenth: named from the accent rather than typed
    // again, so the two cannot drift apart.
    expect(skip).toContain('--accent-wash');
    expect(CSS).toMatch(/--accent-wash:\s*rgba\(31,\s*111,\s*235,\s*0?\.1\)/);
  });
});

describe('A14-4 and every Skip says the same thing, which is what makes them one width', () => {
  test('the label is uniform', () => {
    const labels = RUNNER.match(/Skip[^<'`\n]*for this start/g) ?? [];
    expect(labels.length).toBeGreaterThan(4);
    expect([...new Set(labels)].sort()).toEqual(['Skip all for this start', 'Skip for this start']);
  });

  test('and what was skipped is said beside the button, not inside it', () => {
    // The state used to be the label -- "Skipped — the start continues without
    // this repository" -- which is a different width every time and defeats the
    // uniformity it sits next to.
    expect(RUNNER).toContain('skip-note');
    const insideButtons = skipLines.filter((l) => /Skipped/.test(l)).map((l) => l.trim());
    expect(insideButtons).toEqual([]);
  });
});

describe('A14-6 the confirmation stays long enough to be read', () => {
  test('the panel is held open, counting down, after a skip', () => {
    // The panel closes the moment the wait ends, and a skip ends it at once, so
    // the line confirming the skip was on screen for milliseconds -- reported by
    // the operator on 2026-09-18, watching it. Five seconds: long enough to read,
    // short enough not to sit in the way of a start that has moved on.
    expect(RUNNER).toContain('holdingSkip');
    const hold = RUNNER.slice(RUNNER.indexOf('function holdSkipNote'), RUNNER.indexOf('function syncGitKeyPanel'));
    // Three seconds, counted down on screen. Five silent seconds read as a panel
    // that had frozen; with the seconds visible the operator knows the next
    // repository is coming, and three are then enough -- their own suggestion
    // after watching the five.
    expect(hold).toContain('holdLeft = 3');
    expect(hold).toContain('setInterval');
    expect(hold).toContain('holdLeft -= 1');
    // And the count is shown, or it is a silent wait with extra machinery.
    expect(RUNNER).toContain('in {holdLeft}');
    // Held, not pinned: the panel still closes on its own afterwards.
    expect(RUNNER).toContain('needGitKey && (!gitKeyDone || holdingSkip)');
  });

  test('and the hold is started by the skip itself, not by the panel opening', () => {
    const skipStep = RUNNER.slice(RUNNER.indexOf('async function skipStep'), RUNNER.indexOf('let codexLog'));
    expect(skipStep).toContain('holdSkipNote()');
  });

  test('and the panel stays on the repository that was skipped, not on the next one', () => {
    // Holding the panel is not enough: a skip ends the wait at once, so the next
    // repository's marker arrives within milliseconds and the content switched
    // under the operator's hand -- the confirmation they had just produced was
    // covered before it could be read. Reported on 2026-09-18: "die 1. Karte wird
    // zu schnell von der 2. überdeckt". The queue advances when the hold ends.
    expect(RUNNER).toContain('if (!holdingSkip) syncGitKeyPanel()');
    const hold = RUNNER.slice(RUNNER.indexOf('function holdSkipNote'), RUNNER.indexOf('function syncGitKeyPanel'));
    expect(hold).toContain('syncGitKeyPanel()');
  });
});

describe('A14-5 the Skip sits at the end of its bar', () => {
  test('pushed right rather than reordered, so the primary action stays first', () => {
    // Reordering the markup would put the alternative ahead of the action for a
    // keyboard and a screen reader. `margin-left: auto` moves it visually and
    // leaves the order alone -- and it keeps working when a bar holds three
    // controls, as the deploy-key panel does.
    // The rule's own declarations, not a slice of fixed length: a comment
    // explaining the rule pushed `margin-left` past 400 characters, and the case
    // read that as a missing declaration.
    expect(block('button.skip')).toContain('margin-left: auto');
  });

  test('and where two Skips share a bar, only the outermost is pushed', () => {
    // Otherwise the pair would be split across the whole width.
    expect(CSS).toContain('button.skip + button.skip');
  });
});

/**
 * A14-7 — the page tells the truth when a run ends, without being reloaded.
 *
 * Purpose: the operator, on 2026-09-18, after a start that had just prepared two
 * repositories: *"nach dem Seite neu laden sind sie da, aber das macht doch ein
 * user nicht"* — after reloading they are there, but a user does not do that.
 *
 * The mechanism existed and had a hole. `runTask` in `task-state.svelte.js`
 * calls `onchange` **only** when the log says the task succeeded, and the three
 * host pages hang `invalidateAll()` on that callback. So a start that failed, or
 * that was still being read when the operator looked, left the repositories card
 * describing the start before it — "declared but not yet prepared", with no key
 * and no Test button, for repositories the run had just prepared. The page was
 * stale exactly when its subject had changed.
 *
 * Given  the runner component
 * When   a task ends, however it ends
 * Then   the page's data is re-read from the server
 * And    the success-only callback keeps its meaning, because one host uses it to
 *        navigate and must not navigate after a failure
 *
 * Test data: the identifiers `invalidateAll`, `runSharedTask` and `onchange` in
 * `TaskRunner.svelte`, and the `onchange={() => invalidateAll()}` wiring in the
 * host pages.
 *
 * Requirements covered: A14-7, and the operator's observation of 2026-09-18.
 */
describe('A14-8 each repository keeps its own test result', () => {
  const CARD = readFileSync(
    join(repoRoot, 'dashboard/src/lib/components/GitRepositories.svelte'),
    'utf8'
  );

  test('results are held per repository, not one per card', () => {
    // A single slot meant testing the second repository wiped the first one's
    // answer off the screen -- reported by the operator on 2026-09-18, testing
    // two in a row. Keyed by slug, like everything else here, because two
    // declared repositories can share a name.
    expect(CARD).toContain('let results = $state({})');
    expect(CARD).toContain('results[repo.slug]');
  });

  test('and starting one test clears only that repository\'s answer', () => {
    // The counterpart: a map that is never cleared would show a stale answer
    // beside a test that is running right now.
    expect(CARD).toContain('results = { ...results, [repo.slug]: null }');
    // And nothing holds a single result any more.
    const single = CARD.split('\n').filter((l) => /\blet result\b|result\.message|result\.ok/.test(l));
    expect(single).toEqual([]);
  });
});

describe('A14-7 a finished run refreshes what the page shows', () => {
  test('the refresh is not inside the success branch', () => {
    // It sits after the task, in the runner itself: every host page gets it, and
    // a failed run refreshes too -- which is the case that was broken.
    const runTask = RUNNER.slice(
      RUNNER.indexOf('async function runTask(name)'),
      RUNNER.indexOf('async function startClaudeAuth')
    );
    expect(runTask).toContain('await runSharedTask(name, onchange)');
    expect(runTask).toContain('await invalidateAll()');
    expect(RUNNER).toContain("import { invalidateAll } from '$app/navigation'");
  });

  test('and the success-only callback still means success', () => {
    // `done/+page.svelte` navigates away on it. Navigating after a failed start
    // would take the operator off the page carrying the error.
    const state = readFileSync(join(repoRoot, 'dashboard/src/lib/task-state.svelte.js'), 'utf8');
    const success = state.slice(state.indexOf('succeeded]`)'), state.indexOf('} else if'));
    expect(success).toContain('onchange?.(name)');
  });
});
