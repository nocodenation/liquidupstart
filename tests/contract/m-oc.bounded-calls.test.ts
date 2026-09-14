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
 * When   every `docker run` and `docker compose run` in it is examined, and the
 *        body of `with_timeout` with it
 * Then   each call is either bounded by `with_timeout`, or named here as a
 *        deliberate exception with the reason it is allowed to wait — and every
 *        invocation inside `with_timeout` reads from `/dev/null`.
 *
 * **Bounded turned out not to be enough, on 2026-09-08.** The state migration
 * `docker compose run` was bounded, and the start still stopped dead for five
 * minutes with no output at all until somebody sent it `SIGCONT` by hand. GNU
 * `timeout` runs its command in its own process group, so the command is no
 * longer in the terminal's foreground group; `docker compose run` attaches
 * stdin; and a background process reading the terminal is stopped by `SIGTTIN`.
 * The call redirected stdout and stderr to `/dev/null` and left stdin attached.
 *
 * It only bites where GNU coreutils is installed, which is why it had never
 * shown up: without `timeout` on `PATH`, `with_timeout` runs the command in the
 * foreground group and nothing stops it. Whether the 600s bound would eventually
 * have fired against a *stopped* child was not measured — the process was
 * resumed after about five minutes — so the honest statement is that the bound
 * was never observed to save it.
 *
 * The fix is in `with_timeout` rather than at the call site, and the script's own
 * comments make the argument: every caller of it is by construction an unattended
 * step ("no unattended step may wait forever on input that cannot arrive"), and
 * the interactive siblings — `claude_cli`, `copilot_cli`, `codex_cli`, `grok_cli`
 * — deliberately do not go through it. Closing stdin is also better than the
 * bound it complements: the read returns EOF at once instead of stalling until a
 * timer kills it.
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
    //
    // Re-founded 2026-09-11. It used to require the literal `124` in each helper,
    // which is the circumstance rather than the property: N1 measured that a
    // bound docker run does not return 124 at all without --init, and that a
    // client killed any other way leaves the container too. The helpers now clean
    // up on any non-zero status, so asserting the magic number would have failed
    // a stricter fix. What must hold is that a named container is removed when
    // the run does not end by itself.
    //
    // harness_cli joined the list when the three byte-identical copilot, codex
    // and grok helpers were collapsed into it.
    const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
    for (const fn of ['claude_cli_bounded', 'openclaw_migrate_state', 'harness_cli']) {
      const start = body.indexOf(`${fn}()`);
      expect({ fn, found: start > -1 }).toEqual({ fn, found: true });
      const region = body.slice(start, start + 1400);
      expect({ fn, named: region.includes('--name') }).toEqual({ fn, named: true });
      expect({ fn, removes: region.includes('docker rm -f') }).toEqual({ fn, removes: true });
    }
  });

  test('with_timeout hands its command no terminal to read', () => {
    const body = readFileSync(join(repoRoot, SCRIPT), 'utf8');
    const start = body.indexOf('with_timeout() {');
    expect(start).toBeGreaterThan(-1);
    const end = body.indexOf('\n}', start);
    const invocations = body
      .slice(start, end)
      .split('\n')
      .filter((l) => /(timeout "\$secs"|^\s*"\$@")/.test(l));
    expect(invocations.length).toBe(3);
    expect(invocations.filter((l) => !l.includes('</dev/null'))).toEqual([]);
  });
});
