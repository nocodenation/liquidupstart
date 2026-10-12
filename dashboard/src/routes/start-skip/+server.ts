// POST {step:'claude'|'codex'|'copilot'|'grok'|`git-key-<slug>`} — tells a start
// run in progress to stop waiting on that one credential and carry on.
//
// A file rather than a signal: the start script runs in another process, often
// in another container, and the two only share the project directory. The start
// clears this directory at the beginning of every run, so a skip holds for one
// start and never becomes a setting nobody remembers making.
import { json, error } from '@sveltejs/kit';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV_DIR } from '$lib/server/project';
import type { RequestHandler } from './$types';

const SKIP_DIR = join(ENV_DIR, 'volumes', '.start-skip');

// A path element, not a description: anything else could escape the directory.
//
// Upper case, and 200 rather than 65 characters, since 2026-09-18. `lu_git_slug`
// keeps the case of what was declared -- it only replaces characters outside
// [A-Za-z0-9._-] -- so a repository under `NoCodeNation` produced the step
// `git-key-github.com_NoCodeNation_agent-skills`, which this expression refused
// with 400. `skipStep` swallows the error, so the Skip button stayed enabled and
// did nothing while the start waited out its deadline, while "Skip all" worked
// because `git-key-all` happens to be lower case. A long owner and repository
// name hit the length limit the same way. Neither change widens what this rule
// is for: no slash, no leading dot, so nothing can leave the skip directory.
const STEP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const step = typeof body?.step === 'string' ? body.step : '';
  if (!STEP.test(step)) throw error(400, 'step must be a simple name');
  try {
    mkdirSync(SKIP_DIR, { recursive: true });
    writeFileSync(join(SKIP_DIR, step), '');
  } catch (e) {
    throw error(500, `could not write the skip marker: ${(e as Error).message}`);
  }
  return json({ skipped: step });
};
