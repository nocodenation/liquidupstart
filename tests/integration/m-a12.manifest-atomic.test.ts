/**
 * M-A12 · Integration · The manifest is never half there
 *
 * Purpose:  `lu_write_manifest` ended with `} > "$MANIFEST"`, which truncates the
 *           file and then fills it. Every reader of `repositories.json` -- the
 *           dashboard's card, `git-repo-info` in every agent container, and
 *           `unreachable_repositories` in `start.sh` -- can therefore read it
 *           while it holds nothing, or half a document. Measured against the
 *           unfixed script, eight repositories over six runs: 88,365 reads,
 *           **893 of them empty** and **30 unparseable**, the longest 5,274
 *           bytes ending mid-entry at `"cloned": true,`. The suite had already
 *           caught it once by accident, as
 *           `SyntaxError: JSON Parse error: Unexpected EOF` at load time in
 *           `m-a12.manifest-while-waiting`, and it is the likeliest explanation
 *           for finding 6 of the 2026-10-01 review of #18, seen once in twenty
 *           runs and never reproduced.
 *
 *           Not one of those 923 bad reads was a *plausible* document: the file
 *           was always either empty or unparseable, never valid JSON with the
 *           wrong contents. So the damage is a reader that fails, not a reader
 *           that is misled -- which is why nothing downstream ever reported
 *           something false.
 *
 *           Two writers in this stack already do it correctly, and one of them
 *           is in the same script: `writeManifestDocument` in
 *           `dashboard/src/lib/server/git.ts` writes `<path>.tmp` and renames,
 *           and `seed_known_hosts` writes a temporary file and moves it.
 * Given:    Three declared repositories, all clonable through the suite's fake
 *           ssh, so each run writes a complete manifest twice -- once after
 *           pass 1 and once at the end.
 * When:     Three starts run in sequence while a reader reads the manifest as
 *           fast as it can, the way the dashboard does: read the bytes, parse
 *           them.
 * Then:     Every read is either "the file is not there yet" or a complete
 *           document. Never empty, never a fragment.
 * Covers:   A12-3, A12-4, A12-5, A12-6, FR3, U11
 * Unhappy:  A12-4 is the counterpart that matters: the document each run leaves
 *           behind names all three repositories. Without it A12-3 is satisfied
 *           by a script that never writes a manifest at all, which is the
 *           failure mode of every "nothing bad was observed" case.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  tempProject, seedKnownHosts, seedRepo, fakeSsh, gitScript, START_SCRIPT_BUDGET
} from '../lib/gitfixture';

const work = tempProject('lu-a12-atomic-');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const project = join(work, 'project');
mkdirSync(project, { recursive: true });
seedKnownHosts(project);
writeFileSync(join(project, '.env'), 'SYSTEM_SIGNIN_WAIT_SECONDS=0\n');

const NAMES = ['probe-a', 'probe-b', 'probe-c'];
const bin = fakeSsh(
  work,
  NAMES.map((name) => ({ match: name, bare: seedRepo(work, name) }))
);
const secrets = join(project, 'volumes', '_git-secrets');
const manifestPath = join(secrets, 'repositories.json');

const env = {
  ...(process.env as Record<string, string>),
  GIT_REPOSITORIES: NAMES.map((n) => `git@github.com:nocodenation/${n}.git|read|protected`).join(','),
  PATH: `${bin}:${process.env.PATH}`
};

// The reader runs for as long as the starts do, and it reads the way the
// dashboard reads: the whole file, then `JSON.parse`. Nothing here waits on a
// clock -- the loop ends when the last run has exited.
const seen = { reads: 0, empty: 0, unparseable: 0, longestBad: '' };
let running = true;
const reader = (async () => {
  while (running) {
    if (existsSync(manifestPath)) {
      let text: string;
      try {
        text = readFileSync(manifestPath, 'utf8');
      } catch {
        await Bun.sleep(0);
        continue;
      }
      seen.reads++;
      if (text === '') {
        seen.empty++;
      } else {
        try {
          JSON.parse(text);
        } catch {
          seen.unparseable++;
          if (text.length > seen.longestBad.length) seen.longestBad = text;
        }
      }
    }
    await Bun.sleep(0);
  }
})();

const script = readFileSync(gitScript, 'utf8');

const finals: unknown[] = [];
for (let r = 0; r < 3; r++) {
  const p = Bun.spawn(['bash', gitScript, project], { env, stdout: 'ignore', stderr: 'ignore' });
  await p.exited;
  finals.push(JSON.parse(readFileSync(manifestPath, 'utf8')));
}
running = false;
await reader;

describe('A12-3 a reader never sees a half-written manifest', () => {
  test('A12-3 every read was either absent or a whole document', () => {
    expect({ empty: seen.empty, unparseable: seen.unparseable }).toEqual({
      empty: 0,
      unparseable: 0
    });
  });

  test('A12-3 and the reader really was reading while the runs wrote', () => {
    // The control. With no readings there is nothing to assert, and a green
    // result above would mean the loop never overlapped a write. The unfixed
    // script produced 293 empty reads from 4,530 at the smallest size measured,
    // so a few thousand reads is a window the defect cannot hide in.
    expect(seen.reads).toBeGreaterThan(1000);
  });
}, START_SCRIPT_BUDGET);

describe('A12-4 the counterpart: each run did leave a whole manifest', () => {
  test('A12-4 every run wrote a document naming all three repositories', () => {
    const named = finals.map(
      (doc) => ((doc as { repositories: { name: string }[] }).repositories ?? []).map((r) => r.name).sort()
    );
    expect(named).toEqual([NAMES.slice().sort(), NAMES.slice().sort(), NAMES.slice().sort()]);
  });

  test('A12-4 and it is readable, with a generated stamp', () => {
    for (const doc of finals) {
      expect(typeof (doc as { generated: string }).generated).toBe('string');
    }
  });
});

describe('A12-5 the write goes somewhere else first, and arrives by rename', () => {
  test('A12-5 nothing truncates the manifest in place', () => {
    // Held as a contract check as well as behaviourally: A12-3 is a measurement
    // over thousands of reads, and the form of the write is what makes that
    // measurement true rather than lucky.
    //
    // Asserted as booleans rather than with `expect(script).toMatch(...)`,
    // because a failure there prints the whole 70KB script and the finding is
    // lost in it. The same mistake one layer out as A1 of the 2026-10-01 review.
    expect({
      truncatesInPlace: /\}\s*>\s*"\$MANIFEST"/.test(script),
      renamesIntoPlace: /mv\s+"\$\{?MANIFEST_TMP\}?"\s+"\$MANIFEST"/.test(script)
    }).toEqual({ truncatesInPlace: false, renamesIntoPlace: true });
  });

  test('A12-5 and no temporary file is left in the secrets directory', () => {
    const left = readdirSync(secrets).filter((f) => f.includes('.tmp'));
    expect(left).toEqual([]);
  });
});

describe('A12-6 the temporary file sits beside its target, not in TMPDIR', () => {
  test('A12-6 both temporaries are derived from the path they replace', () => {
    // `mv` is only atomic within one filesystem. Across one it copies and then
    // unlinks, which is the very window being closed -- so a temporary in
    // `$TMPDIR` makes the guarantee depend on where TMPDIR points. On the host
    // this was written on the two share a filesystem, which is why
    // `seed_known_hosts` has never been seen to fail; on a Linux host with /tmp
    // on tmpfs they do not share one.
    expect({
      manifestTmpBesideTarget: /MANIFEST_TMP="\$\{MANIFEST\}/.test(script),
      knownHostsTmpBesideTarget: /mktemp\s+"\$\{KNOWN_HOSTS\}/.test(script),
      knownHostsTmpInTmpdir: /scanned="\$\(mktemp\)"/.test(script)
    }).toEqual({
      manifestTmpBesideTarget: true,
      knownHostsTmpBesideTarget: true,
      knownHostsTmpInTmpdir: false
    });
  });
});
