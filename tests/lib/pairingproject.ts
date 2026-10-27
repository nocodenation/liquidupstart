/**
 * The one project directory the OpenClaw pairing cases share, and the script seam.
 *
 * `$lib/server/project` reads `process.env.ENV_DIR` **once**, when it is first
 * loaded, and `$lib/server/pairing` captures `OPENCLAW_PAIRING_BUDGET_MS` the same
 * way. `bun test` runs a whole level in one process, so the first file to import
 * either module decides both for every file after it -- and the ones that come
 * later set an environment variable nothing will read again.
 *
 * That is not a hypothesis. `m-oc.pairing-budget.test.ts` set `ENV_DIR` itself and
 * said so in its own header; when `m-oc.pairing-route.test.ts` was added and
 * happened to load first, `OC-70` read the route file's listing -- it asserted an
 * address of `''` and got `10.99.0.9`, a value from a fixture in another file --
 * and `OC-66`'s budget quietly reverted to 60 seconds. Four cases, none of them
 * about the thing that had changed.
 *
 * So the directory is owned here instead, the way `dashboardfixture.ts` owns the
 * one the A3/A8/A10/A16 cases share. Importing this module is what a pairing file
 * does before it reaches anything under `$lib/server`; which file runs first stops
 * being a thing anyone has to know.
 */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Short enough for a case to wait out, long enough not to fire on a fast stub. */
export const BUDGET_MS = 2000;

// `realpathSync` as `newProject` does it: on macOS `tmpdir()` is a symlink, and
// a case that compares a path the server reports with one built here needs the
// two to be spelled the same. Not deleted, also as `newProject` leaves it -- it
// is shared, and a file that removed it took the next file's cases down with it.
export const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'lu-oc-pairing-')));
mkdirSync(join(projectDir, 'config', 'scripts'), { recursive: true });

export const scriptPath = join(projectDir, 'config', 'scripts', 'openclaw-pairing.sh');

/**
 * Replaces the script the server shells out to. `SCRIPT()` is a function and
 * `spawn` reads the file at each call, so rewriting its contents is the seam that
 * actually exists -- a second module instance is not reachable, and a query string
 * on the specifier breaks the module's own relative imports (measured: `Cannot
 * find module './project'`).
 */
export const script = (body: string) => writeFileSync(scriptPath, body, { mode: 0o755 });

// An empty listing, so a file that imports this and forgets to write one gets a
// well-formed answer rather than a missing-file error from bash.
script('#!/usr/bin/env bash\nprintf \'%s\' \'{"pending":[],"paired":[]}\'\n');

process.env.ENV_DIR = projectDir;
process.env.OPENCLAW_PAIRING_BUDGET_MS = String(BUDGET_MS);
