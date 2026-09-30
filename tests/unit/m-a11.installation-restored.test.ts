/**
 * A11-1 to A11-4 — what a case borrows from the installation, it gives back whole.
 *
 * Purpose: found by running the suite on 2026-09-17, twice in one afternoon. The
 * system tier writes `volumes/_openclaw/openclaw.json` and restarts the gateway
 * — that is what makes it the system tier — and after a run the operator's
 * configuration had lost `"claude-cli/*"` from `agents.defaults.models`, with
 * the gateway left exited 127. Twenty-six later cases failed against it.
 *
 * The cases did have restores. They were the wrong shape in two ways, and both
 * are the subject here:
 *
 *   `tests/system/m-oc.device-scopes.test.ts` put back `scopes` alone and
 *   `m-oc.proxy-attribution.test.ts` put back `trustedProxies` alone, each into
 *   a document read back **at restore time** — so anything else that had changed
 *   in between survived the restore, wearing the original's name.
 *
 *   And each file captured its own "original", so a file whose capture happened
 *   after another had already written held the changed state as the thing to
 *   restore.
 *
 * `tests/lib/installation.ts` captures whole files, once per path however many
 * files ask, and puts the bytes back.
 *
 * Given  a file standing for something in the installation
 * When   a case changes it, adds one, or leaves it alone
 * Then   the captured bytes come back exactly, a file that was not there is
 *        removed again, and a file nobody changed is not rewritten
 *
 * A11-3 is the one that matters most and is the least obvious: `restore` reports
 * whether it repaired anything, and a gateway restart — half a minute — must not
 * run when nothing changed.
 *
 * Test data: a scratch file holding the two lines `{"a":1}` and, after the case
 * writes it, `{"a":2}`; a second path that does not exist when it is captured.
 * The assertions compare the bytes, not a parsed document, because a restore
 * that reformats is a change an operator would see in `git diff` and in a
 * reviewer's reading.
 *
 * Requirements covered: A11-1 to A11-4, and the 2026-09-17 incident.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { capture, forget, restore } from '../lib/installation';

const dir = mkdtempSync(join(tmpdir(), 'lu-a11-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('A11-1 the whole file comes back, not the field the case remembered', () => {
  test('a change anywhere in it is undone', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, '{\n  "keep": "me",\n  "scopes": ["read"]\n}\n');
    capture(path);

    // What the system cases do: read, change one field, write the whole document
    // back. The damage was never the field they changed -- it was everything
    // else that had changed in between and rode along as "original".
    const cfg = JSON.parse(readFileSync(path, 'utf8'));
    cfg.scopes = ['read', 'admin'];
    delete cfg.keep;
    writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');

    expect(restore(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('{\n  "keep": "me",\n  "scopes": ["read"]\n}\n');
    forget(path);
  });
});

describe('A11-2 the first capture wins, however many files ask', () => {
  test('a second capture after a change does not become the original', () => {
    // The second half of the incident: three files, three captures, and the one
    // taken last held a document another file had already written.
    const path = join(dir, 'shared.json');
    writeFileSync(path, 'first\n');
    capture(path);
    writeFileSync(path, 'changed by an earlier case\n');
    capture(path);

    expect(restore(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('first\n');
    forget(path);
  });
});

describe('A11-3 a restore that had nothing to repair says so', () => {
  test('an untouched file is not rewritten, and the caller is told', () => {
    // `protect` runs its callback only on a real repair, and that callback is a
    // gateway restart -- half a minute of a suite, for nothing, every time.
    const path = join(dir, 'untouched.json');
    writeFileSync(path, '{"a":1}\n');
    capture(path);

    expect(restore(path)).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe('{"a":1}\n');
    forget(path);
  });
});

describe('A11-4 a file the case created is taken away again', () => {
  test('what was not there is not there afterwards', () => {
    // A case that leaves a new file behind has not given the installation back,
    // however faithfully it restored everything else.
    const path = join(dir, 'made-by-a-case.json');
    expect(existsSync(path)).toBe(false);
    capture(path);
    writeFileSync(path, 'left behind\n');

    expect(restore(path)).toBe(true);
    expect(existsSync(path)).toBe(false);
    forget(path);
  });
});
