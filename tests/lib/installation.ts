import { afterAll } from 'bun:test';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * What a case borrows from the running installation, it gives back.
 *
 * The system tier writes into `volumes/` and restarts containers — that is what
 * makes it the system tier. On 2026-09-17 a run left the operator's gateway
 * configuration missing `"claude-cli/*"` from `agents.defaults.models`, and the
 * gateway itself exited 127. The cases did have restores, and they were the
 * wrong shape in two ways:
 *
 *   they put back **one field** — `scopes`, `trustedProxies` — into a document
 *     they read back at restore time, so whatever else had changed meanwhile
 *     survived;
 *   and each file took its own snapshot, so a file whose snapshot was taken
 *     after another file had already written held the changed state as its
 *     "original".
 *
 * So the snapshot is whole-file, and it is taken once per path however many
 * files ask for it: the first capture wins, and every later caller restores the
 * same bytes.
 */
const snapshots = new Map<string, string | null>();

/** The bytes at `path` right now, or null when there is no file there. */
export function capture(path: string): string | null {
  if (!snapshots.has(path)) snapshots.set(path, existsSync(path) ? readFileSync(path, 'utf8') : null);
  return snapshots.get(path) ?? null;
}

/**
 * Put the captured bytes back, and say whether anything had to be repaired.
 * A file that did not exist when it was captured is removed again — a case that
 * creates a file in the installation has not given it back until it is gone.
 */
export function restore(path: string): boolean {
  if (!snapshots.has(path)) return false;
  const original = snapshots.get(path) ?? null;
  const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (now === original) return false;
  if (original === null) unlinkSync(path);
  else writeFileSync(path, original);
  return true;
}

/** Only for tests of this module: forget what has been captured. */
export function forget(path: string): void {
  snapshots.delete(path);
}

/**
 * Capture `path` now and put it back when this file's cases are done, whether
 * they passed, failed or threw. `afterRestore` runs only when something was
 * actually repaired — a gateway restart costs half a minute and is pointless
 * when the file never changed.
 */
export function protect(path: string, afterRestore?: () => void): void {
  capture(path);
  afterAll(() => {
    if (restore(path) && afterRestore) afterRestore();
  });
}
