/**
 * OC-78 · Integration · A helper whose bound expires removes its container
 *
 * Purpose:  OC-61 and OC-3 read the three bounded helpers in
 *           config/scripts/start/openclaw.sh and hold that each names its
 *           container and calls `docker rm -f` on it. They hold that the removal
 *           is there, not when it runs. Measured on #17 on 2026-10-21: with each
 *           `if (( rc != 0 ))` turned into `if (( rc == 0 ))`, so that a
 *           container is removed only after a run that succeeded, all ten tests
 *           of `m-oc.bounded-runs` and `m-oc.bounded-calls` stayed green. An
 *           expired bound is exactly when the removal is needed: the client is
 *           killed, `--rm` never fires, and the container keeps the state, secret
 *           and plugin mounts. Recorded on #45.
 * Given:    The three helpers out of the shipped script --
 *           `claude_cli_bounded`, `register_anthropic_cli_profile` and
 *           `harness_cli` -- with `with_timeout` from its library, held to 3
 *           seconds and a 2-second grace; and a probe image built in the run,
 *           whose every entry point ignores SIGTERM and never exits.
 * When:     Each helper runs against the probe until its bound expires, and then,
 *           with nothing of the test's own removed in between, `docker ps -a` is
 *           asked for the name the helper gave its container.
 * Then:     Each helper reports the expiry with a non-zero status, and its
 *           container is gone.
 * Covers:   OC-78, OC-61's property, OC-G4
 * Negative: the three helpers, which remove what their expired run left.
 * Counterpart: the same bounded run without the helper's removal leaves its
 *           container running. Without it, a probe that exited on the signal would
 *           make the negatives pass with no removal at all.
 *
 * Test data: the probe's `/usr/local/bin/hang`, `#!/bin/sh` / `trap "" TERM INT` /
 * `while :; do sleep 1; done`, linked as `/usr/local/bin/openclaw-claude` and
 * `/usr/local/bin/script` -- the two entry points the helpers name -- and set as
 * the image's ENTRYPOINT for the third, built `FROM alpine` and tagged and
 * labelled per run. `harness_cli`'s label is `oc78`. The containers are named by
 * the helpers: `openclaw-claude-step-<pid>-<n>`, `openclaw-anthropic-profile-<pid>`
 * and `openclaw-oc78-<pid>-<n>`, read with the harness's own pid.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { containerName, fixtureLabels, throwawayTag } from '../lib/dashboardserver';

const SCRIPT = join(repoRoot, 'config/scripts/start/openclaw.sh');
const LIB = join(repoRoot, 'config/scripts/start/lib/with-timeout.sh');
const PROBE = throwawayTag('liquidupstart/oc78-probe:hang');
const BARE = containerName('lu-oc78-bare');

const work = mkdtempSync(join(tmpdir(), 'lu-oc78-'));

const HARNESS = `
set -u
source "$1"
LU_TIMEOUT_GRACE=2
# The helpers' own bounds are 60 to 240 seconds. Held to 3 here, through the
# real with_timeout, because what is under test is what happens after expiry.
eval "real_$(declare -f with_timeout)"
with_timeout() { shift; real_with_timeout 3 "$@"; }
eval "$(sed -n '/^  claude_cli_bounded() {/,/^  }/p;/^  register_anthropic_cli_profile() {/,/^  }/p;/^  harness_cli() {/,/^  }/p' "$2")"
OPENCLAW_IMAGE="$3"
CLAUDE_RUN_ARGS=(--entrypoint /usr/local/bin/openclaw-claude "$OPENCLAW_IMAGE")
W="$4"
STATE_DIR="$W/state"; SECRETS_DIR="$W/secrets"; CLAUDE_DIR="$W/claude"; PROJECT_DIR="$W/project"
mkdir -p "$STATE_DIR" "$SECRETS_DIR" "$CLAUDE_DIR" "$PROJECT_DIR/config/openclaw/plugins"
OAUTH_TOKEN=""
left() { docker ps -a --filter "name=$1" --format '{{.Names}}' | tr '\\n' ' '; }
claude_cli_bounded 60 ""; echo "claude rc=$? left=$(left "openclaw-claude-step-$$-")"
register_anthropic_cli_profile; echo "profile rc=$? left=$(left "openclaw-anthropic-profile-$$")"
BOUND_SECS=60 harness_cli oc78 ""; echo "harness rc=$? left=$(left "openclaw-oc78-$$-")"
shift 4
with_timeout 60 docker run --rm --init --name "$1" "\${@:2}" "$OPENCLAW_IMAGE"; echo "bare rc=$? left=$(left "$1")"
`;

let built = { code: -1, output: '' };
let out = '';
const line = (who: string) => out.match(new RegExp(`^${who} rc=(\\d+) left=(.*)$`, 'm'));

beforeAll(() => {
  const ctx = join(work, 'probe');
  mkdirSync(ctx);
  writeFileSync(
    join(ctx, 'Dockerfile'),
    [
      'FROM alpine',
      `RUN printf '#!/bin/sh\\ntrap "" TERM INT\\nwhile :; do sleep 1; done\\n' > /usr/local/bin/hang && chmod 755 /usr/local/bin/hang \\`,
      ' && ln -s hang /usr/local/bin/openclaw-claude && ln -s hang /usr/local/bin/script',
      'ENTRYPOINT ["/usr/local/bin/hang"]'
    ].join('\n')
  );
  built = sh(['docker', 'build', '-q', ...fixtureLabels(), '-t', PROBE, ctx]);
  if (built.code !== 0) return;
  const harness = join(work, 'harness.sh');
  writeFileSync(harness, HARNESS);
  out = sh(['bash', harness, LIB, SCRIPT, PROBE, join(work, 'w'), BARE, ...fixtureLabels()]).output;
}, 600_000);

afterAll(() => {
  // After every assertion has read what the helpers left, never before.
  sh(['docker', 'rm', '-f', BARE]);
  for (const prefix of ['openclaw-claude-step-', 'openclaw-anthropic-profile-', 'openclaw-oc78-']) {
    const ids = sh(['docker', 'ps', '-aq', '--filter', `ancestor=${PROBE}`, '--filter', `name=${prefix}`]).stdout.split('\n').filter(Boolean);
    if (ids.length) sh(['docker', 'rm', '-f', ...ids]);
  }
  sh(['docker', 'rmi', '-f', PROBE]);
  rmSync(work, { recursive: true, force: true });
});

describe('OC-78 a bounded helper removes the container its expired run left', () => {
  test('OC-78 the premise: the probe was built and every helper ran', () => {
    expect(built.code, built.output).toBe(0);
    expect(['claude', 'profile', 'harness', 'bare'].filter((w) => !line(w))).toEqual([]);
  });

  test.each([['claude_cli_bounded', 'claude'], ['register_anthropic_cli_profile', 'profile'], ['harness_cli', 'harness']])(
    'OC-78 %s reports the expiry and leaves no container behind',
    (_helper, who) => {
      const m = line(who);
      expect({ expired: m !== null && m[1] !== '0', left: m?.[2].trim() }).toEqual({ expired: true, left: '' });
    }
  );

  test('OC-78 the counterpart: the same bounded run without the removal leaves its container running', () => {
    const m = line('bare');
    expect({ expired: m !== null && m[1] !== '0', left: m?.[2].trim() }).toEqual({ expired: true, left: BARE });
  });
});
