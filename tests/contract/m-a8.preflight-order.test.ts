/**
 * M-A8 · Contract · The pre-flight runs before the teardown, not after
 *
 * Purpose:  A8-21's behaviour is worth nothing in the wrong position. The whole
 *           finding is one of order: start.sh brings the stack down at line 16
 *           and reaches the git step at line 139, so a check placed anywhere
 *           after the teardown answers correctly and far too late. This asserts
 *           the position, which is the part a later edit can quietly undo.
 * Given:    scripts/linux/start.sh.
 * When:     The declaration check and the teardown are located in it.
 * Then:     The check comes first, and both are still there — a missing
 *           teardown would make this pass while meaning nothing.
 * Covers:   A8-21, FR11, FR20
 * Unhappy:  The third assertion is the guard: if either line is renamed away,
 *           the case fails rather than silently approving a file it can no
 *           longer see.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const START = readFileSync(join(repoRoot, 'scripts', 'linux', 'start.sh'), 'utf8');
const CHECK = 'git.sh" "${PROJECT_DIR}" --check-declaration';
const TEARDOWN = 'scripts/linux/down.sh"';

describe('A8-21 the declaration is judged while the stack is still up', () => {
  test('both the check and the teardown are in the start script', () => {
    expect(START).toContain(CHECK);
    expect(START).toContain(TEARDOWN);
  });

  test('and the check comes first', () => {
    expect(START.indexOf(CHECK)).toBeLessThan(START.indexOf(TEARDOWN));
  });

  test('the git step itself still runs after the teardown, where it belongs', () => {
    // The pre-flight judges; it does not replace the step that prepares keys and
    // clones, which needs the stack down and the volumes free.
    const gitStep = START.indexOf('config/scripts/start/git.sh"\n');
    expect(gitStep).toBeGreaterThan(START.indexOf(TEARDOWN));
  });
});
