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
 *           `harness_cli` -- with `with_timeout` from its library, held to 5
 *           seconds and a 2-second grace; and a probe image built in the run,
 *           whose every entry point ignores SIGTERM and never exits.
 * When:     Each helper runs against the probe until its bound expires. A `docker`
 *           first on PATH records the name each `docker run` is given; during the
 *           bound the harness asks, every quarter second, whether a container of
 *           that name is up; and afterwards, with nothing of the test's own removed in between,
 *           `docker ps -a` is asked for exactly that name.
 * Then:     Each helper started its container under its own prefix and the
 *           harness's pid, the container
 *           was up, the helper reports the expiry with 124 or 137, and the
 *           container is gone.
 * Covers:   OC-78, OC-61's property, OC-G4
 * Negative: the three helpers, which remove what their expired run left.
 * Counterpart: the same bounded run without the helper's removal leaves its
 *           container running. Without it, a probe that exited on the signal would
 *           make the negatives pass with no removal at all. And the recorded name
 *           and the up check keep a helper that never started its container, or
 *           started it under another name, from passing as one that removed it.
 *
 * Test data: the probe's `/usr/local/bin/hang`, `#!/bin/sh` / `trap "" TERM INT` /
 * `while :; do sleep 1; done`, linked as `/usr/local/bin/openclaw-claude` and
 * `/usr/local/bin/script` -- the two entry points the helpers name -- and set as
 * the image's ENTRYPOINT for the third, built `FROM alpine` and tagged and
 * labelled per run. `harness_cli`'s label is `oc78`. The containers are named by
 * the helpers: `openclaw-claude-step-<pid>-<n>`, `openclaw-anthropic-profile-<pid>`
 * and `openclaw-oc78-<pid>-<n>`, `<pid>` being the harness's own, which it prints,
 * as the recording `docker` reads them from each
 * `docker run`, the bare run's `lu-oc78-bare-<run id>`; the statuses 124 and 137.
 *
 * Dependencies: docker, and `alpine` present or pullable. No stack and no OpenClaw
 * image. Without docker the case is red by design, as the other docker cases of
 * this tier are: it has nothing to measure without one.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
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
# The helpers' own bounds are 60 to 240 seconds. Held to 5 here, through the
# real with_timeout, because what is under test is what happens after expiry,
# and 5 leaves a busy docker time to have the container up before it.
eval "real_$(declare -f with_timeout)"
with_timeout() { shift; real_with_timeout 5 "$@"; }
echo "pid=$$"
eval "$(sed -n '/^  claude_cli_bounded() {/,/^  }/p;/^  register_anthropic_cli_profile() {/,/^  }/p;/^  harness_cli() {/,/^  }/p' "$2")"
OPENCLAW_IMAGE="$3"
CLAUDE_RUN_ARGS=(--entrypoint /usr/local/bin/openclaw-claude "$OPENCLAW_IMAGE")
W="$4"
STATE_DIR="$W/state"; SECRETS_DIR="$W/secrets"; CLAUDE_DIR="$W/claude"; PROJECT_DIR="$W/project"
mkdir -p "$STATE_DIR" "$SECRETS_DIR" "$CLAUDE_DIR" "$PROJECT_DIR/config/openclaw/plugins"
OAUTH_TOKEN=""
# The name each run gave docker, recorded by the docker first on PATH; whether
# that container was seen up during its bound; and whether it is there now.
nth() { sed -n "$1p" "$NAMES"; }
up() {
  local n="" i
  for i in $(seq 1 40); do n="$(nth "$(( $1 + 1 ))")"; [ -n "$n" ] && break; sleep 0.25; done
  [ -n "$n" ] || return 0
  # Asked again until seen, inside the bound and its grace: a container shows as
  # running about a second after its \`docker run\` starts, measured 1.2 s here.
  for i in $(seq 1 26); do
    docker ps -q --filter "name=^/\${n}$" | grep -q . && { echo "$n" > "$W/up.$2"; return 0; }
    sleep 0.25
  done
}
left() { docker ps -aq --filter "name=^/$1$" | tr '\\n' ' '; }
report() {  # report <who> <rc> <names before>
  local n; n="$(nth "$(( $3 + 1 ))")"
  echo "$1 rc=$2 named=$n up=$(cat "$W/up.$1" 2>/dev/null) left=$(left "$n")"
}
b=$(wc -l < "$NAMES"); up "$b" claude & claude_cli_bounded 60 ""; rc=$?; wait; report claude $rc $b
b=$(wc -l < "$NAMES"); up "$b" profile & register_anthropic_cli_profile; rc=$?; wait; report profile $rc $b
b=$(wc -l < "$NAMES"); up "$b" harness & BOUND_SECS=60 harness_cli oc78 ""; rc=$?; wait; report harness $rc $b
shift 4
b=$(wc -l < "$NAMES"); up "$b" bare & with_timeout 60 docker run --rm --init --name "$1" "\${@:2}" "$OPENCLAW_IMAGE"; rc=$?; wait; report bare $rc $b
`;

let built = { code: -1, output: '' };
let out = '';
const NAMES = join(work, 'names');
type Row = { rc: number; named: string; up: string; left: string };
const row = (who: string): Row | null => {
  const m = out.match(new RegExp(`^${who} rc=(\\d+) named=(\\S*) up=(\\S*) left=(.*)$`, 'm'));
  return m ? { rc: Number(m[1]), named: m[2], up: m[3], left: m[4].trim() } : null;
};
// A bound that expired: SIGTERM's 124, or `-k`'s kill, 137 -- either is the
// bound returning, as OC-60 holds.
const expired = (r: Row | null) => r !== null && (r.rc === 124 || r.rc === 137);

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
  // Every `docker run` passes through this first, which records the name it was
  // given and hands the call on unchanged.
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const real = sh(['sh', '-c', 'command -v docker']).stdout.trim();
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh\nif [ "$1" = run ]; then prev=; for a in "$@"; do [ "$prev" = --name ] && echo "$a" >> "$NAMES"; prev="$a"; done; fi\nexec '${real}' "$@"\n`,
    { mode: 0o755 }
  );
  writeFileSync(NAMES, '');
  out = sh(['bash', harness, LIB, SCRIPT, PROBE, join(work, 'w'), BARE, ...fixtureLabels()], undefined, {
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    NAMES
  }).output;
}, 600_000);

afterAll(() => {
  // After every assertion has read what the helpers left, never before: every
  // name a run was given, whatever it was, and anything else on the probe image.
  const named = existsSync(NAMES) ? readFileSync(NAMES, 'utf8').split('\n').filter(Boolean) : [];
  const onProbe = sh(['docker', 'ps', '-aq', '--filter', `ancestor=${PROBE}`]).stdout.split('\n').filter(Boolean);
  if (named.length || onProbe.length) sh(['docker', 'rm', '-f', BARE, ...named, ...onProbe]);
  sh(['docker', 'rmi', '-f', PROBE]);
  rmSync(work, { recursive: true, force: true });
}, 120_000);

describe('OC-78 a bounded helper removes the container its expired run left', () => {
  test('OC-78 the premise: the probe was built and every run reported', () => {
    expect(built.code, built.output).toBe(0);
    expect(['claude', 'profile', 'harness', 'bare'].filter((w) => !row(w))).toEqual([]);
  });

  test.each([
    ['claude_cli_bounded', 'claude', 'openclaw-claude-step-<pid>-'],
    ['register_anthropic_cli_profile', 'profile', 'openclaw-anthropic-profile-<pid>'],
    ['harness_cli', 'harness', 'openclaw-oc78-<pid>-']
  ])('OC-78 %s started its container, reports the expiry, and leaves that container behind no more', (_helper, who, prefix) => {
    const r = row(who);
    const pid = out.match(/^pid=(\d+)$/m)?.[1] ?? 'none';
    expect({
      expired: expired(r),
      named: r?.named.startsWith(prefix.replace('<pid>', pid)),
      up: r !== null && r.up === r.named,
      left: r?.left
    }).toEqual({ expired: true, named: true, up: true, left: '' });
  });

  test('OC-78 the counterpart: the same bounded run without the removal leaves its container running', () => {
    const r = row('bare');
    expect({ expired: expired(r), up: r?.up, left: r?.left }).toEqual({ expired: true, up: BARE, left: expect.stringMatching(/^[0-9a-f]+$/) });
  });
});
