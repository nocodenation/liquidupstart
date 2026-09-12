/**
 * OC-36, OC-37 — what a bounded call may be handed, and what happens when it fails.
 *
 * Purpose: two silences in the same file, both found by #11's review.
 *
 * OC-36. `with_timeout` passes its argument to coreutils `timeout`, which execs
 * it. A shell function is not a program: `timeout 5 copilot_cli` exits 127 with
 * "failed to run command". `copilot_authed`, `codex_authed` and `grok_authed`
 * each wrapped such a call, captured the output with 2>&1 and decided by grep —
 * so the 127 landed inside the captured string, the grep missed, and the helper
 * answered false. A valid persisted login read as "not signed in", and the start
 * then looped for 900 s waiting for a sign-in that had already happened.
 *
 * OC-37. `openclaw_version` ends its docker run with `|| return 0`;
 * `openclaw_state_version` did not, and neither did the assignment that calls it.
 * Under `set -euo pipefail` a failing docker run ends the script there, with
 * 2>/dev/null having discarded the reason and down.sh having already emptied the
 * stack a hundred lines earlier.
 *
 * Given  config/scripts/start/openclaw.sh as text, and the behaviour of timeout
 * When   every with_timeout call and every command substitution is examined
 * Then   no argument is a shell function defined in the same file, and every
 *        substitution that may fail tolerates it or is a named exception
 *
 * Test data, measured 2026-09-10 with GNU coreutils on PATH:
 *   bash -c 'f(){ echo x; }; timeout 5 f'          → 127, "failed to run command"
 *   bash -c 'timeout 5 echo x'                     → 0, "x"
 *   set -euo pipefail; V="$(failing)"; echo reached → prints nothing
 * Without timeout installed with_timeout runs the argument in the current shell,
 * where the function is found — which is why neither ever showed on such a host.
 *
 * Requirements covered: OC-G4, F1 and F4 of the #11 review.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const SCRIPT = 'config/scripts/start/openclaw.sh';
const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
const lines = body.split('\n');

/** Names defined as shell functions in the file — what timeout cannot exec. */
const functionNames = [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{/gm)].map(
  (m) => m[1]
);

/** Assignments whose failure should stop the start, each with the reason. */
const MAY_ABORT: { match: string; why: string }[] = [];

describe('OC-36 with_timeout is never handed a shell function', () => {
  test('the file defines functions and uses with_timeout, so the scan has material', () => {
    expect(functionNames.length).toBeGreaterThan(5);
    expect(body).toContain('with_timeout ');
  });

  test('timeout really cannot exec a shell function — the premise, not an assumption', () => {
    const r = sh(['bash', '-c', 'f(){ echo x; }; timeout 5 f']);
    if (r.output.includes('command not found') && r.output.includes('timeout')) return;
    expect(r.code).toBe(127);
    expect(r.output).toMatch(/failed to run command|No such file/);
  });

  test('and every with_timeout argument is a program, not one of those functions', () => {
    const offenders = lines
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /(^|[^#\w])with_timeout\s/.test(text))
      .filter(({ text }) => !/^\s*#/.test(text))
      .map(({ line, text }) => {
        const m = text.match(/with_timeout\s+(?:"[^"]*"|\S+)\s+(\S+)/);
        return { line, text, arg: m ? m[1].replace(/^"|"$/g, '') : '' };
      })
      .filter(({ arg }) => functionNames.includes(arg))
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});

describe('OC-37 a failing probe does not end the start in silence', () => {
  test('set -e really does end the script at such an assignment', () => {
    const r = sh(['bash', '-c', 'set -euo pipefail; f(){ false; }; V="$(f)"; echo reached']);
    expect(r.stdout.trim()).toBe('');
    expect(r.code).not.toBe(0);
  });

  test('the version probes tolerate a failing docker run', () => {
    // openclaw_version had `|| return 0` from the start; openclaw_state_version
    // did not, and the message about building the image first sat unreachable
    // behind it.
    for (const fn of ['openclaw_version', 'openclaw_state_version']) {
      const start = lines.findIndex((l) => l.startsWith(`${fn}()`));
      expect(start).toBeGreaterThan(-1);
      const end = lines.findIndex((l, i) => i > start && l === '}');
      // The tolerance has to sit on the docker run, not anywhere in the body:
      // openclaw_state_version opens with `[[ -f ... ]] || return 0`, which
      // matched a body-wide search and made this assertion pass over the defect
      // it was written for.
      const fnBody = lines.slice(start, end + 1);
      const runAt = fnBody.findIndex((l) => l.includes('docker run'));
      expect({ fn, hasRun: runAt > -1 }).toEqual({ fn, hasRun: true });
      const runStmt = fnBody.slice(runAt).join('\n').split(/\n\s*\n/)[0];
      expect({ fn, tolerant: /\|\|\s*(return 0|true)/.test(runStmt) }).toEqual({
        fn,
        tolerant: true
      });
    }
  });

  test('and no caller can abort the start on a probe that failed', () => {
    // The property is that the failure is tolerated somewhere, not that both
    // ends carry a guard: openclaw_version already ends `|| return 0`, so
    // demanding `|| true` from its callers as well would be asserting a style.
    const tolerantFns = new Set(
      ['openclaw_version', 'openclaw_state_version'].filter((fn) => {
        const start = lines.findIndex((l) => l.startsWith(`${fn}()`));
        const end = lines.findIndex((l, i) => i > start && l === '}');
        const fnLines = lines.slice(start, end + 1);
        const runAt = fnLines.findIndex((l) => l.includes('docker run'));
        return /\|\|\s*(return 0|true)/.test(fnLines.slice(runAt).join('\n').split(/\n\s*\n/)[0]);
      })
    );
    const offenders = lines
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /^\s*[A-Z_]+="\$\((openclaw_version|openclaw_state_version)/.test(text))
      .filter(({ text }) => {
        const fn = text.match(/\$\((openclaw_version|openclaw_state_version)/)![1];
        return !tolerantFns.has(fn) && !/\|\|\s*true/.test(text);
      })
      .filter(({ text }) => !MAY_ABORT.some((e) => text.includes(e.match)))
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});

describe('OC-40 the embedded node programs survive the shell that carries them', () => {
  // openclaw.sh passes JavaScript to `node -e '...'` inside SINGLE quotes, so one
  // apostrophe in a comment ends the string early and node receives a truncated
  // program: "Expected '}', got '<eof>'". It happened twice on 2026-09-10, both
  // times in a comment explaining a repair — "the gateway's", "the operator's".
  //
  // Nothing else catches it. `bash -n` is happy, because the quotes still balance
  // — just around different text. And the component case that runs this writer
  // extracts the block and hands it to node in a FILE, which is the right way to
  // test the program and the wrong way to test its transport. The break is in the
  // shell, and only a check on the shell text sees it.
  const blocks: { line: number; text: string }[] = [];
  let open = false;
  lines.forEach((text, i) => {
    if (/-e '\s*$/.test(text)) { open = true; return; }
    if (open && /^\s*'/.test(text)) { open = false; return; }
    if (open) blocks.push({ line: i + 1, text });
  });

  test('the scan found the embedded programs', () => {
    expect(blocks.length).toBeGreaterThan(20);
  });

  test('and none of them contains an apostrophe', () => {
    const offenders = blocks
      .filter(({ text }) => text.includes("'"))
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});
