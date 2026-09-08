/**
 * OC-3 — no unattended step may wait forever.
 *
 * Purpose: on 2026-09-05 a cold start hung indefinitely. OpenClaw answered an
 * invalid config, under a pty, with `Run "openclaw doctor --fix" now? [Y/n]`, and
 * the one-shot container had no stdin that could ever answer it. Both halves
 * mattered — the invalid config caused the prompt, and the *unbounded call*
 * turned it into a hang rather than an error.
 *
 * Given  config/scripts/start/openclaw.sh
 * When   every `docker run` and `docker compose run` in it is examined
 * Then   each one is either bounded by `with_timeout`, or named here as a
 *        deliberate exception with the reason it is allowed to wait.
 *
 * **This case replaces the one originally specified**, which was to reproduce the
 * hang itself. That was attempted on 2026-09-07 and abandoned as the wrong test:
 * the prompt sits behind two earlier checks, so provoking it needs a *valid
 * Claude login inside a throwaway container* — and a run of exactly that shape
 * had already overwritten the operator's credentials once that day. A test that
 * periodically risks the operator's login is not worth the finding. Worse, it
 * would assert upstream's behaviour rather than our protection against it: if
 * OpenClaw stopped prompting tomorrow the case would go red while nothing about
 * this stack had got better or worse.
 *
 * What actually protects the start is that our calls are bounded, and that is a
 * property of this file — deterministic, free, and true regardless of what
 * upstream does. The hang itself stays documented: it was observed for real and
 * is recorded verbatim in #11's commit message.
 *
 * The exceptions are the point of the design. Freezing "everything is bounded"
 * would have been false; listing what is not, and why, makes each one a decision
 * a reviewer can challenge — and makes any *new* unbounded call fail this test.
 *
 * Requirements covered: OC-G4, FEATURE-openclaw-2026-9-1.md §5.1.
 */
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';

const SCRIPT = 'config/scripts/start/openclaw.sh';

/**
 * Invocations that may wait without a bound, each with the reason.
 *
 * Matched against a window of lines around the call rather than the call line
 * itself: for a helper the `docker run` sits a few lines below the function name,
 * and two of these call lines are textually identical — `codex_cli` and
 * `grok_cli` differ only in their surroundings. Matching by line number instead
 * would rot the moment the file moves.
 */
const ALLOWED_UNBOUNDED: { match: string; why: string }[] = [
  {
    match: 'openclaw-cli onboard --non-interactive',
    why: 'First-run bootstrap. It creates the config the rest of the script patches, so there is nothing to fall back to if it is cut short; and it runs once per installation, never on an ordinary start.',
  },
  {
    match: '-v "${STATE_DIR}:/state" \\',
    why: 'The config writer. Local only, no network and no prompt: it reads a JSON file, edits it and writes it back. A bound here would add a failure mode without removing one.',
  },
  {
    match: 'docker run --rm ${docker_flags} "${CLAUDE_RUN_ARGS[@]}" "$@"',
    why: 'claude_cli, the deliberately unbounded sibling of claude_cli_bounded. It exists for the interactive sign-in, which must wait for the operator. Every non-interactive caller uses the bounded one.',
  },
  {
    match: 'copilot_cli() {',
    why: 'Helper definition. Its non-interactive caller, copilot_authed, is bounded; its interactive sign-in must wait.',
  },
  {
    match: 'codex_cli() {',
    why: 'Helper definition. Its non-interactive caller, codex_authed, is bounded; its interactive sign-in must wait.',
  },
  {
    match: 'grok_cli() {',
    why: 'Helper definition. Its non-interactive caller, grok_authed, is bounded; its interactive sign-in must wait.',
  },
];

const WINDOW = 4;

function dockerInvocations(): { line: number; text: string; context: string }[] {
  const lines = readFileSync(join(repoRoot, SCRIPT), 'utf8').split('\n');
  return lines
    .map((text, i) => ({
      line: i + 1,
      text,
      context: lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join('\n'),
    }))
    .filter(({ text }) => /(^|[^#\w])docker (run|compose run)\b/.test(text))
    // Lines inside an echo are guidance printed to the operator, not calls.
    .filter(({ text }) => !/^\s*(#|echo )/.test(text.trim()));
}

describe('OC-3 every unattended docker call in the start script is bounded', () => {
  test('the script really does contain calls to check', () => {
    // Guard against the whole case passing because a rename made the scan empty.
    expect(dockerInvocations().length).toBeGreaterThan(5);
  });

  test('each call is bounded, or is a named exception', () => {
    const offenders = dockerInvocations()
      .filter(({ text }) => !text.includes('with_timeout'))
      .filter(({ context }) => !ALLOWED_UNBOUNDED.some((e) => context.includes(e.match)))
      .map(({ line, text }) => `${SCRIPT}:${line}  ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  test('and every exception still exists — a stale allowance is a hole', () => {
    // An exception whose line has been deleted or rewritten would silently keep
    // permitting something that is no longer there, and would hide its successor.
    const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
    const stale = ALLOWED_UNBOUNDED.filter((e) => !body.includes(e.match)).map((e) => e.match);
    expect(stale).toEqual([]);
  });

  test('the timed helpers force-remove their container, because timeout does not', () => {
    // `timeout` kills the docker client; the container keeps running and keeps
    // holding the state directory. #11 recorded this, and a probe written on
    // 2026-09-07 fell into it anyway — a throwaway container outlived its own
    // timeout by five minutes.
    const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
    for (const fn of ['claude_cli_bounded', 'openclaw_migrate_state']) {
      const start = body.indexOf(`${fn}()`);
      expect(start).toBeGreaterThan(-1);
      const region = body.slice(start, start + 1400);
      expect(region).toContain('--name');
      expect(region).toContain('docker rm -f');
      expect(region).toContain('124');
    }
  });
});
